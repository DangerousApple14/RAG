import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getOrCreateSettings, publicSettings, updateSettings } from "@/lib/settings";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const settings = await getOrCreateSettings(user.id);
  return NextResponse.json({ settings: publicSettings(settings) });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const settings = await updateSettings(user.id, body);
  return NextResponse.json({ settings: publicSettings(settings) });
}
