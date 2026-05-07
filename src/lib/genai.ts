import { GoogleGenAI, Modality } from "@google/genai";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

export const MODELS = {
  text: "gemini-3.1-flash",
  video: "veo-3.1-lite-generate-preview",
  image: "gemini-3.1-flash-image-preview",
} as const;

let _client: GoogleGenAI | null = null;
export function ai(): GoogleGenAI {
  if (!_client) _client = new GoogleGenAI({ apiKey: env.geminiApiKey() });
  return _client;
}

export const VIDEO_DURATION_SECONDS = 5;
export const VIDEO_RESOLUTION = "720p";
export const VIDEO_ASPECT = "16:9";

// $0.05 / s @ 720p Veo 3.1 Lite (May 2026 list pricing)
export const VIDEO_COST_USD = VIDEO_DURATION_SECONDS * 0.05;
// $0.067 / image @ 1K Nano Banana 2 (May 2026 list pricing)
export const IMAGE_COST_USD = 0.067;

const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 30; // 5 minutes ceiling

export async function generateVideo(
  prompt: string,
  outPath: string,
): Promise<{ filePath: string; mimeType: string }> {
  const client = ai();
  let op = await client.models.generateVideos({
    model: MODELS.video,
    prompt,
    config: {
      aspectRatio: VIDEO_ASPECT,
      durationSeconds: VIDEO_DURATION_SECONDS,
      resolution: VIDEO_RESOLUTION,
      numberOfVideos: 1,
    },
  });

  let polls = 0;
  while (!op.done) {
    if (polls++ >= MAX_POLLS) throw new Error("VEO_TIMEOUT");
    await sleep(POLL_INTERVAL_MS);
    op = await client.operations.get({ operation: op });
  }

  const generated = op.result?.generatedVideos?.[0]?.video;
  if (!generated) throw new Error("VEO_NO_OUTPUT");

  await fs.mkdir(path.dirname(outPath), { recursive: true });

  if (generated.videoBytes) {
    await fs.writeFile(outPath, Buffer.from(generated.videoBytes, "base64"));
  } else if (generated.uri) {
    // The Files API serves the bytes; the API key must be on the URL.
    const sep = generated.uri.includes("?") ? "&" : "?";
    const url = `${generated.uri}${sep}key=${encodeURIComponent(env.geminiApiKey())}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`VEO_DOWNLOAD_${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    await fs.writeFile(outPath, buf);
  } else {
    throw new Error("VEO_NO_BYTES_OR_URI");
  }

  return { filePath: outPath, mimeType: generated.mimeType ?? "video/mp4" };
}

export async function generateImage(
  prompt: string,
  outPath: string,
): Promise<{ filePath: string; mimeType: string }> {
  const client = ai();
  const res = await client.models.generateContent({
    model: MODELS.image,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });

  const parts = res.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const data = p.inlineData?.data;
    if (data) {
      const buf = Buffer.from(data, "base64");
      await fs.mkdir(path.dirname(outPath), { recursive: true });
      await fs.writeFile(outPath, buf);
      return {
        filePath: outPath,
        mimeType: p.inlineData?.mimeType ?? "image/png",
      };
    }
  }
  throw new Error("IMAGE_NO_OUTPUT");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
