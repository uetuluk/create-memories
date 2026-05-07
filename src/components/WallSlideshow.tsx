"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type Item = {
  id: string;
  mode: "VIDEO" | "IMAGE" | "OFF";
  mimeType: string | null;
  prompt: string;
  rewritten: string | null;
  completedAt: string | null;
};

const IMAGE_HOLD_MS = 5_000; // 5s per still image
const VIDEO_TAIL_MS = 1_000; // pause after a video ends before advancing
const POLL_MS = 30_000; // refresh the playlist every 30s
const MAX_ITEMS = 500;

export default function WallSlideshow() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [index, setIndex] = useState(0);

  // Fetch + refresh the playlist. We don't reset the index on refresh;
  // we reconcile it against the new list so the rotation keeps moving
  // forward even as new items appear.
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/gallery?all=1&limit=${MAX_ITEMS}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const j: { items: Item[] } = await res.json();
          if (!stop) setItems(j.items);
        }
      } catch {}
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const list = useMemo(() => items ?? [], [items]);
  const current = list.length > 0 ? list[index % list.length] : null;
  const next = list.length > 1 ? list[(index + 1) % list.length] : null;

  const advance = () => setIndex((i) => i + 1);

  // Hold timer for images. Videos advance via onEnded.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (!current || current.mode === "VIDEO") return;
    timeoutRef.current = setTimeout(advance, IMAGE_HOLD_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!items) {
    return (
      <div className="absolute inset-0 grid place-items-center text-neutral-500">
        Loading wall…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="absolute inset-0 grid place-items-center text-neutral-400">
        <div className="text-center">
          <p className="text-3xl">No memories yet</p>
          <p className="text-sm mt-2 text-neutral-500">
            Submit one and it&apos;ll appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {current && <Slide key={current.id} item={current} onVideoEnd={advance} />}
      {/* Preload the next item so transitions feel instant */}
      {next && next.id !== current?.id && <Preload item={next} />}

      {/* Tiny meta strip in a corner — useful for ops, invisible-ish to viewers */}
      <div className="absolute bottom-3 right-3 text-[11px] text-neutral-500/70 tabular-nums">
        {(index % items.length) + 1} / {items.length}
      </div>
    </>
  );
}

function Slide({ item, onVideoEnd }: { item: Item; onVideoEnd: () => void }) {
  const src = `/api/media/${item.id}`;
  const isVideo = item.mode === "VIDEO" || item.mimeType?.startsWith("video/");
  return (
    <div className="absolute inset-0 animate-fade-in">
      {isVideo ? (
        <video
          src={src}
          autoPlay
          muted
          playsInline
          onEnded={() => setTimeout(onVideoEnd, 1000 /* VIDEO_TAIL_MS */)}
          onError={() => onVideoEnd()}
          className="w-full h-full object-contain bg-black"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          onError={() => onVideoEnd()}
          className="w-full h-full object-contain bg-black"
        />
      )}
    </div>
  );
}

function Preload({ item }: { item: Item }) {
  const src = `/api/media/${item.id}`;
  // For videos we use a hidden video element so the browser starts buffering;
  // for images, a hidden <img> primes the cache.
  if (item.mode === "VIDEO" || item.mimeType?.startsWith("video/")) {
    return (
      <video
        src={src}
        muted
        preload="auto"
        playsInline
        className="hidden"
        aria-hidden
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="hidden" aria-hidden />
  );
}
