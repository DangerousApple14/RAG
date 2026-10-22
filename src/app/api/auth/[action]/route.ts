import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  attachSessionCookie,
  clearSessionCookie,
  getCurrentUser,
  unauthorized,
  badRequest,
} from "@/lib/auth";
import { getOrCreateSettings } from "@/lib/settings";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { TERMS_VERSION } from "@/lib/legal";

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const MAX_PASSWORD_LEN = 128;

function tooMany(retryAfterSec: number) {
  return NextResponse.json(
    { error: `Too many attempts — try again in ${retryAfterSec}s` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;

  if (action === "logout") {
    return clearSessionCookie(NextResponse.json({ ok: true }));
  }

  // Brute-force protection: strict on auth endpoints
  const ip = clientIp(req);
  if (action === "register") {
    const rl = rateLimit(`reg:${ip}`, 5, 10 * 60_000);
    if (!rl.ok) return tooMany(rl.retryAfterSec);
  } else if (action === "login") {
    const rl = rateLimit(`login:${ip}`, 10, 5 * 60_000);
    if (!rl.ok) return tooMany(rl.retryAfterSec);
  } else {
    return badRequest("Unknown auth action");
  }

  let body: { username?: string; password?: string; acceptedToS?: boolean };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!USERNAME_RE.test(username)) {
    return badRequest("Username must be 3-32 chars (letters, numbers, . _ -)");
  }
  if (password.length < 4 || password.length > MAX_PASSWORD_LEN) {
    return badRequest(`Password must be 4-${MAX_PASSWORD_LEN} characters`);
  }

  if (action === "register") {
    // Commercial-grade minimum + legal acceptance gate
    if (password.length < 8) {
      return badRequest("Password must be at least 8 characters");
    }
    if (body.acceptedToS !== true) {
      return badRequest("You must accept the Terms of Service and Privacy Policy");
    }

    const existing = await db.user.findUnique({ where: { username } });
    if (existing) return NextResponse.json({ error: "Username already taken" }, { status: 409 });

    const user = await db.user.create({
      data: {
        username,
        password: hashPassword(password),
        tosAcceptedAt: new Date(),
        tosVersion: TERMS_VERSION,
      },
    });
    await getOrCreateSettings(user.id);
    const token = await createSessionToken(user.id, user.sessionEpoch);
    return attachSessionCookie(
      NextResponse.json({ user: { id: user.id, username: user.username } }),
      token
    );
  }

  if (action === "login") {
    const user = await db.user.findUnique({ where: { username } });
    // Same generic message + similar timing regardless of which factor failed
    if (!user || !verifyPassword(password, user.password)) {
      return NextResponse.json({ error: "Wrong username or password" }, { status: 401 });
    }
    const token = await createSessionToken(user.id, user.sessionEpoch);
    return attachSessionCookie(
      NextResponse.json({ user: { id: user.id, username: user.username } }),
      token
    );
  }

  return badRequest("Unknown auth action");
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (action !== "me") return badRequest("Unknown auth action");
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      tosVersion: user.tosVersion,
      tosAcceptedAt: user.tosAcceptedAt,
    },
  });
}
