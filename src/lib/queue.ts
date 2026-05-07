import { prisma } from "@/lib/db";

export async function getQueuePosition(jobId: string): Promise<number> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { status: true, createdAt: true },
  });
  if (!job) return 0;
  if (job.status === "RUNNING") return 0;
  if (job.status !== "QUEUED") return -1;

  const ahead = await prisma.job.count({
    where: {
      status: { in: ["QUEUED", "RUNNING"] },
      createdAt: { lt: job.createdAt },
    },
  });
  return ahead;
}

export async function getAppMode() {
  const state = await prisma.appState.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  return state;
}
