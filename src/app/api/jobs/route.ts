import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isEmailAllowed } from "@/lib/env";
import { getAppMode, getQueuePosition } from "@/lib/queue";
import { isLocationKey, isStyleKey, type LocationKey, type StyleKey } from "@/lib/refs";
import { savePortrait, deletePortrait } from "@/lib/upload";

export const dynamic = "force-dynamic";

const MAX_VIBE = 200;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !isEmailAllowed(session.user.email)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.startsWith("multipart/form-data")) {
    return NextResponse.json({ error: "expected_multipart" }, { status: 400 });
  }
  const form = await req.formData();

  const styleRaw = form.get("style");
  if (!isStyleKey(styleRaw)) {
    return NextResponse.json({ error: "missing_style" }, { status: 400 });
  }
  const style: StyleKey = styleRaw;

  const locationRaw = form.get("location");
  let location: LocationKey | null = null;
  if (typeof locationRaw === "string" && locationRaw && locationRaw !== "random") {
    if (!isLocationKey(locationRaw)) {
      return NextResponse.json({ error: "bad_location" }, { status: 400 });
    }
    location = locationRaw;
  }

  const vibeRaw = form.get("vibe");
  const vibe = typeof vibeRaw === "string" ? vibeRaw.trim().slice(0, MAX_VIBE) : "";

  const photo = form.get("photo");
  const hasPhoto = photo instanceof File && photo.size > 0;

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

  const used = await prisma.job.count({
    where: {
      userId: session.user.id,
      status: { in: ["QUEUED", "RUNNING", "COMPLETED"] },
    },
  });
  if (used >= state.perUserQuota) {
    return NextResponse.json(
      { error: "user_limit_reached", limit: state.perUserQuota, used },
      { status: 429 },
    );
  }

  // Save the selfie first (needs an id we can reuse on the Job row).
  const provisionalId = randomUUID();
  let selfiePath: string | null = null;
  if (hasPhoto) {
    try {
      const saved = await savePortrait(provisionalId, photo);
      selfiePath = saved.filePath;
    } catch (e) {
      const code = e instanceof Error ? e.message : "UPLOAD_FAILED";
      return NextResponse.json({ error: code }, { status: 400 });
    }
  }

  try {
    const job = await prisma.job.create({
      data: {
        userId: session.user.id,
        prompt: vibe,
        mode: state.mode,
        style,
        location,
        selfiePath,
      },
      select: { id: true, mode: true, createdAt: true },
    });
    const position = await getQueuePosition(job.id);
    return NextResponse.json({ id: job.id, mode: job.mode, position });
  } catch (e) {
    // If DB insert fails, don't leave the upload orphaned.
    await deletePortrait(selfiePath);
    throw e;
  }
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");

  // No `id` → return this user's own completed jobs (newest first) + quota.
  if (!id) {
    const [items, used, state] = await Promise.all([
      prisma.job.findMany({
        where: {
          userId: session.user.id,
          status: "COMPLETED",
        },
        orderBy: { completedAt: "desc" },
        take: 20,
        select: {
          id: true,
          mode: true,
          mimeType: true,
          prompt: true,
          rewritten: true,
          hidden: true,
          completedAt: true,
        },
      }),
      prisma.job.count({
        where: {
          userId: session.user.id,
          status: { in: ["QUEUED", "RUNNING", "COMPLETED"] },
        },
      }),
      getAppMode(),
    ]);
    return NextResponse.json({ items, used, limit: state.perUserQuota });
  }

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
