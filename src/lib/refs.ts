import { promises as fs } from "node:fs";
import path from "node:path";

// Reference images baked into the docker image at public/refs/.
// Keep keys stable — they're persisted on Job rows.

export type StyleKey = "FIERCE" | "CUTE";

export const STYLES: Record<StyleKey, { label: string; file: string; tagline: string }> = {
  FIERCE: {
    label: "Fierce",
    file: "fierce.jpg",
    tagline: "Heroic NYU mascot energy — antlers up, ready for battle",
  },
  CUTE: {
    label: "Cute",
    file: "cute.jpg",
    tagline: "Chibi mascot vibes — pigtails, sparkles, big smile",
  },
};

export type LocationKey =
  | "campus-outside"
  | "classroom"
  | "lab"
  | "library"
  | "pearl-tower"
  | "quad"
  | "xr-space"
  | "dorm-1"
  | "dorm-2";

export const LOCATIONS: Record<
  LocationKey,
  { label: string; file: string; description: string }
> = {
  "campus-outside": {
    label: "Campus exterior",
    file: "campus-outside.jpg",
    description: "the front of the NYU Shanghai campus building from the street",
  },
  classroom: {
    label: "Classroom",
    file: "classroom.jpg",
    description: "an NYU Shanghai classroom with rows of desks and a whiteboard",
  },
  lab: {
    label: "Lab",
    file: "lab.jpg",
    description: "an NYU Shanghai research lab with workbenches and equipment",
  },
  library: {
    label: "Library",
    file: "library.jpg",
    description: "the NYU Shanghai library — bookshelves, study tables, soft natural light",
  },
  "pearl-tower": {
    label: "Oriental Pearl Tower",
    file: "pearl-tower.jpg",
    description: "the Pudong skyline with the Oriental Pearl Tower in view",
  },
  quad: {
    label: "Quad",
    file: "quad.jpg",
    description: "the NYU Shanghai quad / outdoor courtyard",
  },
  "xr-space": {
    label: "XR Space",
    file: "xr-space.jpg",
    description: "the NYU Shanghai XR / VR creative space",
  },
  "dorm-1": {
    label: "Jinyao dorms (lounge)",
    file: "dorm-1.jpg",
    description: "the Jinyao residence hall common lounge",
  },
  "dorm-2": {
    label: "Jinyao dorms (room)",
    file: "dorm-2.jpg",
    description: "a Jinyao residence hall student room",
  },
};

const REFS_ROOT = path.join(process.cwd(), "public", "refs");

export function styleRefPath(key: StyleKey): string {
  return path.join(REFS_ROOT, "styles", STYLES[key].file);
}

export function locationRefPath(key: LocationKey): string {
  return path.join(REFS_ROOT, "locations", LOCATIONS[key].file);
}

export function pickRandomLocation(): LocationKey {
  const keys = Object.keys(LOCATIONS) as LocationKey[];
  return keys[Math.floor(Math.random() * keys.length)];
}

export function isLocationKey(s: unknown): s is LocationKey {
  return typeof s === "string" && s in LOCATIONS;
}

export function isStyleKey(s: unknown): s is StyleKey {
  return s === "FIERCE" || s === "CUTE";
}

export async function readRefAsBase64(
  absPath: string,
): Promise<{ data: string; mimeType: string }> {
  const buf = await fs.readFile(absPath);
  const ext = absPath.toLowerCase().split(".").pop();
  const mimeType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return { data: buf.toString("base64"), mimeType };
}
