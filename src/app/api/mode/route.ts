import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/env";
import { getAppMode } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getAppMode();
  return NextResponse.json(state);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session?.user?.email))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const data: {
    mode?: "VIDEO" | "IMAGE" | "OFF";
    videoCap?: number;
    perUserQuota?: number;
    requireLogin?: boolean;
  } = {};

  if (body?.mode !== undefined) {
    if (!["VIDEO", "IMAGE", "OFF"].includes(body.mode))
      return NextResponse.json({ error: "bad_mode" }, { status: 400 });
    data.mode = body.mode;
  }
  if (body?.videoCap !== undefined) {
    if (typeof body.videoCap !== "number" || body.videoCap < 0)
      return NextResponse.json({ error: "bad_video_cap" }, { status: 400 });
    data.videoCap = Math.floor(body.videoCap);
  }
  if (body?.perUserQuota !== undefined) {
    if (typeof body.perUserQuota !== "number" || body.perUserQuota < 0)
      return NextResponse.json({ error: "bad_per_user_quota" }, { status: 400 });
    data.perUserQuota = Math.floor(body.perUserQuota);
  }
  if (body?.requireLogin !== undefined) {
    if (typeof body.requireLogin !== "boolean")
      return NextResponse.json({ error: "bad_require_login" }, { status: 400 });
    data.requireLogin = body.requireLogin;
  }

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "no_changes" }, { status: 400 });

  const updated = await prisma.appState.update({ where: { id: 1 }, data });
  return NextResponse.json(updated);
}
