// Builds the multi-image prompt sent to Nano Banana 2 for the qilin
// transformation. Style + location are referenced both via image input
// and named in the text prompt; the user vibe (if any) and the optional
// selfie are layered on top.

import {
  LOCATIONS,
  type LocationKey,
  STYLES,
  type StyleKey,
  pickRandomLocation,
} from "./refs";

export type QilinJobInputs = {
  style: StyleKey;
  // null → caller should fall back to a random location (we resolve once
  // here so the rewritten text and the image input stay consistent).
  location: LocationKey | null;
  vibe?: string | null;
  hasSelfie: boolean;
};

export type ResolvedQilin = {
  style: StyleKey;
  location: LocationKey;
  // Stage 1: selfie + style ref → qilin portrait of the person (only used
  // when hasSelfie). Empty when there's no selfie.
  portraitPrompt: string;
  // Stage 2: portrait + location ref → final composite.
  // When there's no selfie this is the only call, and it uses the style
  // ref as well (since there's no portrait to anchor the look).
  scenePrompt: string;
};

function styleDescription(style: StyleKey): string {
  return style === "FIERCE"
    ? "the heroic 'fierce' NYU Shanghai qilin mascot — antlered, purple and silver, in a confident pose"
    : "the chibi 'cute' NYU Shanghai qilin mascot — purple, with yellow antlers, big sparkling eyes, and a friendly expression";
}

export function buildQilinPrompt(inputs: QilinJobInputs): ResolvedQilin {
  const location = inputs.location ?? pickRandomLocation();
  const style = inputs.style;
  const vibe = (inputs.vibe ?? "").trim();
  const styleDesc = styleDescription(style);
  const locationDesc = LOCATIONS[location].description;

  const portraitPrompt = inputs.hasSelfie
    ? [
        `Reimagine the person in the first reference photo as ${styleDesc}, in the visual style of the second reference image (the official qilin mascot art).`,
        "Keep the person's facial features, hair color, and overall vibe recognizable, but stylize the entire figure to look like a qilin character — antlers, mascot proportions, illustrated style.",
        "Plain neutral background. Centered character portrait. Vibrant illustration, NYU violet color palette.",
      ].join(" ")
    : "";

  const sceneLines: string[] = [];
  if (inputs.hasSelfie) {
    sceneLines.push(
      `Place the qilin character from the first reference image into ${locationDesc}, matching the second reference image's lighting and setting.`,
      "Preserve the character's appearance exactly; only change the background and lighting.",
    );
  } else {
    sceneLines.push(
      `Create an illustration of ${styleDesc}, in the visual style shown in the first reference image.`,
      `Place it in ${locationDesc}, drawing on the second reference image for the setting.`,
    );
  }
  if (vibe) sceneLines.push(`Additional direction from the user: "${vibe}".`);
  sceneLines.push(
    "16:9 landscape composition, vibrant illustration, NYU violet color palette, joyful and on-brand for a university student event.",
  );

  return {
    style,
    location,
    portraitPrompt,
    scenePrompt: sceneLines.join(" "),
  };
}

export function styleLabel(s: StyleKey): string {
  return STYLES[s].label;
}
