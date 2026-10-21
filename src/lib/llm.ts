import "server-only";
import type { Settings } from "@prisma/client";
import type { EmbedMeta } from "@/lib/vector-store";
import { embedMetaKey } from "@/lib/vector-store";
import { BUILTIN_EMBED_META, hashEmbed } from "@/lib/local-embeddings";

export type ChatModelBundle = {
  model: unknown; // loose: LangChain chat model OR built-in adapter (both expose .stream)
  provider: "api" | "ollama" | "built-in";
  label: string;
};

/* ── Built-in Z.ai chat adapter (backend-only SDK) ───────────────────────── */

type LangChainLikeMessage = { _getType?: () => string; content: unknown };

let zaiInstance: Awaited<ReturnType<typeof createZai>> | null = null;

function createZai() {
  // SDK ships without types — dynamic import + loose typing
  return import("z-ai-web-dev-sdk").then((m: any) => (m as any).default.create());
}

async function getZai() {
  if (!zaiInstance) {
    zaiInstance = await createZai();
  }
  return zaiInstance;
}

function toSdkMessages(messages: LangChainLikeMessage[]) {
  type SdkMsg = { role: string; content: string };
  const out: SdkMsg[] = [];
  const push = (role: string, content: string) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n\n${content}`;
    else out.push({ role, content });
  };
  for (const m of messages) {
    const text = typeof m.content === "string" ? m.content : String(m.content ?? "");
    const type = m._getType?.();
    if (type === "system") push("assistant", text); // SDK uses assistant role for system prompts
    else if (type === "human") push("user", text);
    else push("assistant", text);
  }
  return out;
}

class BuiltInChat {
  async stream(messages: LangChainLikeMessage[]): Promise<AsyncIterable<{ content: string }>> {
    const zai = await getZai();
    const completion = await zai.chat.completions.create({
      messages: toSdkMessages(messages),
      thinking: { type: "disabled" },
    });
    const full: string = completion?.choices?.[0]?.message?.content ?? "";
    // Replay as pseudo-stream so the UI feels live (SDK is non-streaming).
    async function* replay() {
      const pieces = full.match(/\S+\s*/g) ?? [];
      let batch = "";
      for (let i = 0; i < pieces.length; i++) {
        batch += pieces[i];
        if (batch.length >= 24 || i === pieces.length - 1) {
          yield { content: batch };
          batch = "";
          await new Promise((r) => setTimeout(r, 12));
        }
      }
    }
    return replay();
  }
}

/* ── Factories ────────────────────────────────────────────────────────────── */

export async function getChatModel(settings: Settings): Promise<ChatModelBundle> {
  if (settings.llmProvider === "ollama") {
    const { ChatOllama } = await import("@langchain/ollama");
    return {
      model: new ChatOllama({
        baseUrl: settings.ollamaBaseUrl,
        model: settings.ollamaModel,
        temperature: 0.4,
      }),
      provider: "ollama",
      label: `ollama:${settings.ollamaModel}`,
    };
  }
  if (settings.llmProvider === "built-in") {
    return {
      model: new BuiltInChat(),
      provider: "built-in",
      label: "built-in:Z.ai",
    };
  }
  const { ChatOpenAI } = await import("@langchain/openai");
  return {
    model: new ChatOpenAI({
      model: settings.apiModel,
      apiKey: settings.apiKey || "missing-key",
      temperature: 0.4,
      streaming: true,
      timeout: 180_000,
      maxRetries: 1,
      configuration: { baseURL: settings.apiBaseUrl },
    }),
    provider: "api",
    label: `api:${settings.apiModel}`,
  };
}

export type EmbeddingBundle = {
  embeddings: {
    embedQuery: (text: string) => Promise<number[]>;
    embedDocuments: (texts: string[]) => Promise<number[][]>;
  };
  meta: EmbedMeta;
};

export async function getEmbeddings(settings: Settings): Promise<EmbeddingBundle> {
  if (settings.embeddingProvider === "built-in") {
    return {
      embeddings: {
        embedQuery: async (t) => hashEmbed(t),
        embedDocuments: async (texts) => texts.map((t) => hashEmbed(t)),
      },
      meta: { ...BUILTIN_EMBED_META },
    };
  }
  if (settings.embeddingProvider === "ollama") {
    const { OllamaEmbeddings } = await import("@langchain/ollama");
    const baseUrl = settings.ollamaBaseUrl;
    const embeddings = new OllamaEmbeddings({ model: settings.embeddingModel, baseUrl });
    return {
      embeddings: {
        embedQuery: (t) => embeddings.embedQuery(t),
        embedDocuments: (t) => embeddings.embedDocuments(t),
      },
      meta: { provider: "ollama", model: settings.embeddingModel, baseUrl },
    };
  }
  const { OpenAIEmbeddings } = await import("@langchain/openai");
  const baseUrl = settings.embeddingApiBaseUrl || settings.apiBaseUrl;
  const apiKey = settings.embeddingApiKey || settings.apiKey || "missing-key";
  const embeddings = new OpenAIEmbeddings({
    model: settings.embeddingModel,
    apiKey,
    timeout: 120_000,
    maxRetries: 1,
    configuration: { baseURL: baseUrl },
  });
  return {
    embeddings: {
      embedQuery: (t) => embeddings.embedQuery(t),
      embedDocuments: (t) => embeddings.embedDocuments(t),
    },
    meta: { provider: "api", model: settings.embeddingModel, baseUrl },
  };
}

export { embedMetaKey };

export function friendlyLlmError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/401|invalid[_ ]api[_ ]key|unauthorized/i.test(raw))
    return "The model API rejected the key (401). Check Base URL / API key in Settings.";
  if (/404|model.*not.*found|does not exist/i.test(raw))
    return "Model or endpoint not found (404). Check the model name and Base URL in Settings.";
  if (/429|rate.?limit|quota/i.test(raw))
    return "Rate limited / quota exceeded on the model API (429). Try again shortly.";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|timeout|aborted/i.test(raw))
    return "Could not reach the model endpoint. If using Ollama make sure it runs (`ollama serve`), otherwise check the Base URL.";
  return raw.slice(0, 400);
}
