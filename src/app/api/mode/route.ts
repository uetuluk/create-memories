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
  const mode = body?.mode;
  if (!["VIDEO", "IMAGE", "OFF"].includes(mode))
    return NextResponse.json({ error: "bad_mode" }, { status: 400 });

  const updated = await prisma.appState.update({
    where: { id: 1 },
    data: {
      mode,
      ...(typeof body?.videoCap === "number" ? { videoCap: body.videoCap } : {}),
    },
  });
  return NextResponse.json(updated);
}
