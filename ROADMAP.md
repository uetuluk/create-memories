# Roadmap

Things we want eventually but didn't ship for the first event run. Loosely
ordered by ROI.

## Cost / quota observability

- **ETA on the submit + Maxhub view.** Record `Job.durationMs` on every
  COMPLETED job (already have `startedAt` + `completedAt`, just need to
  expose). Compute a rolling p50/p90 by `mode` over the last ~50 jobs.
  Surface as:
  - submit page during RUNNING: *"Average qilin takes ~70s. Hang tight."*
  - Maxhub gallery: a small *"🟢 Generating now · ETA ~30s"* overlay tied
    to the currently-RUNNING job.

  Polling is already in place; this is mostly UI + one new aggregation
  endpoint (`/api/stats/eta?mode=VIDEO`).

## Throughput

- **Configurable parallelism.** Today the worker holds a single
  `pg_advisory_lock(731_001)` so exactly one job runs at a time. Two
  paths to lift this when needed:
  1. *Static via compose:* drop the advisory lock entirely, switch to
     `SELECT … FOR UPDATE SKIP LOCKED`, scale the worker service to
     `replicas: N`. Simple, parallelism set at deploy time.
  2. *Runtime via admin:* one process, N concurrent in-process workers
     keyed by `pg_advisory_lock(731_001 + i)` for `i in 0..N-1`. Admin
     sets `AppState.parallelism` from `/admin`; the worker spawns /
     drains accordingly.

  ⚠ Veo concurrent calls are rate-limited per Gemini API key (typically
  a few per minute). Cranking parallelism past ~2 will trade queue time
  for 429s and wasted partial spend. Validate against the key's actual
  quota before cranking.

## Wall mode (#3 implemented this round, see below)

- **Themed slideshows.** Once we have wall mode, optional filters: only
  fierce qilins, only library shots, only today's clips for an end-of-
  day recap.
- **Auto-pause on hide.** If admin hides an item *while it's being shown
  on /wall*, the wall should jump to the next one immediately rather
  than wait for the rotation tick.

## Nice-to-have post-event

- **Bulk export.** Admin button that zips up all visible COMPLETED
  artifacts + a CSV of metadata (style, location, vibe, completedAt) so
  the committee can publish the recap without manually scraping URLs.
- **Per-student "your memories" share link.** Single URL that a student
  can keep for their own gallery view of just their submissions.
  Currently they only see them while signed in.
- **Veo SDK upgrade.** When `@google/genai` ships a release that natively
  supports `source: { prompt }` and `imageConfig.aspectRatio`, drop our
  workarounds in `src/lib/genai.ts` and `src/lib/qilin.ts` (the prompt
  hint that asks for 16:9).
- **Selfie pipeline UX.** Right now the API rejects the multipart
  request if sharp can't decode the upload (e.g. an iOS HEIC variant we
  don't recognize). Add a friendlier client-side preview-decode so the
  failure surfaces *before* the user hits Submit.

## Operational

- **DNS / TLS hardening.** Caddy currently uses Cloudflare DNS-01 because
  the deploy host has an internal IP. If the host ever moves to a public
  IP, switch back to plain `caddy:latest` + HTTP-01 to remove a moving
  piece (Cloudflare token rotation, plugin image dependency).
- **Reproducible deploys.** The `deployment` branch carries the rendered
  `compose.yml` / `Caddyfile` / `smtpd.conf`. The server's `.env` is
  hand-managed, which means an operator can drift. Consider a sealed
  secrets approach or 1Password CLI for `.env` regeneration.
- **Email reputation.** First magic-link emails landed in NYU
  Proofpoint's quarantine because `ritsdev.top` lacks SPF/DKIM/DMARC.
  We worked around it by sending From `@ai-infra-committee.shanghai.nyu.edu`
  (which has NYU's SPF). For a future event on a different domain,
  publish SPF + DKIM for the sending domain *before* launch day.
