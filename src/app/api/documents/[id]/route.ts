import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { deleteDoc } from "@/lib/vector-store";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  const doc = await db.document.findFirst({ where: { id, userId: user.id } });
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await deleteDoc(user.id, id);
  await db.document.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
