"use client";
import { useEffect, useRef, useState } from "react";

type Mode = "VIDEO" | "IMAGE" | "OFF";

type StyleKey = "FIERCE" | "CUTE";
type LocationKey = string;

type StylesAndLocations = {
  styles: { key: StyleKey; label: string; tagline: string; thumb: string }[];
  locations: { key: LocationKey; label: string; thumb: string }[];
};

type JobStatus = {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED";
  mode: Mode;
  mimeType: string | null;
  errorCode: string | null;
  errorMsg: string | null;
  position: number;
  hidden: boolean;
};

export default function SubmitForm({
  initialMode,
  refs,
}: {
  initialMode: Mode;
  refs: StylesAndLocations;
}) {
  const [style, setStyle] = useState<StyleKey>("FIERCE");
  const [location, setLocation] = useState<LocationKey>("random");
  const [vibe, setVibe] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs?id=${jobId}`, { cache: "no-store" });
        if (res.ok) {
          const j: JobStatus = await res.json();
          if (!stop) setJob(j);
          if (
            j.status === "COMPLETED" ||
            j.status === "FAILED" ||
            j.status === "BLOCKED"
          ) {
            return;
          }
        }
      } catch {}
      if (!stop) setTimeout(tick, 5000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [jobId]);

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) {
      setPhotoPreview(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("UPLOAD_TOO_LARGE");
      e.target.value = "";
      return;
    }
    setError(null);
    const url = URL.createObjectURL(f);
    setPhotoPreview(url);
  }

  function clearPhoto() {
    if (photoInput.current) photoInput.current.value = "";
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData(e.currentTarget);
      const res = await fetch("/api/jobs", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "submit_failed");
        if (data.error === "already_queued" && data.jobId) setJobId(data.jobId);
        return;
      }
      setJobId(data.id);
      // Drop the local photo preview — server has it now.
      clearPhoto();
    } finally {
      setSubmitting(false);
    }
  }

  if (jobId) {
    return (
      <section className="mt-6 space-y-3">
        <p className="text-sm text-neutral-400">Job ID: {jobId}</p>
        {!job ? (
          <p>Loading…</p>
        ) : job.status === "QUEUED" ? (
          <p className="text-lg">🕒 Queued · {job.position} ahead of you</p>
        ) : job.status === "RUNNING" ? (
          <p className="text-lg">⚙️ Generating your {job.mode.toLowerCase()}…</p>
        ) : job.status === "COMPLETED" ? (
          <div className="space-y-3">
            <p className="text-lg">✅ Done!</p>
            {job.mode === "VIDEO" ? (
              <video
                src={`/api/media/${job.id}`}
                controls
                autoPlay
                muted
                loop
                playsInline
                className="w-full rounded-xl"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${job.id}`}
                alt=""
                className="w-full rounded-xl"
              />
            )}
            <div className="flex gap-3 items-center">
              <a
                href={`/api/media/${job.id}?download=1`}
                download
                className="rounded-lg bg-white text-black font-medium px-4 py-2 text-sm"
              >
                ⬇ Save {job.mode === "VIDEO" ? "video" : "image"}
              </a>
              <a href="/" className="text-sm underline text-neutral-300">
                View on the gallery →
              </a>
              <button
                onClick={() => {
                  setJobId(null);
                  setJob(null);
                }}
                className="ml-auto text-sm underline text-neutral-400"
              >
                Make another
              </button>
            </div>
          </div>
        ) : job.status === "BLOCKED" ? (
          <div className="rounded-lg bg-amber-950/40 ring-1 ring-amber-800 p-4">
            <p className="font-medium">Couldn&apos;t generate this one</p>
            <p className="text-sm text-neutral-300 mt-1">{job.errorMsg}</p>
            <button
              className="mt-3 text-sm underline"
              onClick={() => {
                setJobId(null);
                setJob(null);
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="rounded-lg bg-red-950/40 ring-1 ring-red-800 p-4">
            <p className="font-medium">Generation failed</p>
            <p className="text-sm text-neutral-300 mt-1">{job.errorMsg}</p>
            <button
              className="mt-3 text-sm underline"
              onClick={() => {
                setJobId(null);
                setJob(null);
              }}
            >
              Try again
            </button>
          </div>
        )}
      </section>
    );
  }

  if (initialMode === "OFF") {
    return (
      <p className="mt-6 text-neutral-300">
        The event is paused — check back in a bit.
      </p>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 space-y-5"
      encType="multipart/form-data"
    >
      {/* Style radios */}
      <fieldset className="space-y-2">
        <legend className="text-sm text-neutral-300 font-medium">
          Style <span className="text-neutral-500">(required)</span>
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {refs.styles.map((s) => (
            <label
              key={s.key}
              className={`relative cursor-pointer rounded-xl ring-1 overflow-hidden ${
                style === s.key
                  ? "ring-white"
                  : "ring-neutral-800 hover:ring-neutral-600"
              }`}
            >
              <input
                type="radio"
                name="style"
                value={s.key}
                checked={style === s.key}
                onChange={() => setStyle(s.key)}
                className="sr-only"
              />
              <div className="aspect-square bg-neutral-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.thumb}
                  alt={s.label}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="p-2">
                <div className="text-sm font-medium">{s.label}</div>
                <div className="text-xs text-neutral-400">{s.tagline}</div>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Location */}
      <div>
        <label className="block text-sm text-neutral-300 font-medium mb-1">
          Location{" "}
          <span className="text-neutral-500">(optional — random if blank)</span>
        </label>
        <select
          name="location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full rounded-lg bg-neutral-900 ring-1 ring-neutral-800 p-2.5 text-base focus:outline-none focus:ring-neutral-600"
        >
          <option value="random">🎲 Surprise me</option>
          {refs.locations.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      {/* Photo upload — the <input type="file"> is ALWAYS mounted so its
          selected File survives the preview vs. picker swap. Without this,
          unmounting on photoPreview would drop the file from FormData. */}
      <div>
        <div className="block text-sm text-neutral-300 font-medium mb-1">
          Selfie <span className="text-neutral-500">(optional)</span>
        </div>
        <input
          ref={photoInput}
          type="file"
          name="photo"
          accept="image/*"
          capture="user"
          onChange={onPhotoChange}
          className="sr-only"
          id="photo-input"
        />
        {photoPreview ? (
          <div className="relative rounded-xl overflow-hidden ring-1 ring-neutral-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="Preview" className="w-full max-h-72 object-cover" />
            <button
              type="button"
              onClick={clearPhoto}
              className="absolute top-2 right-2 rounded-full bg-black/70 px-2 py-1 text-xs"
            >
              Remove
            </button>
          </div>
        ) : (
          <label
            htmlFor="photo-input"
            className="flex flex-col items-center justify-center gap-1 w-full h-28 rounded-lg bg-neutral-900 ring-1 ring-dashed ring-neutral-700 cursor-pointer hover:ring-neutral-500"
          >
            <span className="text-2xl">📷</span>
            <span className="text-sm text-neutral-300">Tap to add a photo</span>
            <span className="text-xs text-neutral-500">
              We&apos;ll transform you into a qilin
            </span>
          </label>
        )}
      </div>

      {/* Vibe */}
      <label className="block">
        <span className="text-sm text-neutral-300 font-medium">
          Vibe <span className="text-neutral-500">(optional, ≤200 chars)</span>
        </span>
        <textarea
          name="vibe"
          maxLength={200}
          value={vibe}
          onChange={(e) => setVibe(e.target.value)}
          rows={3}
          placeholder="e.g. holding a bubble tea, mid-leap, soft sunset light"
          className="mt-1 w-full rounded-lg bg-neutral-900 ring-1 ring-neutral-800 p-3 text-base focus:outline-none focus:ring-neutral-600"
        />
      </label>

      {error === "already_queued" ? (
        <p className="text-sm text-amber-400">
          You already have a job in flight — watch its progress above.
        </p>
      ) : error === "user_limit_reached" ? (
        <p className="text-sm text-amber-400">
          You&apos;ve hit your generation limit. Save your favorites and enjoy
          the gallery!
        </p>
      ) : error === "UPLOAD_TOO_LARGE" ? (
        <p className="text-sm text-amber-400">
          That photo is over 5 MB. Try a smaller one (or no photo).
        </p>
      ) : error === "UPLOAD_DECODE_FAILED" || error === "UPLOAD_UNSUPPORTED_TYPE" ? (
        <p className="text-sm text-amber-400">
          We couldn&apos;t read that photo. Try a JPG or PNG.
        </p>
      ) : error ? (
        <p className="text-sm text-red-400">Error: {error}</p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-white text-black font-medium py-3 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : `Generate (${initialMode.toLowerCase()})`}
      </button>
    </form>
  );
}
