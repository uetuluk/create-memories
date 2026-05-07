// One-shot dev helper: fills the gallery with N mock COMPLETED Job rows
// using random landscape images from Unsplash's `source.unsplash.com`
// redirector. Files are written to MEDIA_DIR so /api/media/<id> serves them
// the same way as real generations.
//
// Usage:
//   DATABASE_URL=postgres://app:app@localhost:5432/app \
//     npx tsx --env-file=.env.local scripts/seed-mock-gallery.ts [count]
//
// Default count is 30. Idempotent: re-run to add more.

import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const TOPICS = [
  "shanghai skyline",
  "neon city night",
  "ocean wave",
  "mountain sunset",
  "desert dunes",
  "forest morning fog",
  "tropical beach",
  "northern lights",
  "cherry blossoms",
  "snowy peak",
  "rainy street",
  "lavender field",
  "starry sky",
  "autumn leaves",
  "sailboat at dusk",
  "lighthouse storm",
  "city park bench",
  "futuristic city",
  "vintage train",
  "underwater coral reef",
];

const PROMPTS = [
  "A cat astronaut floating above a glowing city",
  "Two friends laughing on a wooden pier at sunset",
  "A corgi surfing a small wave",
  "Bicycle gliding through cherry blossom petals",
  "Bookstore in the rain, warm window light",
  "Robot watering a tiny rooftop garden",
  "Hot air balloons over rolling hills at dawn",
  "Sketch of an ancient library with floating books",
  "Skateboarder mid-trick under neon billboards",
  "Tiny dragon napping on a coffee mug",
  "Foggy bridge with lanterns, watercolor style",
  "Jazz quartet in a candlelit speakeasy",
  "Spaceship landing softly on a beach",
  "Whale leaping over a moonlit ocean",
  "Cyberpunk noodle stall in the alley",
  "Vintage motorcycle on a desert highway",
  "Owls reading a giant scroll in a treehouse",
  "Origami crane flock taking flight",
  "Astronaut planting flowers on Mars",
  "Mermaid braiding kelp in a coral garden",
];

async function main() {
  const count = Number(process.argv[2] ?? "30");
  const mediaDir = process.env.MEDIA_DIR || "./data/media";
  await fs.mkdir(mediaDir, { recursive: true });

  // Reuse a single fake user so quota checks against this account stay
  // predictable and so all mocks group under one student-like identity.
  const user = await prisma.user.upsert({
    where: { email: "mock-gallery@example.com" },
    update: {},
    create: {
      email: "mock-gallery@example.com",
      name: "Mock Gallery",
    },
  });

  // Spread completedAt over the last few hours so ordering looks natural.
  const now = Date.now();
  let created = 0;
  for (let i = 0; i < count; i++) {
    const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    // picsum.photos is rock-solid for random 16:9 landscape stock; we vary
    // the seed per item so each tile gets a different image.
    const url = `https://picsum.photos/seed/cm-${Date.now()}-${i}/1280/720`;

    let buf: Buffer;
    try {
      const r = await fetch(url, { redirect: "follow" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      buf = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      console.warn(`skip "${topic}":`, e instanceof Error ? e.message : e);
      continue;
    }

    const job = await prisma.job.create({
      data: {
        userId: user.id,
        prompt: PROMPTS[Math.floor(Math.random() * PROMPTS.length)],
        rewritten: `A cinematic 16:9 photo. ${topic}. Soft natural light, photorealistic.`,
        mode: "IMAGE",
        status: "COMPLETED",
        mimeType: "image/jpeg",
        costUsd: 0.067,
        completedAt: new Date(now - i * 90_000), // 1.5 minutes apart
      },
    });

    const filePath = path.join(mediaDir, `${job.id}.jpg`);
    await fs.writeFile(filePath, buf);
    await prisma.job.update({
      where: { id: job.id },
      data: { filePath },
    });

    process.stdout.write(`\r seeded ${++created}/${count} `);
  }
  process.stdout.write("\n");
  console.log("done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
