import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorized } from "@/lib/auth";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  const conversation = await db.conversation.findFirst({
    where: { id, userId: user.id },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const messages = await db.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, sources: true, createdAt: true },
  });
  return NextResponse.json({ conversation, messages });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  const conversation = await db.conversation.findFirst({ where: { id, userId: user.id } });
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  await db.conversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
