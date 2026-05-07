"use client";
import { useEffect, useState } from "react";

type Mode = "VIDEO" | "IMAGE" | "OFF";

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

export default function SubmitForm({ initialMode }: { initialMode: Mode }) {
  const [prompt, setPrompt] = useState("");
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "submit_failed");
        if (data.error === "already_queued" && data.jobId) setJobId(data.jobId);
        return;
      }
      setJobId(data.id);
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
          <p className="text-lg">
            🕒 Queued · {job.position} ahead of you
          </p>
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
            </div>
          </div>
        ) : job.status === "BLOCKED" ? (
          <div className="rounded-lg bg-amber-950/40 ring-1 ring-amber-800 p-4">
            <p className="font-medium">Prompt not allowed</p>
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
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <label className="block">
        <span className="text-sm text-neutral-400">Your prompt</span>
        <textarea
          required
          maxLength={500}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder="a corgi astronaut floating above the Pudong skyline at sunrise"
          className="mt-1 w-full rounded-lg bg-neutral-900 ring-1 ring-neutral-800 p-3 text-base focus:outline-none focus:ring-neutral-600"
        />
      </label>
      <p className="text-xs text-neutral-500">
        Your prompt will be safety-checked and rewritten for best results. One
        submission at a time per person.
      </p>
      {error === "already_queued" ? (
        <p className="text-sm text-amber-400">
          You already have a job in flight — watch its progress above.
        </p>
      ) : error === "user_limit_reached" ? (
        <p className="text-sm text-amber-400">
          You&apos;ve hit your 5-generation limit. Save your favorites and
          enjoy the gallery!
        </p>
      ) : error ? (
        <p className="text-sm text-red-400">Error: {error}</p>
      ) : null}
      <button
        type="submit"
        disabled={submitting || !prompt.trim()}
        className="w-full rounded-lg bg-white text-black font-medium py-3 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : `Generate (${initialMode.toLowerCase()})`}
      </button>
    </form>
  );
}
