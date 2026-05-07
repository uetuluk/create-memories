import { GoogleGenAI, Modality } from "@google/genai";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "./env";
import { imageCost, videoCost } from "./pricing";

export const MODELS = {
  text: "gemini-3.1-flash-lite-preview",
  video: "veo-3.1-lite-generate-preview",
  image: "gemini-3.1-flash-image-preview",
} as const;

let _client: GoogleGenAI | null = null;
export function ai(): GoogleGenAI {
  if (!_client) _client = new GoogleGenAI({ apiKey: env.geminiApiKey() });
  return _client;
}

// Veo 3.1 Lite via the Gemini API supports 4 / 6 / 8 second durations.
// Output resolution is fixed at 720p; the Gemini API does not accept a
// `resolution` parameter (only Vertex AI does).
export const VIDEO_DURATION_SECONDS = 4;
export const VIDEO_ASPECT = "16:9";

// Convenience re-exports for callers that just need a flat estimate.
export const VIDEO_COST_USD = videoCost(VIDEO_DURATION_SECONDS);
export const IMAGE_COST_USD = imageCost();

export type GenerationResult = {
  filePath: string;
  mimeType: string;
  cost: number;
  // For VIDEO: `durationSeconds`. For IMAGE: nothing else useful (flat per-image).
  durationSeconds?: number;
};

const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 30; // 5 minutes ceiling

export type ImageRef = { data: string; mimeType: string };

export async function generateVideo(
  prompt: string,
  outPath: string,
  opts: { imageRef?: ImageRef } = {},
): Promise<GenerationResult> {
  const client = ai();
  let op = await client.models.generateVideos({
    model: MODELS.video,
    prompt,
    ...(opts.imageRef
      ? {
          image: {
            imageBytes: opts.imageRef.data,
            mimeType: opts.imageRef.mimeType,
          },
        }
      : {}),
    config: {
      aspectRatio: VIDEO_ASPECT,
      durationSeconds: VIDEO_DURATION_SECONDS,
      numberOfVideos: 1,
    },
  });

  let polls = 0;
  while (!op.done) {
    if (polls++ >= MAX_POLLS) throw new Error("VEO_TIMEOUT");
    await sleep(POLL_INTERVAL_MS);
    op = await client.operations.get({ operation: op });
  }

  // Both SDK shapes seen in the wild: `response.generatedVideos` (newer)
  // and `result.generatedVideos` (0.7.x). Try both.
  const fromResponse = (
    op.response as
      | { generatedVideos?: { video?: { uri?: string; videoBytes?: string; mimeType?: string } }[] }
      | undefined
  )?.generatedVideos?.[0]?.video;
  const generated = fromResponse ?? op.result?.generatedVideos?.[0]?.video;
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

  return {
    filePath: outPath,
    mimeType: generated.mimeType ?? "video/mp4",
    cost: videoCost(VIDEO_DURATION_SECONDS),
    durationSeconds: VIDEO_DURATION_SECONDS,
  };
}

export type ImageGenerationResult = GenerationResult & {
  // The base64-encoded image we just generated, kept around so callers
  // can chain it into image-to-video without re-reading from disk.
  imageRef: ImageRef;
  textCommentary?: string;
  refusalReason?: string;
};

export async function generateImage(
  prompt: string,
  outPath: string,
  opts: { imageRefs?: ImageRef[] } = {},
): Promise<ImageGenerationResult> {
  const client = ai();

  const userParts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
  for (const ref of opts.imageRefs ?? []) {
    userParts.push({ inlineData: { data: ref.data, mimeType: ref.mimeType } });
  }
  userParts.push({ text: `${prompt}\n\n[Render as a 16:9 landscape image.]` });

  const res = await client.models.generateContent({
    model: MODELS.image,
    contents: [{ role: "user", parts: userParts }],
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });

  const candidate = res.candidates?.[0];
  // The model can refuse without setting an inline image; surface that
  // distinctly so the worker can mark it BLOCKED rather than FAILED.
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    const reason = (candidate.finishReason as string) ?? "blocked";
    const detail =
      (candidate.content?.parts ?? [])
        .map((p) => p.text)
        .filter(Boolean)
        .join(" ") || reason;
    const err = new Error(`IMAGE_REFUSED:${detail.slice(0, 200)}`);
    (err as Error & { code?: string }).code = "IMAGE_REFUSED";
    throw err;
  }

  const parts = candidate?.content?.parts ?? [];
  let textCommentary: string | undefined;
  for (const p of parts) {
    if (p.text) textCommentary = (textCommentary ?? "") + p.text;
    const data = p.inlineData?.data;
    if (!data) continue;
    const mimeType = p.inlineData?.mimeType ?? "image/png";
    const buf = Buffer.from(data, "base64");
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, buf);
    return {
      filePath: outPath,
      mimeType,
      cost: imageCost(),
      imageRef: { data, mimeType },
      textCommentary,
    };
  }
  throw new Error("IMAGE_NO_OUTPUT");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
