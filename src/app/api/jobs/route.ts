import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isEmailAllowed } from "@/lib/env";
import { getAppMode, getQueuePosition } from "@/lib/queue";

export const dynamic = "force-dynamic";

const MAX_PROMPT = 500;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !isEmailAllowed(session.user.email)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "empty_prompt" }, { status: 400 });
  if (prompt.length > MAX_PROMPT)
    return NextResponse.json({ error: "prompt_too_long" }, { status: 400 });

  const state = await getAppMode();
  if (state.mode === "OFF") {
    return NextResponse.json({ error: "service_off" }, { status: 503 });
  }

  const active = await prisma.job.findFirst({
    where: { userId: session.user.id, status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true },
  });
  if (active) {
    return NextResponse.json(
      { error: "already_queued", jobId: active.id },
      { status: 409 },
    );
  }

  const job = await prisma.job.create({
    data: {
      userId: session.user.id,
      prompt,
      mode: state.mode,
    },
    select: { id: true, mode: true, createdAt: true },
  });
  const position = await getQueuePosition(job.id);
  return NextResponse.json({ id: job.id, mode: job.mode, position });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      mode: true,
      mimeType: true,
      errorCode: true,
      errorMsg: true,
      hidden: true,
      createdAt: true,
      completedAt: true,
    },
  });
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (job.userId !== session.user.id)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const position = await getQueuePosition(job.id);
  return NextResponse.json({ ...job, position });
}
