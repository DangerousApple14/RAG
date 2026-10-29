import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";
import { encryptText, decryptText } from "@/lib/crypto";
import { VECTORS_DIR } from "@/lib/paths";

/**
 * Minimal, dependency-free vector index persisted as JSON per user.
 *
 * IMPORTANT: deliberately STATELESS — every call reads the file from disk.
 * In Next.js, separate route bundles get separate module instances, so
 * module-level caches go stale across routes. Local disk reads are cheap;
 * correctness wins. Writes are atomic (tmp file + rename).
 */

export type VectorItem = {
  id: string;
  docId: string;
  text: string;
  vector: number[];
  meta: { docName: string; page: number };
};

export type EmbedMeta = { provider: string; model: string; baseUrl: string };

type StoreData = {
  embedMeta: EmbedMeta | null;
  items: VectorItem[];
};

function filePath(userId: string) {
  return path.join(VECTORS_DIR, `${userId}.json`);
}

function load(userId: string): StoreData {
  try {
    if (existsSync(filePath(userId))) {
      // file is encrypted at rest (AES-256-GCM); legacy plaintext files are
      // still readable and get re-encrypted on the next persist
      const raw = decryptText(readFileSync(filePath(userId), "utf8"));
      if (raw !== null) {
        const data = JSON.parse(raw) as StoreData;
        if (Array.isArray(data.items)) return data;
      }
    }
  } catch {
    // corrupted file → start fresh
  }
  return { embedMeta: null, items: [] };
}

function persist(userId: string, data: StoreData) {
  mkdirSync(VECTORS_DIR, { recursive: true });
  const tmp = `${filePath(userId)}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, encryptText(JSON.stringify(data)));
  renameSync(tmp, filePath(userId));
}

export function embedMetaKey(meta: EmbedMeta): string {
  return `${meta.provider}::${meta.model}::${meta.baseUrl}`;
}

export function getEmbedMeta(userId: string): EmbedMeta | null {
  return load(userId).embedMeta;
}

export function getChunkCount(userId: string, docId?: string): number {
  const data = load(userId);
  return docId ? data.items.filter((i) => i.docId === docId).length : data.items.length;
}

export function addChunks(
  userId: string,
  docId: string,
  docName: string,
  chunks: { text: string; page: number; vector: number[] }[],
  embedMeta: EmbedMeta
): void {
  const data = load(userId);
  // drop anything previously indexed for this doc (re-upload case)
  data.items = data.items.filter((i) => i.docId !== docId);
  for (const c of chunks) {
    data.items.push({
      id: `${docId}:${data.items.length}`,
      docId,
      text: c.text,
      vector: c.vector,
      meta: { docName, page: c.page },
    });
  }
  data.embedMeta = embedMeta;
  persist(userId, data);
}

export function deleteDoc(userId: string, docId: string): void {
  const data = load(userId);
  data.items = data.items.filter((i) => i.docId !== docId);
  if (data.items.length === 0) data.embedMeta = null;
  persist(userId, data);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const SEARCH_STOP_WORDS = new Set([
  "a",
  "about",
  "all",
  "an",
  "and",
  "are",
  "can",
  "could",
  "document",
  "file",
  "for",
  "from",
  "give",
  "in",
  "into",
  "it",
  "me",
  "of",
  "on",
  "please",
  "pdf",
  "show",
  "some",
  "summarize",
  "summary",
  "the",
  "this",
  "to",
  "with",
  "riassumi",
  "riassunto",
  "documento",
  "per",
  "del",
  "della",
  "di",
  "il",
  "lo",
  "la",
  "un",
  "una",
]);

function searchTerms(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (term) => term.length > 1 && !SEARCH_STOP_WORDS.has(term)
    )
  );
}

function termOverlap(queryTerms: Set<string>, text: string): number {
  if (queryTerms.size === 0) return 0;
  const textTerms = searchTerms(text);
  let matches = 0;
  for (const term of queryTerms) {
    if (textTerms.has(term)) matches++;
  }
  return matches / queryTerms.size;
}

export type SearchHit = { docId: string; docName: string; page: number; score: number; text: string };

export function search(
  userId: string,
  queryVector: number[],
  k = 6,
  minScore = 0.25,
  queryText = ""
): { hits: SearchHit[]; total: number } {
  const data = load(userId);
  if (data.items.length === 0) return { hits: [], total: 0 };
  const queryTerms = searchTerms(queryText);
  const scored = data.items.map((item) => ({
    item,
    score: cosine(queryVector, item.vector),
    textMatch: termOverlap(queryTerms, item.text),
    nameMatch: termOverlap(queryTerms, item.meta.docName),
  }));
  const filenameMatches = scored.filter((entry) => entry.nameMatch > 0);
  const semanticMatches = scored.filter((entry) => entry.score >= minScore);
  const lexicalMatches = scored.filter((entry) => entry.textMatch > 0);
  const results =
    filenameMatches.length > 0
      ? filenameMatches.sort((a, b) => b.nameMatch - a.nameMatch || b.score - a.score)
      : semanticMatches.length > 0
        ? semanticMatches.sort((a, b) => b.score - a.score)
        : lexicalMatches.length > 0
          ? lexicalMatches.sort((a, b) => b.textMatch - a.textMatch || b.score - a.score)
          : scored.sort((a, b) => b.score - a.score);
  const selected = results.slice(0, k);
  return {
    hits: selected.map(({ item, score }) => ({
      docId: item.docId,
      docName: item.meta.docName,
      page: item.meta.page,
      score: Math.round(score * 1000) / 1000,
      text: item.text,
    })),
    total: data.items.length,
  };
}
