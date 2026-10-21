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

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;

  if (action === "logout") {
    return clearSessionCookie(NextResponse.json({ ok: true }));
  }

  let body: { username?: string; password?: string };
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
  if (password.length < 4) {
    return badRequest("Password must be at least 4 characters");
  }

  if (action === "register") {
    const existing = await db.user.findUnique({ where: { username } });
    if (existing) return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    const user = await db.user.create({
      data: { username, password: hashPassword(password) },
    });
    await getOrCreateSettings(user.id);
    const token = await createSessionToken(user.id);
    return attachSessionCookie(
      NextResponse.json({ user: { id: user.id, username: user.username } }),
      token
    );
  }

  if (action === "login") {
    const user = await db.user.findUnique({ where: { username } });
    if (!user || !verifyPassword(password, user.password)) {
      return NextResponse.json({ error: "Wrong username or password" }, { status: 401 });
    }
    const token = await createSessionToken(user.id);
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
  return NextResponse.json({ user: { id: user.id, username: user.username } });
}
