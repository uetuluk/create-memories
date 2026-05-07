"use client";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  mode: "VIDEO" | "IMAGE" | "OFF";
  mimeType: string | null;
  completedAt: string | null;
};

type GalleryRes = {
  items: Item[];
  mode: "VIDEO" | "IMAGE" | "OFF";
  videoCount: number;
  videoCap: number;
};

export default function GalleryGrid() {
  const [data, setData] = useState<GalleryRes | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/gallery", { cache: "no-store" });
        if (res.ok) {
          const j: GalleryRes = await res.json();
          if (!stop) setData(j);
        }
      } catch {}
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  if (!data) return <p className="text-neutral-500">Loading gallery…</p>;

  return (
    <>
      <div className="text-sm text-neutral-400 mb-4 flex gap-4">
        <span>
          Mode:{" "}
          <span className="text-neutral-100 font-medium">{data.mode}</span>
        </span>
        <span>
          Videos generated:{" "}
          <span className="text-neutral-100 font-medium">
            {data.videoCount} / {data.videoCap}
          </span>
        </span>
      </div>
      {data.items.length === 0 ? (
        <p className="text-neutral-500 text-lg">
          No memories yet — be the first to submit one.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.items.map((item) => (
            <GalleryItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  );
}

function GalleryItem({ item }: { item: Item }) {
  const src = `/api/media/${item.id}`;
  return (
    <div className="aspect-video bg-neutral-900 rounded-xl overflow-hidden ring-1 ring-neutral-800">
      {item.mode === "VIDEO" ? (
        <video
          src={src}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-full h-full object-cover" />
      )}
    </div>
  );
}
