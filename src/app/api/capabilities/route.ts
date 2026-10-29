import { NextResponse } from "next/server";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getOrCreateSettings } from "@/lib/settings";
import { ollamaReachable, paddleAvailable } from "@/lib/ocr";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const settings = await getOrCreateSettings(user.id);

  const [ollama, paddle] = await Promise.all([
    ollamaReachable(settings.ollamaBaseUrl),
    paddleAvailable(),
  ]);

  return NextResponse.json({ ollama, paddle, builtin: true, ollamaUrl: settings.ollamaBaseUrl });
}
