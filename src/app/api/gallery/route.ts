import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAppMode } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requested = Number(req.nextUrl.searchParams.get("limit") ?? "30") || 30;
  // /wall asks for "all": cap at 500 so the response stays bounded even if
  // the event ends up bigger than expected.
  const max = req.nextUrl.searchParams.get("all") === "1" ? 500 : 60;
  const limit = Math.min(requested, max);
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
