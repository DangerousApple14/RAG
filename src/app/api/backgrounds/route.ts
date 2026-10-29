import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import path from "path";

const IMAGE_EXTS = new Set([".webp", ".jpg", ".jpeg", ".png", ".avif", ".gif"]);

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "backgrounds");
    const files = (await readdir(dir))
      .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .sort()
      .map((f) => `/backgrounds/${f}`);
    if (files.length === 0) {
      return NextResponse.json({ images: [], current: null });
    }
    const current = files[Math.floor(Math.random() * files.length)];
    return NextResponse.json({ images: files, current });
  } catch {
    return NextResponse.json({ images: [], current: null });
  }
}
