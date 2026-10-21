import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getOrCreateSettings } from "@/lib/settings";
import { getChatModel, getEmbeddings, embedMetaKey, friendlyLlmError } from "@/lib/llm";
import { getChunkCount, getEmbedMeta, search } from "@/lib/vector-store";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";

const RAG_K = 6;
const RAG_MIN_SCORE = 0.22; // friendly to the offline hashed embedder; API embeddings score much higher
const HISTORY_TURNS = 12;

function sse(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

function chunkText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? String((part as { text: string }).text)
          : ""
      )
      .join("");
  }
  return "";
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  let body: { conversationId?: string | null; message?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "Message is empty" }), { status: 400 });
  }

  // Resolve or create the conversation
  let conversation;
  if (body.conversationId) {
    conversation = await db.conversation.findFirst({
      where: { id: body.conversationId, userId: user.id },
    });
    if (!conversation) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }
  } else {
    conversation = await db.conversation.create({
      data: { userId: user.id, title: message.slice(0, 60) },
    });
  }

  const settings = await getOrCreateSettings(user.id);

  // History BEFORE the new message + persist the new user message
  const history = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
  });
  const trimmed = history.slice(-HISTORY_TURNS);
  await db.message.create({
    data: { conversationId: conversation.id, role: "user", content: message },
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(sse(obj));
        } catch {
          // client gone
        }
      };

      send({ type: "meta", conversationId: conversation.id, title: conversation.title });

      let assistantText = "";
      try {
        /* ── RAG retrieval ─────────────────────────────────── */
        let contextBlocks: string[] = [];
        let sources: { docId: string; docName: string; page: number; score: number }[] = [];
        let retrievalNote = "";

        const total = getChunkCount(user.id);
        if (total > 0) {
          const storedMeta = getEmbedMeta(user.id);
          const { embeddings, meta } = await getEmbeddings(settings);
          const mismatch = !storedMeta || embedMetaKey(storedMeta) !== embedMetaKey(meta);

          if (mismatch) {
            retrievalNote =
              "\n\n(NOTE: the knowledge base was indexed with a different embedding model than the current settings, so document context was not used for this answer. Re-upload documents or restore the previous embedding settings to use RAG.)";
          } else {
            const queryVector = await embeddings.embedQuery(message);
            const { hits } = search(user.id, queryVector, RAG_K, RAG_MIN_SCORE);
            contextBlocks = hits.map(
              (h, i) => `[${i + 1}] ${h.docName} · page ${h.page}\n${h.text}`
            );
            sources = hits.map(({ docId, docName, page, score }) => ({ docId, docName, page, score }));
          }
        }

        /* ── Prompt ────────────────────────────────────────── */
        const systemParts = [
          "You are Midnight Garage, a sharp and dependable document assistant.",
          contextBlocks.length > 0
            ? "Answer the user's question using the CONTEXT below. Cite sources inline like [1], [2]. If the context is insufficient, say so plainly and then answer from general knowledge, clearly separated."
            : "No documents are currently indexed for this conversation — answer from general knowledge.",
          "Use clean markdown. Be concise but complete.",
        ];
        if (retrievalNote) systemParts.push(retrievalNote.trim());

        const messages: (SystemMessage | HumanMessage | AIMessage)[] = [
          new SystemMessage(
            contextBlocks.length > 0
              ? `${systemParts.join(" ")}\n\n━━━ CONTEXT ━━━\n${contextBlocks.join("\n\n━━━")}`
              : systemParts.join(" ")
          ),
          ...trimmed.map((m) =>
            m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
          ),
          new HumanMessage(message),
        ];

        /* ── Stream the answer ─────────────────────────────── */
        const { model } = await getChatModel(settings);
        const chatModel = model as {
          stream: (msgs: unknown) => Promise<AsyncIterable<{ content: unknown }>>;
        };
        const responseStream = await chatModel.stream(messages);
        for await (const chunk of responseStream) {
          const token = chunkText(chunk.content);
          if (token) {
            assistantText += token;
            send({ type: "token", content: token });
          }
        }

        /* ── Persist + finish ──────────────────────────────── */
        const saved = await db.message.create({
          data: {
            conversationId: conversation.id,
            role: "assistant",
            content: assistantText || "(empty response)",
            sources: sources.length > 0 ? JSON.stringify(sources) : null,
          },
        });
        await db.conversation.update({
          where: { id: conversation.id },
          data: { updatedAt: new Date() },
        });
        send({ type: "done", sources, messageId: saved.id });
      } catch (err) {
        console.error("[chat] failed:", err);
        if (assistantText.length > 0) {
          // partial answer already streamed — report the tail failure inline
          send({ type: "token", content: `\n\n⚠️ Stream interrupted: ${friendlyLlmError(err)}` });
          send({ type: "done", sources: [], messageId: "partial" });
        } else {
          send({ type: "error", message: friendlyLlmError(err) });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
