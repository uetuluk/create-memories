import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/env";

export const dynamic = "force-dynamic";

type Bucket = {
  kind: "TEXT" | "IMAGE" | "VIDEO";
  model: string;
  count: number;
  costUsd: number;
};

export async function GET() {
  const session = await auth();
  if (!isAdmin(session?.user?.email))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [grouped, recent, totalAgg] = await Promise.all([
    prisma.usageEvent.groupBy({
      by: ["kind", "model"],
      _count: { _all: true },
      _sum: { costUsd: true },
    }),
    prisma.usageEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        jobId: true,
        kind: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        cachedTokens: true,
        durationSeconds: true,
        costUsd: true,
        ok: true,
        errorCode: true,
        createdAt: true,
      },
    }),
    prisma.usageEvent.aggregate({ _sum: { costUsd: true }, _count: { _all: true } }),
  ]);

  const buckets: Bucket[] = grouped.map((g) => ({
    kind: g.kind,
    model: g.model,
    count: g._count._all,
    costUsd: Number(g._sum.costUsd ?? 0),
  }));

  return NextResponse.json({
    buckets,
    recent,
    totalCostUsd: Number(totalAgg._sum.costUsd ?? 0),
    totalCount: totalAgg._count._all,
  });
}
