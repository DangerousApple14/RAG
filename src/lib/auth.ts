import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { DATA_DIR } from "@/lib/paths";

const SESSION_COOKIE = "rag_session";
const SESSION_DAYS = 30;
const SECRET_FILE = path.join(DATA_DIR, "auth-secret.key");

let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  try {
    if (!existsSync(SECRET_FILE)) {
      mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
      writeFileSync(SECRET_FILE, randomBytes(48).toString("hex"), { mode: 0o600 });
    }
    cachedSecret = new TextEncoder().encode(readFileSync(SECRET_FILE, "utf8").trim());
  } catch {
    // ultimate fallback — still random per boot
    cachedSecret = new TextEncoder().encode(randomBytes(48).toString("hex"));
  }
  return cachedSecret;
}

/* ── Passwords (scrypt, zero deps) ─────────────────────────── */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/* ── JWT session ───────────────────────────────────────────── */
export async function createSessionToken(userId: string, epoch: number): Promise<string> {
  return new SignJWT({ sub: userId, epoch })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

async function payloadFromToken(token: string): Promise<{ sub: string; epoch: number } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sub !== "string") return null;
    return { sub: payload.sub, epoch: typeof payload.epoch === "number" ? payload.epoch : -1 };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await payloadFromToken(token);
  if (!payload) return null;
  try {
    const user = await db.user.findUnique({ where: { id: payload.sub } });
    // epoch mismatch = revoked (account deleted, password reset, logout-everywhere)
    if (!user || user.sessionEpoch !== payload.epoch) return null;
    return user;
  } catch {
    return null;
  }
}

/** Invalidate every outstanding session for a user (call after security events). */
export async function bumpSessionEpoch(userId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { sessionEpoch: true } });
  if (!user) return;
  await db.user.update({ where: { id: userId }, data: { sessionEpoch: user.sessionEpoch + 1 } });
}

export function attachSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

/* ── Guard helpers ─────────────────────────────────────────── */
export function unauthorized() {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
