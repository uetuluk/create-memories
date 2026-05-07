import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAppMode } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") ?? "30") || 30,
    60,
  );
  const items = await prisma.job.findMany({
    where: { status: "COMPLETED", hidden: false },
    orderBy: { completedAt: "desc" },
    take: limit,
    select: {
      id: true,
      mode: true,
      mimeType: true,
      completedAt: true,
      prompt: true,
      rewritten: true,
    },
  });
  const state = await getAppMode();
  return NextResponse.json({
    items,
    mode: state.mode,
    videoCount: state.videoCount,
    videoCap: state.videoCap,
  });
}
