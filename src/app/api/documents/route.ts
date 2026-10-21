import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, unauthorized } from "@/lib/auth";
import { getOrCreateSettings } from "@/lib/settings";
import { enqueueIngest, kindForFile, processDocument } from "@/lib/ingest";

const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40MB per file

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const documents = await db.document.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ documents });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const settings = await getOrCreateSettings(user.id);
  const created: { id: string; name: string; size: number; status: string }[] = [];

  for (const file of files) {
    const kind = kindForFile(file.name, file.type);
    if (!kind) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.name} (use PDF or images)` },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `${file.name} is over the 40MB limit` },
        { status: 400 }
      );
    }
  }

  for (const file of files) {
    const kind = kindForFile(file.name, file.type) as "pdf" | "image";
    const doc = await db.document.create({
      data: {
        userId: user.id,
        name: file.name,
        size: file.size,
        status: "processing",
      },
    });
    created.push({ id: doc.id, name: doc.name, size: doc.size, status: doc.status });

    const buffer = Buffer.from(await file.arrayBuffer());
    enqueueIngest(user.id, () => processDocument(user.id, doc.id, { name: file.name, buffer, kind }, settings));
  }

  return NextResponse.json({
    documents: await db.document.findMany({
      where: { userId: user.id, id: { in: created.map((c) => c.id) } },
      orderBy: { createdAt: "desc" },
    }),
  });
}
