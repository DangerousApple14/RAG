import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — unauthenticated liveness probe for platforms
 * (Render health check path, uptime monitors, docker healthchecks).
 * Deliberately leaks nothing: no version, no user count, no DB contents.
 */
export async function GET() {
  return NextResponse.json(
    { ok: true, uptime: Math.round(process.uptime()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
