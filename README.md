# create-memories.ritsdev.top

One-day student event app for NYU Shanghai AI Committee × Library Relaxation Week. Students submit a prompt from their phone (QR on a Maxhub) and get a 5-second Veo 3.1 Lite video, or — once the budget cap is hit — a Nano Banana 2 image.

- Magic-link auth restricted to `@nyu.edu`
- One generation at a time, FIFO queue enforced by a Postgres advisory lock
- Gemini 3.1 Flash rewrites + safety-checks each prompt before any spend
- Auto-switch from `VIDEO` to `IMAGE` mode when 200 videos have completed
- Admin page at `/admin` for mode toggle and per-item hide

## Stack

- Next.js 15 (App Router) + TypeScript
- Postgres 16 + Prisma 5
- Auth.js v5 + Nodemailer (Email provider)
- `@google/genai` for Veo 3.1 Lite, Nano Banana 2, Gemini 3.1 Flash
- Caddy (auto-HTTPS) reverse proxy
- `wodby/opensmtpd` SMTP relay sidecar
- Docker Compose (db + app + worker + caddy + smtp-relay + migrate job)
- GitHub Actions → GHCR image → server pulls

## Deploy flow (mirrors `ghcr.io/shanghai-rits/ask`)

1. **Push to `main`/`master`.**
2. `.github/workflows/docker-build.yml` builds and pushes `ghcr.io/<owner>/create-memories:latest` to GHCR.
3. `.github/workflows/main.yml` renders `Caddyfile`, `smtpd.conf` (using GitHub repository **vars** `SMTP_TRUSTED_NETS` and `SMTP_RELAY_HELO_DOMAIN`), and `compose.yml` (= `compose.production.yml`) into a `deployment` branch.
4. The server (`ssh create`) pulls the `deployment` branch, has its own `.env` file, and runs `docker compose pull && docker compose up -d`.

The server never builds — it only pulls.

### One-time GitHub setup

Before the first push:

- **Repository → Settings → Variables → Actions** (these are vars, not secrets — they're plaintext in the rendered `smtpd.conf` published to the `deployment` branch):
  - `SMTP_TRUSTED_NETS` — Docker subnet allowed to relay through OpenSMTPD, e.g. `172.20.0.0/16`. Find it post-deploy with `docker network inspect create-memories_external | jq '.[0].IPAM.Config'`.
  - `SMTP_RELAY_HELO_DOMAIN` — FQDN OpenSMTPD presents on `HELO`, e.g. `create.shanghai.nyu.edu` (run `hostname -f` on the server to confirm).

  Set both at once via the helper:
  ```bash
  ./scripts/setup-repo-vars.sh --repo <owner>/create-memories
  ```
- **GHCR visibility** — first push creates the package as private. To let the server pull without auth, change visibility to public under your GitHub user/org → Packages → `create-memories` → Package settings.

### Server-side setup (`ssh create`, one-time)

```bash
ssh create
git clone -b deployment https://github.com/<owner>/create-memories.git ~/create-memories
cd ~/create-memories
cp /path/to/your/.env .env  # see Environment table below
docker compose pull
docker compose up -d
docker compose logs -f app worker
```

DNS: create an `A` record `create-memories.ritsdev.top` → server IP. Caddy auto-issues a Let's Encrypt cert via HTTP-01.

### On every subsequent deploy (`ssh create`)

```bash
cd ~/create-memories
git pull
docker compose pull
docker compose up -d
```

## Environment

Server-side `.env` (template at [`.env.example`](./.env.example)):

| Var | Notes |
| --- | --- |
| `IMAGE_OWNER` | GitHub owner (lowercase) for `ghcr.io/<owner>/create-memories:latest` |
| `BASE_URL` | `https://create-memories.ritsdev.top` — Caddy issues a cert for this hostname |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Postgres credentials |
| `DATABASE_URL` | `postgres://app:...@db:5432/app` |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL`, `AUTH_TRUST_HOST` | `https://create-memories.ritsdev.top`, `true` |
| `EMAIL_SERVER` | `smtp://smtp-relay:25` — points at the in-stack OpenSMTPD container |
| `EMAIL_FROM` | sender shown in magic-link emails |
| `ALLOWED_EMAIL_DOMAINS` | comma-list, default `nyu.edu` |
| `ADMIN_EMAILS` | comma-list of emails that can access `/admin` |
| `GEMINI_API_KEY` | Google AI Studio key with billing enabled |
| `PUBLIC_URL` | URL the app uses to build absolute links (e.g. QR target) |

## Local development

```bash
cp .env.example .env.local
# fill GEMINI_API_KEY, AUTH_SECRET, EMAIL_SERVER (see below), ADMIN_EMAILS

# 1. Postgres
docker compose -f compose.dev.yaml up -d
export DATABASE_URL=postgres://app:app@localhost:5432/app

# 2. Schema
npm install
npx prisma migrate dev --name init
npm run db:seed

# 3. Two terminals
npm run dev          # next dev on :3000
npm run worker       # tsx src/worker/index.ts
```

For local magic-link testing without a real SMTP relay, point `EMAIL_SERVER` at [Mailpit](https://github.com/axllent/mailpit) (`smtp://localhost:1025`) and read the link from its UI on `:8025`.

## Cost model

| Mode | Model | Cost / generation |
| --- | --- | --- |
| Video (default) | `veo-3.1-lite-generate-preview`, 5s @ 720p | ≈ $0.25 |
| Image (after cap) | `gemini-3.1-flash-image-preview` (Nano Banana 2), 1K | ≈ $0.067 |
| Prompt rewrite + safety | `gemini-3.1-flash` | ≪ $0.001 |

`AppState.videoCap = 200` keeps video spend under $50 with headroom; the remaining budget covers image fallback indefinitely.

## Admin runbook

- Visit `/admin` (your email must be in `ADMIN_EMAILS`).
- Buttons set mode to `VIDEO`, `IMAGE`, or `OFF`.
- "Hide" removes an item from the public gallery and from `/api/media/<id>` (returns 404).
- The auto-switch from VIDEO → IMAGE happens inside the worker transaction at the configured `videoCap` — no manual action needed when the cap is hit.

## Architecture notes

- **Migration:** `app-migrate` is a one-shot service (`npx prisma migrate deploy`) that the `app` and `worker` services wait on with `service_completed_successfully`.
- **Queue correctness:** the worker holds a Postgres advisory lock (`pg_advisory_lock(731001)`) so even if the `worker` service ever runs more than one replica, only one job is generated at a time.
- **Crash recovery:** on startup the worker reaps any `RUNNING` jobs older than 10 minutes to `FAILED`.
- **Storage:** all generated assets live on the `media` named Docker volume (`/data/media` inside the container). Expect ≈ 1 GB max for the event.
- **Networks:** `internal` (no internet) holds db; `external` holds caddy + smtp-relay + app + worker. Postgres is unreachable from the public web by design.
