import { NextRequest, NextResponse } from "next/server";
import { promises as fs, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    select: { filePath: true, mimeType: true, hidden: true, status: true },
  });
  if (!job || job.status !== "COMPLETED" || !job.filePath)
    return new NextResponse("not found", { status: 404 });
  if (job.hidden) {
    // Hidden items are still served to admins so they can review and
    // potentially unhide them.
    const session = await auth();
    if (!isAdmin(session?.user?.email))
      return new NextResponse("not found", { status: 404 });
  }

  let stat;
  try {
    stat = await fs.stat(job.filePath);
  } catch {
    return new NextResponse("missing on disk", { status: 404 });
  }

  const ext =
    job.mimeType === "video/mp4"
      ? "mp4"
      : job.mimeType === "image/png"
      ? "png"
      : job.mimeType === "image/jpeg"
      ? "jpg"
      : "bin";
  const wantsDownload = _req.nextUrl.searchParams.get("download") === "1";

  const headers: Record<string, string> = {
    "Content-Type": job.mimeType ?? "application/octet-stream",
    "Content-Length": String(stat.size),
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  if (wantsDownload) {
    headers["Content-Disposition"] = `attachment; filename="create-memories-${id}.${ext}"`;
  }

  const stream = Readable.toWeb(createReadStream(job.filePath)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, { headers });
}
