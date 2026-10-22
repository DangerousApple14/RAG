import "server-only";
import { db } from "@/lib/db";
import { encryptText, decryptText, decryptTextSafe } from "@/lib/crypto";

/* Secrets are stored AES-256-GCM encrypted; in-memory copies are plaintext
   for calling the configured endpoints; API responses carry masked previews
   only — raw keys never travel back to the client. */

const SECRET_FIELDS = ["apiKey", "embeddingApiKey"] as const;

/** Decrypt secret fields for internal (server-side) use. */
export async function getOrCreateSettings(userId: string) {
  const existing = await db.settings.findUnique({ where: { userId } });
  const settings = existing ?? (await db.settings.create({ data: { userId } }));

  const out = { ...settings } as Record<string, unknown>;
  for (const field of SECRET_FIELDS) {
    const value = out[field];
    out[field] = typeof value === "string" && value !== "" ? decryptTextSafe(value, "") : "";
  }
  return out as typeof settings;
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
    "apiModel",
    "ollamaBaseUrl",
    "ollamaModel",
    "embeddingApiBaseUrl",
    "embeddingModel",
    "glmModel",
  ] as const) {
    const v = str(key);
    if (v !== undefined) data[key] = v;
  }

  /* API keys — secrets-safe update semantics:
     - non-empty string → replace (stored encrypted)
     - empty/undefined  → keep current (never wipe a key by re-saving the form)
     - explicit clear flag → wipe                                        */
  const apiKey = str("apiKey");
  if (apiKey) data.apiKey = encryptText(apiKey);
  if (body.clearApiKey === true) data.apiKey = "";

  const embeddingApiKey = str("embeddingApiKey");
  if (embeddingApiKey) data.embeddingApiKey = encryptText(embeddingApiKey);
  if (body.clearEmbeddingApiKey === true) data.embeddingApiKey = "";

  if (typeof body.ocrEnabled === "boolean") data.ocrEnabled = body.ocrEnabled;

  // normalize base URLs (strip trailing slash)
  if (typeof data.apiBaseUrl === "string") data.apiBaseUrl = (data.apiBaseUrl as string).replace(/\/+$/, "");
  if (typeof data.ollamaBaseUrl === "string") data.ollamaBaseUrl = (data.ollamaBaseUrl as string).replace(/\/+$/, "");
  if (typeof data.embeddingApiBaseUrl === "string")
    data.embeddingApiBaseUrl = (data.embeddingApiBaseUrl as string).replace(/\/+$/, "");

  await db.settings.update({ where: { userId }, data });
  // re-read so the response contains decrypted (maskable) values
  return getOrCreateSettings(userId);
}

function maskKey(value: string): { has: boolean; preview: string } {
  if (!value) return { has: false, preview: "" };
  return { has: true, preview: `••••${value.slice(-4)}` };
}

export function publicSettings(s: Awaited<ReturnType<typeof getOrCreateSettings>>) {
  const apiKey = maskKey(s.apiKey);
  const embeddingApiKey = maskKey(s.embeddingApiKey);
  return {
    llmProvider: s.llmProvider,
    apiBaseUrl: s.apiBaseUrl,
    apiModel: s.apiModel,
    ollamaBaseUrl: s.ollamaBaseUrl,
    ollamaModel: s.ollamaModel,
    embeddingProvider: s.embeddingProvider,
    embeddingApiBaseUrl: s.embeddingApiBaseUrl,
    embeddingModel: s.embeddingModel,
    ocrEnabled: s.ocrEnabled,
    ocrEngine: s.ocrEngine,
    glmModel: s.glmModel,
    // masked secrets — raw keys never leave the server
    hasApiKey: apiKey.has,
    apiKeyPreview: apiKey.preview,
    hasEmbeddingApiKey: embeddingApiKey.has,
    embeddingApiKeyPreview: embeddingApiKey.preview,
  };
}

export type PublicSettings = ReturnType<typeof publicSettings>;
