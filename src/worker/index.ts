import { Pool, PoolClient } from "pg";
import path from "node:path";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { reviewPrompt } from "@/lib/prompt";
import {
  generateVideo,
  generateImage,
  VIDEO_COST_USD,
  IMAGE_COST_USD,
} from "@/lib/genai";

const ADVISORY_LOCK_KEY = 731_001; // arbitrary fixed bigint
const POLL_IDLE_MS = 2_000;

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: env.databaseUrl() });
  return pool;
}

async function reapStaleRunning(): Promise<void> {
  // Anything left RUNNING from a prior crash > 10 min: mark FAILED.
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const reaped = await prisma.job.updateMany({
    where: { status: "RUNNING", startedAt: { lt: cutoff } },
    data: {
      status: "FAILED",
      errorCode: "REAPED",
      errorMsg: "Reaped on worker startup (orphaned)",
      completedAt: new Date(),
    },
  });
  if (reaped.count > 0) console.log(`[worker] reaped ${reaped.count} stale RUNNING job(s)`);
}

async function withAdvisoryLock<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    return await fn(client);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    } catch {}
    client.release();
  }
}

async function pickNextJobId(client: PoolClient): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id FROM "Job"
       WHERE status = 'QUEUED'
       ORDER BY "createdAt" ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
  );
  return r.rows[0]?.id ?? null;
}

async function processOne(): Promise<boolean> {
  return withAdvisoryLock(async (client) => {
    await client.query("BEGIN");
    let jobId: string | null;
    try {
      jobId = await pickNextJobId(client);
      if (!jobId) {
        await client.query("COMMIT");
        return false;
      }
      await client.query(
        `UPDATE "Job" SET status='RUNNING', "startedAt"=NOW() WHERE id=$1`,
        [jobId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return true;

    console.log(`[worker] job=${job.id} mode=${job.mode} prompt="${job.prompt.slice(0, 60)}…"`);

    try {
      const review = await reviewPrompt(job.prompt, job.mode === "IMAGE" ? "IMAGE" : "VIDEO");
      if (!review.allow) {
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: "BLOCKED",
            errorCode: "SAFETY_BLOCKED",
            errorMsg: review.reason.slice(0, 500),
            rewritten: null,
            completedAt: new Date(),
          },
        });
        console.log(`[worker] job=${job.id} blocked: ${review.reason}`);
        return true;
      }

      await prisma.job.update({
        where: { id: job.id },
        data: { rewritten: review.rewritten },
      });

      const ext = job.mode === "VIDEO" ? "mp4" : "png";
      const outPath = path.join(env.mediaDir(), `${job.id}.${ext}`);

      const out =
        job.mode === "VIDEO"
          ? await generateVideo(review.rewritten, outPath)
          : await generateImage(review.rewritten, outPath);

      const cost = job.mode === "VIDEO" ? VIDEO_COST_USD : IMAGE_COST_USD;

      await prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            filePath: out.filePath,
            mimeType: out.mimeType,
            costUsd: cost,
            completedAt: new Date(),
          },
        });
        // Atomic counter + auto-switch using raw SQL (Prisma can't conditional-update easily).
        await tx.$executeRaw`
          UPDATE "AppState"
            SET "videoCount" = "videoCount" + ${job.mode === "VIDEO" ? 1 : 0},
                "totalCostUsd" = "totalCostUsd" + ${cost},
                "mode" = CASE
                  WHEN "mode" = 'VIDEO' AND "videoCount" + ${job.mode === "VIDEO" ? 1 : 0} >= "videoCap"
                    THEN 'IMAGE'::"Mode"
                  ELSE "mode"
                END
            WHERE id = 1
        `;
      });
      console.log(`[worker] job=${job.id} completed file=${out.filePath} cost=$${cost.toFixed(4)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorCode: "API_ERROR",
          errorMsg: msg.slice(0, 500),
          completedAt: new Date(),
        },
      });
      console.error(`[worker] job=${job.id} failed:`, msg);
    }

    return true;
  });
}

async function main(): Promise<void> {
  console.log("[worker] starting");
  await prisma.appState.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  await reapStaleRunning();

  let stop = false;
  const shutdown = async (sig: string) => {
    if (stop) return;
    stop = true;
    console.log(`[worker] received ${sig}, draining…`);
    await prisma.$disconnect();
    if (pool) await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  while (!stop) {
    try {
      const did = await processOne();
      if (!did) await sleep(POLL_IDLE_MS);
    } catch (e) {
      console.error("[worker] loop error:", e);
      await sleep(POLL_IDLE_MS);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
