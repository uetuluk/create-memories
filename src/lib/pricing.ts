// Single source of truth for Google AI Studio pricing (May 2026).
// Update these constants if rates change; UsageEvent.pricingNote captures
// the rate used at the time of each call so historical totals stay correct.

export type Pricing = {
  // text: rates per million tokens
  text: { in: number; out: number; cached: number; note: string };
  // image: flat per-image at the size we use
  image: { perImage: number; note: string };
  // video: per-second rate
  video: { perSecond: number; note: string };
};

export const PRICING: Pricing = {
  text: {
    in: 0.10, // $/M input tokens (Gemini 3.1 Flash Lite preview)
    out: 0.40, // $/M output tokens
    cached: 0.025, // $/M cached input tokens
    note: "gemini-3.1-flash-lite-preview @ AI Studio (May 2026)",
  },
  image: {
    perImage: 0.067, // Nano Banana 2 @ 1K
    note: "gemini-3.1-flash-image-preview @ 1K (May 2026)",
  },
  video: {
    perSecond: 0.05, // Veo 3.1 Lite @ 720p
    note: "veo-3.1-lite-generate-preview @ 720p (May 2026)",
  },
};

export function textCost(
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0,
): number {
  // Cached tokens substitute for input tokens at a discount.
  const billableInput = Math.max(inputTokens - cachedTokens, 0);
  return (
    (billableInput / 1_000_000) * PRICING.text.in +
    (cachedTokens / 1_000_000) * PRICING.text.cached +
    (outputTokens / 1_000_000) * PRICING.text.out
  );
}

export function imageCost(): number {
  return PRICING.image.perImage;
}

export function videoCost(durationSeconds: number): number {
  return durationSeconds * PRICING.video.perSecond;
}
