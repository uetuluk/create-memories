import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { env } from "@/lib/env";

export const SELFIE_MAX_BYTES = 5 * 1024 * 1024;
export const SELFIE_MAX_EDGE = 1024;

const ACCEPTED_EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
};

function uploadsDir(): string {
  // Sibling of MEDIA_DIR; on the deployed compose stack both live on
  // /data, on the same named volume.
  return path.resolve(env.mediaDir(), "..", "uploads");
}

export type SavedSelfie = {
  filePath: string;
  width: number;
  height: number;
  bytes: number;
};

/**
 * Validate, normalize (HEIC/PNG → JPEG, EXIF-rotated, ≤1024px), and save
 * an uploaded selfie to disk. Throws on policy violations with stable
 * error codes the API can surface to the user.
 */
export async function savePortrait(jobId: string, file: File): Promise<SavedSelfie> {
  if (file.size > SELFIE_MAX_BYTES) throw new Error("UPLOAD_TOO_LARGE");
  if (file.size === 0) throw new Error("UPLOAD_EMPTY");

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!(ext in ACCEPTED_EXT_TO_MIME)) throw new Error("UPLOAD_UNSUPPORTED_TYPE");

  const inputBuf = Buffer.from(await file.arrayBuffer());

  let processed: Buffer;
  try {
    processed = await sharp(inputBuf, { failOn: "none" })
      .rotate() // honor EXIF orientation
      .resize({
        width: SELFIE_MAX_EDGE,
        height: SELFIE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new Error("UPLOAD_DECODE_FAILED");
  }

  const meta = await sharp(processed).metadata();
  await fs.mkdir(uploadsDir(), { recursive: true });
  const target = path.join(uploadsDir(), `${jobId}.jpg`);
  await fs.writeFile(target, processed);

  return {
    filePath: target,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    bytes: processed.length,
  };
}

export async function deletePortrait(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore — best-effort cleanup
  }
}
