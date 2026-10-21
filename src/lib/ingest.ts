import "server-only";
import path from "path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { db } from "@/lib/db";
import { getEmbeddings, embedMetaKey } from "@/lib/llm";
import { addChunks } from "@/lib/vector-store";
import { runOcr } from "@/lib/ocr";
import type { Settings } from "@prisma/client";

/** Serializes heavy ingest work per user (one file at a time, OCR friendly). */
const queues = new Map<string, Promise<void>>();

export function enqueueIngest(userId: string, task: () => Promise<void>): void {
  const prev = queues.get(userId) ?? Promise.resolve();
  const next = prev.then(task, task);
  queues.set(userId, next);
  next.finally(() => {
    if (queues.get(userId) === next) queues.delete(userId);
  });
}

type PageText = { page: number; text: string };

const MIN_TEXT_PER_PAGE = 24; // below this a PDF page is considered "scanned"

async function pdfPages(buffer: Buffer, settings: Settings): Promise<PageText[]> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as {
    getDocument: (src: Record<string, unknown>) => {
      promise: Promise<PdfDocument>;
    };
  };

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
    standardFontDataUrl: pathToStandardFonts(),
  }).promise;

  const pages: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => (typeof it === "object" && it !== null && "str" in it ? String((it as { str: string }).str) : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length >= MIN_TEXT_PER_PAGE || !settings.ocrEnabled) {
      pages.push({ page: p, text });
      continue;
    }

    // Scanned page → render to PNG and hand to the selected OCR engine
    try {
      const png = await renderPageToPng(page, 2.0);
      const ocrText = await runOcr(settings.ocrEngine as "glm" | "paddle", png, {
        ollamaBaseUrl: settings.ollamaBaseUrl,
        glmModel: settings.glmModel,
      });
      pages.push({ page: p, text: ocrText });
    } catch (ocrErr) {
      console.error(`[ingest] OCR failed on page ${p}:`, ocrErr);
      pages.push({ page: p, text });
    }
  }
  return pages;
}

function pathToStandardFonts(): string {
  // pdf.js requires the trailing slash on this URL
  return path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts") + path.sep;
}

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy?: () => Promise<void>;
};

type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<{ items: unknown[] }>;
  render: (o: Record<string, unknown>) => { promise: Promise<void> };
  cleanup?: () => void;
};

async function renderPageToPng(page: PdfPage, scale: number): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toBuffer("image/png");
}

async function imagePages(buffer: Buffer, settings: Settings): Promise<PageText[]> {
  if (!settings.ocrEnabled) {
    throw new Error(
      "Image uploads need OCR — enable it in Settings → OCR (GLM-OCR via Ollama or PaddleOCR), then re-upload."
    );
  }
  const text = await runOcr(settings.ocrEngine as "glm" | "paddle", buffer, {
    ollamaBaseUrl: settings.ollamaBaseUrl,
    glmModel: settings.glmModel,
  });
  return [{ page: 1, text }];
}

export async function processDocument(
  userId: string,
  docId: string,
  file: { name: string; buffer: Buffer; kind: "pdf" | "image" },
  settings: Settings
): Promise<void> {
  try {
    const pages = file.kind === "pdf" ? await pdfPages(file.buffer, settings) : await imagePages(file.buffer, settings);

    const usable = pages.filter((p) => p.text.trim().length > 0);
    if (usable.length === 0) {
      throw new Error(
        settings.ocrEnabled
          ? "No text could be extracted (OCR produced nothing for this file)."
          : "No text layer found. This looks like a scanned document — enable OCR in Settings and re-upload."
      );
    }

    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1200, chunkOverlap: 200 });
    const docs = await splitter.createDocuments(
      usable.map((p) => p.text),
      usable.map((p) => ({ page: p.page }))
    );

    const { embeddings, meta } = await getEmbeddings(settings);
    const vectors = await embeddings.embedDocuments(docs.map((d) => d.pageContent));

    addChunks(
      userId,
      docId,
      file.name,
      docs.map((d, i) => ({
        text: d.pageContent,
        page: Number(d.metadata?.page ?? 1),
        vector: vectors[i],
      })),
      meta
    );

    await db.document.update({
      where: { id: docId },
      data: {
        status: "ready",
        pages: pages.length,
        chunkCount: docs.length,
        error: null,
      },
    });
    console.log(`[ingest] ready: ${file.name} → ${pages.length} pages, ${docs.length} chunks (${embedMetaKey(meta)})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest] failed for ${file.name}:`, message);
    await db.document
      .update({ where: { id: docId }, data: { status: "error", error: message.slice(0, 500) } })
      .catch(() => undefined);
  }
}

export function kindForFile(name: string, mime: string): "pdf" | "image" | null {
  const lower = name.toLowerCase();
  if (mime === "application/pdf" || lower.endsWith(".pdf")) return "pdf";
  if (
    mime.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"].some((ext) => lower.endsWith(ext))
  ) {
    return "image";
  }
  return null;
}
