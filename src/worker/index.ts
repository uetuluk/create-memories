import { Pool, PoolClient } from "pg";
import path from "node:path";
import { promises as fs } from "node:fs";
import { prisma } from "../lib/db";
import { env } from "../lib/env";
import { reviewVibe } from "../lib/prompt";
import { generateVideo, generateImage, MODELS, type ImageRef } from "../lib/genai";
import { PRICING } from "../lib/pricing";
import {
  isLocationKey,
  isStyleKey,
  locationRefPath,
  pickRandomLocation,
  readRefAsBase64,
  styleRefPath,
  type LocationKey,
  type StyleKey,
} from "../lib/refs";
import { buildQilinPrompt } from "../lib/qilin";
import { deletePortrait } from "../lib/upload";

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

    console.log(
      `[worker] job=${job.id} mode=${job.mode} style=${job.style ?? "?"} loc=${job.location ?? "random"} selfie=${!!job.selfiePath} vibe="${(job.prompt ?? "").slice(0, 40)}"`,
    );

    let totalCost = 0;
    let safetyCost = 0;

    const recordUsage = async (
      kind: "TEXT" | "IMAGE" | "VIDEO",
      model: string,
      cost: number,
      extras: {
        inputTokens?: number;
        outputTokens?: number;
        cachedTokens?: number;
        durationSeconds?: number;
        pricingNote?: string;
        ok?: boolean;
        errorCode?: string;
      } = {},
    ) => {
      await prisma.usageEvent.create({
        data: {
          jobId: job.id,
          kind,
          model,
          costUsd: cost,
          inputTokens: extras.inputTokens ?? null,
          outputTokens: extras.outputTokens ?? null,
          cachedTokens: extras.cachedTokens ?? null,
          durationSeconds: extras.durationSeconds ?? null,
          pricingNote: extras.pricingNote,
          ok: extras.ok ?? true,
          errorCode: extras.errorCode,
        },
      });
    };

    try {
      if (!isStyleKey(job.style)) {
        throw new Error("INVALID_STYLE");
      }
      const style: StyleKey = job.style;
      const location: LocationKey | null = isLocationKey(job.location)
        ? job.location
        : null;

      // 1. Lightweight vibe safety check (only if a vibe was provided).
      const vibeReview = await reviewVibe(job.prompt ?? "");
      if (vibeReview.usage.cost > 0) {
        await recordUsage("TEXT", MODELS.text, vibeReview.usage.cost, {
          inputTokens: vibeReview.usage.inputTokens,
          outputTokens: vibeReview.usage.outputTokens,
          cachedTokens: vibeReview.usage.cachedTokens,
          pricingNote: PRICING.text.note,
        });
        safetyCost += vibeReview.usage.cost;
        totalCost += vibeReview.usage.cost;
      }
      if (!vibeReview.allow) {
        await prisma.$transaction([
          prisma.job.update({
            where: { id: job.id },
            data: {
              status: "BLOCKED",
              errorCode: "SAFETY_BLOCKED",
              errorMsg: vibeReview.reason.slice(0, 500),
              rewritten: null,
              completedAt: new Date(),
              costUsd: safetyCost,
            },
          }),
          prisma.$executeRaw`UPDATE "AppState" SET "totalCostUsd" = "totalCostUsd" + ${safetyCost} WHERE id = 1`,
        ]);
        await deletePortrait(job.selfiePath);
        console.log(`[worker] job=${job.id} blocked: ${vibeReview.reason}`);
        return true;
      }

      // 2. Build the deterministic qilin prompts. Resolve "random" location
      //    once so the text and image inputs stay consistent.
      const resolved = buildQilinPrompt({
        style,
        location,
        vibe: vibeReview.cleaned,
        hasSelfie: !!job.selfiePath,
      });

      // 3. Load shared image references.
      const styleRef = await readRefAsBase64(styleRefPath(style));
      const locationRef = await readRefAsBase64(
        locationRefPath(resolved.location),
      );

      await prisma.job.update({
        where: { id: job.id },
        data: {
          rewritten: resolved.scenePrompt,
          location: resolved.location, // pin "random" → concrete key
        },
      });

      // 4. Two-stage generation when we have a selfie:
      //    Stage A: selfie + style ref → clean qilin portrait
      //    Stage B: portrait + location ref → final composite
      // Without a selfie we go straight to stage B with style + location refs.
      let portraitRef: ImageRef | null = null;
      if (job.selfiePath) {
        const selfieBuf = await fs.readFile(job.selfiePath);
        const selfieRef: ImageRef = {
          data: selfieBuf.toString("base64"),
          mimeType: "image/jpeg",
        };
        const portraitPath = path.join(env.mediaDir(), `${job.id}.portrait.png`);
        const portrait = await generateImage(resolved.portraitPrompt, portraitPath, {
          imageRefs: [selfieRef, styleRef],
        });
        await recordUsage("IMAGE", MODELS.image, portrait.cost, {
          pricingNote: PRICING.image.note,
        });
        totalCost += portrait.cost;
        portraitRef = portrait.imageRef;
      }

      const imgPath = path.join(env.mediaDir(), `${job.id}.png`);
      const sceneRefs: ImageRef[] = portraitRef
        ? [portraitRef, locationRef]
        : [styleRef, locationRef];
      const img = await generateImage(resolved.scenePrompt, imgPath, {
        imageRefs: sceneRefs,
      });
      await recordUsage("IMAGE", MODELS.image, img.cost, {
        pricingNote: PRICING.image.note,
      });
      totalCost += img.cost;

      // Cleanup intermediate portrait file.
      if (portraitRef) {
        await fs
          .unlink(path.join(env.mediaDir(), `${job.id}.portrait.png`))
          .catch(() => {});
      }

      // 5. If VIDEO mode, animate the just-generated image with Veo.
      let finalPath = img.filePath;
      let finalMime = img.mimeType;
      if (job.mode === "VIDEO") {
        const vidPath = path.join(env.mediaDir(), `${job.id}.mp4`);
        // Reuse the scene prompt for motion direction; the still image
        // already encodes subject + style + setting.
        const vid = await generateVideo(resolved.scenePrompt, vidPath, {
          imageRef: img.imageRef,
        });
        await recordUsage("VIDEO", MODELS.video, vid.cost, {
          durationSeconds: vid.durationSeconds,
          pricingNote: PRICING.video.note,
        });
        totalCost += vid.cost;
        finalPath = vid.filePath;
        finalMime = vid.mimeType;
      }

      // 6. Mark complete + bump counters + auto-switch mode at video cap.
      await prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            filePath: finalPath,
            mimeType: finalMime,
            costUsd: totalCost,
            completedAt: new Date(),
          },
        });
        await tx.$executeRaw`
          UPDATE "AppState"
            SET "videoCount" = "videoCount" + ${job.mode === "VIDEO" ? 1 : 0},
                "totalCostUsd" = "totalCostUsd" + ${totalCost},
                "mode" = CASE
                  WHEN "mode" = 'VIDEO' AND "videoCount" + ${job.mode === "VIDEO" ? 1 : 0} >= "videoCap"
                    THEN 'IMAGE'::"Mode"
                  ELSE "mode"
                END
            WHERE id = 1
        `;
      });

      // 7. Selfie is no longer needed — wipe it.
      await deletePortrait(job.selfiePath);
      if (job.selfiePath) {
        await prisma.job.update({
          where: { id: job.id },
          data: { selfiePath: null },
        });
      }

      console.log(`[worker] job=${job.id} completed file=${finalPath} cost=$${totalCost.toFixed(4)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const refused = msg.startsWith("IMAGE_REFUSED:");
      // Best-effort: record the failed call with $0 spend.
      await recordUsage(
        job.mode === "VIDEO" ? "VIDEO" : "IMAGE",
        job.mode === "VIDEO" ? MODELS.video : MODELS.image,
        0,
        { ok: false, errorCode: msg.slice(0, 200) },
      ).catch(() => {});
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: refused ? "BLOCKED" : "FAILED",
          errorCode: refused ? "MODEL_REFUSED" : "API_ERROR",
          errorMsg: msg.slice(0, 500),
          completedAt: new Date(),
          costUsd: totalCost,
        },
      });
      // On any terminal outcome, drop the selfie.
      await deletePortrait(job.selfiePath);
      console.error(`[worker] job=${job.id} ${refused ? "refused" : "failed"}:`, msg);
    }

    return true;
  });
}

// Used in error path; suppress unused import lint.
void pickRandomLocation;

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
