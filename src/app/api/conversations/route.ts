import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorized } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const conversations = await db.conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ conversations });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  let title = "New chat";
  try {
    const body = (await req.json()) as { title?: string };
    if (body.title?.trim()) title = body.title.trim().slice(0, 80);
  } catch {
    // body optional
  }
  const conversation = await db.conversation.create({
    data: { userId: user.id, title },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ conversation });
}
