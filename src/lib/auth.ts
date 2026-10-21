import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { db } from "@/lib/db";

const SESSION_COOKIE = "rag_session";
const SESSION_DAYS = 30;
const SECRET_FILE = path.join(process.cwd(), "db", "auth-secret.key");

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
export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

async function userIdFromToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await userIdFromToken(token);
  if (!userId) return null;
  try {
    return await db.user.findUnique({ where: { id: userId } });
  } catch {
    return null;
  }
}

export function attachSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // local app
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
