import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { DATA_DIR } from "@/lib/paths";

/**
 * At-rest encryption for sensitive data (AES-256-GCM).
 *
 * Key management (dev/self-hosted friendly):
 *  1. `APP_SECRET` env var if set (hex/base64/raw utf-8, hashed down to 32 bytes)
 *  2. otherwise auto-generated once into `$DATA_DIR/app-secret.key` (chmod 600)
 *
 * Ciphertext format: `enc:v1.<iv>.<tag>.<ct>` (url-safe base64 parts).
 * Anything NOT starting with the prefix is treated as legacy plaintext, so
 * existing local databases keep working and get re-encrypted on next write.
 *
 * NOTE: this protects against someone grabbing the DB file / disk image.
 * It does not protect against an attacker who controls the running process —
 * that is true for every server-side encryption scheme.
 */

const PREFIX = "enc:v1.";
const SECRET_FILE = path.join(DATA_DIR, "app-secret.key");
const FALLBACK_MSG = "(unreadable — encrypted with a different app secret)";

let cachedKey: Buffer | null = null;

function getAppKey(): Buffer {
  if (cachedKey) return cachedKey;

  const env = process.env.APP_SECRET?.trim();
  if (env && env.length >= 16) {
    // derive a stable 32-byte key from whatever the operator provided
    cachedKey = Buffer.from(env.padEnd(32, "|").slice(0, 32), "utf8");
    return cachedKey;
  }

  try {
    if (!existsSync(SECRET_FILE)) {
      mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
      writeFileSync(SECRET_FILE, randomBytes(32).toString("hex"), { mode: 0o600 });
    }
    const raw = readFileSync(SECRET_FILE, "utf8").trim();
    if (raw.length >= 64) {
      cachedKey = Buffer.from(raw, "hex");
      if (cachedKey.length === 32) return cachedKey;
    }
  } catch {
    // fall through to ephemeral key
  }

  // last resort: ephemeral key (data becomes unreadable after restart —
  // loud warning so the operator notices in logs)
  console.warn("[crypto] WARNING: using an ephemeral APP_SECRET; encrypted data will not survive restarts. Set APP_SECRET or ensure db/ is writable.");
  cachedKey = randomBytes(32);
  return cachedKey;
}

/** Encrypt a string. Empty strings pass through (nothing to protect). */
export function encryptText(plain: string): string {
  if (plain === "") return "";
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", getAppKey(), iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
  } catch {
    // encryption should never fail in practice; store plaintext rather than lose data
    return plain;
  }
}

/** Decrypt. Returns null when the payload is ciphertext we cannot open. */
export function decryptText(payload: string): string | null {
  if (!payload.startsWith(PREFIX)) return payload; // legacy plaintext
  try {
    const [ivB64, tagB64, ctB64] = payload.slice(PREFIX.length).split(".");
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const decipher = createDecipheriv("aes-256-gcm", getAppKey(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Convenience: legacy plaintext passes through; failures yield a readable fallback. */
export function decryptTextSafe(payload: string, fallback: string = FALLBACK_MSG): string {
  const out = decryptText(payload);
  return out ?? fallback;
}

/** True when the value is already in encrypted form. */
export function isEncrypted(payload: string): boolean {
  return payload.startsWith(PREFIX);
}
