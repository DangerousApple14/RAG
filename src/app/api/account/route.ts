import { NextRequest, NextResponse } from "next/server";
import { unlinkSync, existsSync } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { getCurrentUser, verifyPassword, clearSessionCookie, unauthorized } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * DELETE /api/account — full account erasure (GDPR Art. 17 style).
 * Requires password re-confirmation. Cascades: settings, documents,
 * conversations + messages (Prisma onDelete: Cascade) and the user's
 * encrypted vector index on disk.
 */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  const rl = rateLimit(`del-acct:${clientIp(req)}`, 5, 10 * 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts — slow down" }, { status: 429 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.password || !verifyPassword(body.password, user.password)) {
    return NextResponse.json({ error: "Wrong password — account not deleted" }, { status: 403 });
  }

  // remove the per-user vector index file (extracted document text)
  try {
    const vectorFile = path.join(process.cwd(), "db", "vectors", `${user.id}.json`);
    if (existsSync(vectorFile)) unlinkSync(vectorFile);
  } catch {
    // non-fatal: DB rows are gone, an orphan file is just disk residue
  }

  await db.user.delete({ where: { id: user.id } });

  return clearSessionCookie(NextResponse.json({ ok: true }));
}
