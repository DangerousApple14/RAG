import "server-only";
import type { EmbedMeta } from "@/lib/vector-store";

/**
 * Built-in, dependency-free embedding: hashed n-gram features.
 *
 * Deterministic hashing embedding (a la "hashing trick"):
 *  - 256-dimensional dense vector
 *  - features = individual words + adjacent word bigrams (Unicode-aware)
 *  - 32-bit FNV-1a hash picks the bucket, top bit picks the sign
 *  - linear term frequency (each occurrence votes once)
 *  - L2-normalized output so cosine similarity works out of the box
 *
 * STABILITY: the meta below (`hashed-ngrams-256-v1`) is part of the vector
 * index identity. If you change ANYTHING about the hashing/normalization
 * here, bump the model string — otherwise old vectors and new vectors
 * become incomparable and search quality silently degrades.
 */

export const BUILTIN_EMBED_META: EmbedMeta = {
  provider: "built-in",
  model: "hashed-ngrams-256-v1",
  baseUrl: "",
};

const DIMS = 256;

/** 32-bit FNV-1a. Math.imul keeps the multiply exact in int32 space. */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Unicode-aware word tokens, lowercased. */
function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Embed text into a 256-dim unit vector.
 * Same function is used for queries and documents — no asymmetry.
 */
export function hashEmbed(text: string): number[] {
  const vec = new Array<number>(DIMS).fill(0);

  const tokens = words(text);
  const features: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    features.push(tokens[i]);
    if (i + 1 < tokens.length) features.push(`${tokens[i]} ${tokens[i + 1]}`);
  }

  for (const f of features) {
    const h = fnv1a(f);
    const idx = h % DIMS;
    const sign = h & 0x80000000 ? -1 : 1;
    vec[idx] += sign;
  }

  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < DIMS; i++) vec[i] /= norm;
  }

  return vec;
}
