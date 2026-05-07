"use client";
import { useEffect, useState } from "react";

type Mode = "VIDEO" | "IMAGE" | "OFF";
type AppState = {
  mode: Mode;
  videoCount: number;
  videoCap: number;
  perUserQuota: number;
  totalCostUsd: string;
};
type AdminJob = {
  id: string;
  status: string;
  mode: Mode;
  prompt: string;
  rewritten: string | null;
  hidden: boolean;
  errorMsg: string | null;
  createdAt: string;
  completedAt: string | null;
  user: { email: string | null };
};

export default function AdminPanel() {
  const [state, setState] = useState<AppState | null>(null);
  const [jobs, setJobs] = useState<AdminJob[]>([]);

  async function refresh() {
    const [s, j] = await Promise.all([
      fetch("/api/mode", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/jobs", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setState(s);
    setJobs(j.jobs);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  async function setMode(mode: Mode) {
    await fetch("/api/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    refresh();
  }

  async function patchState(body: Partial<{ videoCap: number; perUserQuota: number }>) {
    await fetch("/api/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    refresh();
  }

  async function setHidden(id: string, hidden: boolean) {
    await fetch("/api/admin/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hidden }),
    });
    refresh();
  }

  return (
    <div className="space-y-6 mt-6">
      {state && (
        <section className="rounded-xl bg-neutral-900 ring-1 ring-neutral-800 p-4 space-y-4">
          <div>
            <div className="text-sm text-neutral-400">App state</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>Mode</div>
              <div className="font-medium">{state.mode}</div>
              <div>Videos</div>
              <div className="font-medium">
                {state.videoCount} / {state.videoCap}
              </div>
              <div>Total spent</div>
              <div className="font-medium">${state.totalCostUsd}</div>
            </div>
            <div className="mt-3 flex gap-2">
              {(["VIDEO", "IMAGE", "OFF"] as const).map((m) => (
                <button
                  key={m}
                  disabled={m === state.mode}
                  onClick={() => setMode(m)}
                  className="rounded-lg px-3 py-1.5 text-sm bg-white text-black disabled:opacity-40"
                >
                  Set {m}
                </button>
              ))}
            </div>
          </div>

          <NumberSetting
            label="Per-user quota"
            value={state.perUserQuota}
            onSave={(perUserQuota) => patchState({ perUserQuota })}
            help="Max generations per user (counts QUEUED + RUNNING + COMPLETED)."
          />

          <NumberSetting
            label="Video cap"
            value={state.videoCap}
            onSave={(videoCap) => patchState({ videoCap })}
            help="Auto-switches mode to IMAGE when this many videos have been generated."
          />
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium mb-2">Recent jobs</h2>
        <div className="space-y-2">
          {jobs.map((j) => (
            <div
              key={j.id}
              className="rounded-lg bg-neutral-900 ring-1 ring-neutral-800 p-3 text-sm flex gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-neutral-500">{j.user.email}</span>
                  <span className="text-xs px-1.5 rounded bg-neutral-800">
                    {j.mode}
                  </span>
                  <span className="text-xs px-1.5 rounded bg-neutral-800">
                    {j.status}
                  </span>
                  {j.hidden && (
                    <span className="text-xs px-1.5 rounded bg-amber-900">
                      hidden
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate">{j.prompt}</div>
                {j.errorMsg && (
                  <div className="text-xs text-red-300 mt-1 truncate">
                    {j.errorMsg}
                  </div>
                )}
              </div>
              {j.status === "COMPLETED" && (
                <button
                  onClick={() => setHidden(j.id, !j.hidden)}
                  className="self-start rounded-md px-2 py-1 text-xs bg-neutral-800"
                >
                  {j.hidden ? "Unhide" : "Hide"}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function NumberSetting({
  label,
  value,
  onSave,
  help,
}: {
  label: string;
  value: number;
  onSave: (next: number) => void | Promise<void>;
  help?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Only adopt the server value when we don't have a local edit in progress.
  const display = draft ?? String(value);
  const dirty = draft !== null && draft !== String(value);
  const parsed = Number(display);
  const valid = Number.isFinite(parsed) && parsed >= 0 && Number.isInteger(parsed);
  return (
    <div>
      <div className="text-sm text-neutral-400">{label}</div>
      <div className="mt-2 flex gap-2 items-center">
        <input
          type="number"
          min={0}
          value={display}
          onChange={(e) => setDraft(e.target.value)}
          className="w-24 rounded-lg bg-neutral-950 ring-1 ring-neutral-800 px-2 py-1 text-sm"
        />
        <button
          disabled={!dirty || !valid}
          onClick={async () => {
            await onSave(parsed);
            setDraft(null);
          }}
          className="rounded-lg px-3 py-1 text-sm bg-white text-black disabled:opacity-40"
        >
          Save
        </button>
        {help && <span className="text-xs text-neutral-500">{help}</span>}
      </div>
    </div>
  );
}
