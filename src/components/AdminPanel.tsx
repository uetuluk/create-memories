"use client";
import { useEffect, useState } from "react";

type Mode = "VIDEO" | "IMAGE" | "OFF";
type AppState = {
  mode: Mode;
  videoCount: number;
  videoCap: number;
  perUserQuota: number;
  requireLogin: boolean;
  totalCostUsd: string;
};
type AdminJob = {
  id: string;
  status: string;
  mode: Mode;
  prompt: string;
  rewritten: string | null;
  hidden: boolean;
  mimeType: string | null;
  errorMsg: string | null;
  createdAt: string;
  completedAt: string | null;
  user: { email: string | null } | null;
};
type UsageBucket = {
  kind: "TEXT" | "IMAGE" | "VIDEO";
  model: string;
  count: number;
  costUsd: number;
};
type UsageEvent = {
  id: string;
  jobId: string | null;
  kind: "TEXT" | "IMAGE" | "VIDEO";
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  durationSeconds: number | null;
  costUsd: string | number;
  ok: boolean;
  errorCode: string | null;
  createdAt: string;
};
type UsageRes = {
  buckets: UsageBucket[];
  recent: UsageEvent[];
  totalCostUsd: number;
  totalCount: number;
};

export default function AdminPanel() {
  const [state, setState] = useState<AppState | null>(null);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [usage, setUsage] = useState<UsageRes | null>(null);

  async function refresh() {
    const [s, j, u] = await Promise.all([
      fetch("/api/mode", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/jobs", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/usage", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setState(s);
    setJobs(j.jobs);
    setUsage(u);
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

  async function patchState(
    body: Partial<{ videoCap: number; perUserQuota: number; requireLogin: boolean }>,
  ) {
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

          <div>
            <div className="text-sm text-neutral-400">Login requirement</div>
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => patchState({ requireLogin: !state.requireLogin })}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ${
                  state.requireLogin
                    ? "bg-emerald-900/40 text-emerald-100 ring-emerald-700"
                    : "bg-amber-900/40 text-amber-100 ring-amber-700"
                }`}
              >
                {state.requireLogin ? "Login required" : "Kiosk (no login)"}
              </button>
              <span className="text-xs text-neutral-500">
                {state.requireLogin
                  ? "/submit redirects to magic-link sign-in."
                  : "Anyone with the QR can submit. Per-user quota disabled — only video cap stops spend."}
              </span>
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

      {usage && (
        <section className="rounded-xl bg-neutral-900 ring-1 ring-neutral-800 p-4">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-lg font-medium">API spend</h2>
            <span className="text-sm">
              <span className="text-neutral-400">total</span>{" "}
              <span className="font-medium">${usage.totalCostUsd.toFixed(4)}</span>{" "}
              <span className="text-neutral-500">({usage.totalCount} calls)</span>
            </span>
          </div>
          {usage.buckets.length === 0 ? (
            <p className="text-sm text-neutral-500">No API calls yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-neutral-500 text-xs">
                <tr>
                  <th className="text-left py-1">Kind</th>
                  <th className="text-left py-1">Model</th>
                  <th className="text-right py-1">Calls</th>
                  <th className="text-right py-1">Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.buckets.map((b) => (
                  <tr key={`${b.kind}-${b.model}`} className="border-t border-neutral-800">
                    <td className="py-1.5">{b.kind}</td>
                    <td className="py-1.5 text-neutral-300">{b.model}</td>
                    <td className="py-1.5 text-right">{b.count}</td>
                    <td className="py-1.5 text-right">${b.costUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <details className="mt-3">
            <summary className="text-xs text-neutral-400 cursor-pointer">
              Recent events ({usage.recent.length})
            </summary>
            <div className="mt-2 space-y-1 max-h-72 overflow-auto">
              {usage.recent.map((e) => (
                <div
                  key={e.id}
                  className={`text-xs flex gap-2 items-center px-2 py-1 rounded ${
                    e.ok ? "bg-neutral-950" : "bg-red-950/40"
                  }`}
                >
                  <span className="text-neutral-500 w-32 shrink-0">
                    {new Date(e.createdAt).toLocaleTimeString()}
                  </span>
                  <span className="w-12 shrink-0">{e.kind}</span>
                  <span className="flex-1 truncate text-neutral-300">{e.model}</span>
                  <span className="text-neutral-400 w-32 shrink-0 text-right">
                    {e.kind === "TEXT"
                      ? `${e.inputTokens ?? 0}→${e.outputTokens ?? 0} tok`
                      : e.kind === "VIDEO"
                      ? `${e.durationSeconds ?? 0}s`
                      : "1 img"}
                  </span>
                  <span className="w-20 shrink-0 text-right">
                    ${Number(e.costUsd).toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </section>
      )}

      <section>
        <h2 className="text-lg font-medium mb-2">Recent jobs</h2>
        <div className="space-y-2">
          {jobs.map((j) => (
            <div
              key={j.id}
              className="rounded-lg bg-neutral-900 ring-1 ring-neutral-800 p-3 text-sm"
            >
              <div className="flex gap-3">
                {j.status === "COMPLETED" ? (
                  <a
                    href={`/api/media/${j.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 w-24 aspect-video rounded-md bg-black overflow-hidden ring-1 ring-neutral-800"
                    title="Open full size"
                  >
                    {j.mimeType?.startsWith("video/") || j.mode === "VIDEO" ? (
                      <video
                        src={`/api/media/${j.id}`}
                        muted
                        loop
                        playsInline
                        autoPlay
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/media/${j.id}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </a>
                ) : (
                  <div className="shrink-0 w-24 aspect-video rounded-md bg-neutral-950 ring-1 ring-neutral-800 flex items-center justify-center text-[10px] text-neutral-600">
                    {j.status}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className="text-xs text-neutral-500 truncate max-w-full">
                      {j.user?.email ?? "anonymous"}
                    </span>
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
                  <div className="mt-1 line-clamp-2">{j.prompt || "(no vibe)"}</div>
                  {j.errorMsg && (
                    <div className="text-xs text-red-300 mt-1 line-clamp-2">
                      {j.errorMsg}
                    </div>
                  )}
                </div>
              </div>
              {j.status === "COMPLETED" && (
                <button
                  onClick={() => setHidden(j.id, !j.hidden)}
                  className={`mt-3 w-full rounded-md py-2 text-sm font-medium ${
                    j.hidden
                      ? "bg-neutral-800 text-neutral-200"
                      : "bg-amber-900/50 text-amber-100 ring-1 ring-amber-800"
                  }`}
                >
                  {j.hidden ? "Unhide" : "Hide from gallery"}
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
