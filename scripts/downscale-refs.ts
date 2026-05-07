// One-shot helper: downscales every file under public/refs/ to fit within
// 1024px on the long edge as JPEG (q=85). Run after dropping new ref
// images into the directory:
//
//   npx tsx scripts/downscale-refs.ts
//
// Idempotent: skips files already <= 1024px.

import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(process.cwd(), "public", "refs");
const MAX_EDGE = 1024;

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(jpe?g|png|webp|heic)$/i.test(entry.name)) out.push(p);
  }
  return out;
}

async function main() {
  const files = await walk(ROOT);
  let processed = 0;
  let skipped = 0;
  for (const file of files) {
    const meta = await sharp(file).metadata();
    const longest = Math.max(meta.width ?? 0, meta.height ?? 0);

    // Already small + already JPEG: skip.
    if (longest <= MAX_EDGE && /\.jpg$/i.test(file)) {
      skipped++;
      continue;
    }

    const ext = path.extname(file);
    const base = file.slice(0, -ext.length);
    const target = `${base}.jpg`;
    const tmp = `${target}.tmp`;

    await sharp(file)
      .rotate() // honor EXIF orientation
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(tmp);
    await fs.rename(tmp, target);
    if (target !== file) await fs.unlink(file);

    const newSize = (await fs.stat(target)).size;
    console.log(
      `  ${path.relative(ROOT, target)}  ${longest}px → 1024px max  (${(newSize / 1024).toFixed(0)} KB)`,
    );
    processed++;
  }
  console.log(`\nprocessed: ${processed}, skipped: ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
