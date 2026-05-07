"use client";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  mode: "VIDEO" | "IMAGE" | "OFF";
  mimeType: string | null;
  prompt: string;
  rewritten: string | null;
  hidden: boolean;
  completedAt: string | null;
};
type MineRes = { items: Item[]; used: number; limit: number };

export default function MyMemories() {
  const [data, setData] = useState<MineRes | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (res.ok) {
          const j: MineRes = await res.json();
          if (!stop) setData(j);
        }
      } catch {}
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  if (!data) return null;
  if (data.items.length === 0 && data.used === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-medium">Your memories</h2>
        <span className="text-xs text-neutral-400">
          {data.used} / {data.limit} used
        </span>
      </div>
      {data.items.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Generations in progress will appear here when they finish.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {data.items.map((item) => (
            <MemoryCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function MemoryCard({ item }: { item: Item }) {
  const src = `/api/media/${item.id}`;
  const ext =
    item.mode === "VIDEO" ? "mp4" : item.mimeType === "image/jpeg" ? "jpg" : "png";
  return (
    <div className="rounded-xl bg-neutral-900 ring-1 ring-neutral-800 overflow-hidden">
      <div className="aspect-video bg-black">
        {item.mode === "VIDEO" ? (
          <video
            src={src}
            muted
            loop
            playsInline
            autoPlay
            className="w-full h-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="p-2 space-y-1">
        <p className="text-xs text-neutral-400 line-clamp-2">{item.prompt}</p>
        <div className="flex items-center justify-between">
          {item.hidden ? (
            <span className="text-[10px] text-amber-400">hidden by admin</span>
          ) : (
            <span className="text-[10px] text-neutral-500">
              {item.completedAt
                ? new Date(item.completedAt).toLocaleString()
                : ""}
            </span>
          )}
          <a
            href={`${src}?download=1`}
            download={`create-memories-${item.id}.${ext}`}
            className="text-xs underline text-neutral-300"
          >
            ⬇ Save
          </a>
        </div>
      </div>
    </div>
  );
}
