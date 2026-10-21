import "server-only";
import { db } from "@/lib/db";

export async function getOrCreateSettings(userId: string) {
  const existing = await db.settings.findUnique({ where: { userId } });
  if (existing) return existing;
  return db.settings.create({ data: { userId } });
}

const PROVIDERS = new Set(["api", "ollama", "built-in"]);
const OCR_ENGINES = new Set(["glm", "paddle"]);

export async function updateSettings(userId: string, body: Record<string, unknown>) {
  const current = await getOrCreateSettings(userId);
  const str = (key: string): string | undefined => {
    const v = body[key];
    if (v === null || v === undefined) return undefined;
    return String(v).trim();
  };

  const data: Record<string, unknown> = {};

  const llmProvider = str("llmProvider");
  if (llmProvider !== undefined && PROVIDERS.has(llmProvider)) data.llmProvider = llmProvider;

  const embeddingProvider = str("embeddingProvider");
  if (embeddingProvider !== undefined && PROVIDERS.has(embeddingProvider)) data.embeddingProvider = embeddingProvider;

  const ocrEngine = str("ocrEngine");
  if (ocrEngine !== undefined && OCR_ENGINES.has(ocrEngine)) data.ocrEngine = ocrEngine;

  for (const key of [
    "apiBaseUrl",
    "apiKey",
    "apiModel",
    "ollamaBaseUrl",
    "ollamaModel",
    "embeddingApiBaseUrl",
    "embeddingApiKey",
    "embeddingModel",
    "glmModel",
  ] as const) {
    const v = str(key);
    if (v !== undefined) data[key] = v;
  }

  // Explicitly empty overrides mean "clear me → fall back to Model tab credentials"
  for (const key of ["embeddingApiBaseUrl", "embeddingApiKey"] as const) {
    if (body[key] === null || body[key] === "" || data[key] === "") data[key] = "";
  }

  if (typeof body.ocrEnabled === "boolean") data.ocrEnabled = body.ocrEnabled;

  // normalize base URLs (strip trailing slash)
  if (typeof data.apiBaseUrl === "string") data.apiBaseUrl = (data.apiBaseUrl as string).replace(/\/+$/, "");
  if (typeof data.ollamaBaseUrl === "string") data.ollamaBaseUrl = (data.ollamaBaseUrl as string).replace(/\/+$/, "");
  if (typeof data.embeddingApiBaseUrl === "string")
    data.embeddingApiBaseUrl = (data.embeddingApiBaseUrl as string).replace(/\/+$/, "");

  return db.settings.update({ where: { userId }, data });
}

export function publicSettings(s: Awaited<ReturnType<typeof getOrCreateSettings>>) {
  return {
    llmProvider: s.llmProvider,
    apiBaseUrl: s.apiBaseUrl,
    apiKey: s.apiKey,
    apiModel: s.apiModel,
    ollamaBaseUrl: s.ollamaBaseUrl,
    ollamaModel: s.ollamaModel,
    embeddingProvider: s.embeddingProvider,
    embeddingApiBaseUrl: s.embeddingApiBaseUrl,
    embeddingApiKey: s.embeddingApiKey,
    embeddingModel: s.embeddingModel,
    ocrEnabled: s.ocrEnabled,
    ocrEngine: s.ocrEngine,
    glmModel: s.glmModel,
  };
}

export type PublicSettings = ReturnType<typeof publicSettings>;
