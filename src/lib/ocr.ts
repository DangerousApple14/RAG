import "server-only";

/**
 * OCR engine adapters.
 *  - "glm"    → GLM-OCR vision model served by a local Ollama instance
 *  - "paddle" → PaddleOCR via ppu-paddle-ocr (local ONNX runtime, auto-downloads weights)
 *
 * Both are lazily imported so the app still boots if they're not installed.
 */

const GLM_PROMPT =
  "Transcribe this document page into clean plain text. Preserve the original reading order, " +
  "headings and paragraph breaks. Reproduce tables row by row. Do not summarize, do not add " +
  "commentary — output ONLY the transcribed page content.";

/* ── GLM-OCR (Ollama) ──────────────────────────────────────── */
export async function ocrWithGlm(
  image: Buffer,
  ollamaBaseUrl: string,
  model: string
): Promise<string> {
  const { Ollama } = await import("ollama");
  const client = new Ollama({ host: ollamaBaseUrl });
  const response = await client.chat(
    {
      model: model || "glm-ocr",
      messages: [
        {
          role: "user",
          content: GLM_PROMPT,
          images: [image.toString("base64")],
        },
      ],
    },
    { signal: AbortSignal.timeout(180_000) }
  );
  const text = response?.message?.content?.trim();
  if (!text) throw new Error("GLM-OCR returned empty output");
  return text;
}

/* ── PaddleOCR (local ONNX) ────────────────────────────────── */
type PaddleService = {
  initialize: () => Promise<void>;
  recognize: (input: unknown) => Promise<{ text?: string; lines?: unknown[] }>;
  destroy?: () => Promise<void>;
};

let paddleSingleton: PaddleService | null = null;
let paddleInitPromise: Promise<PaddleService> | null = null;

async function getPaddle(): Promise<PaddleService> {
  if (paddleSingleton) return paddleSingleton;
  if (!paddleInitPromise) {
    paddleInitPromise = (async () => {
      const mod = (await import("ppu-paddle-ocr")) as unknown as {
        PaddleOcrService: new () => PaddleService;
      };
      const service = new mod.PaddleOcrService();
      await service.initialize();
      paddleSingleton = service;
      return service;
    })().catch((err) => {
      paddleInitPromise = null;
      throw err;
    });
  }
  return paddleInitPromise;
}

export async function ocrWithPaddle(image: Buffer): Promise<string> {
  const service = await getPaddle();
  const result = await service.recognize(new Uint8Array(image));
  const text = (result?.text ?? "").trim();
  if (!text) throw new Error("PaddleOCR returned empty output");
  return text;
}

/* ── Dispatch + availability ───────────────────────────────── */
export async function runOcr(
  engine: "glm" | "paddle",
  image: Buffer,
  opts: { ollamaBaseUrl: string; glmModel: string }
): Promise<string> {
  if (engine === "paddle") return ocrWithPaddle(image);
  return ocrWithGlm(image, opts.ollamaBaseUrl, opts.glmModel);
}

export async function paddleAvailable(): Promise<boolean> {
  try {
    await import("ppu-paddle-ocr");
    return true;
  } catch {
    return false;
  }
}

export async function ollamaReachable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
