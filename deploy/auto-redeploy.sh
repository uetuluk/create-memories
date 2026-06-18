#!/usr/bin/env bash
# Pull the latest deployment branch and reconcile the running stack.
#
# Idempotent: exits early when there are no new commits and no image
# change. On any failure, emails ADMIN_ALERT_TO via the in-stack
# smtp-relay container (which the app uses for magic-link emails) and
# leaves the previous compose stack running. The email body includes
# the last ~80 lines of context so you can triage from your inbox.
#
# Designed to be run by deploy/systemd/create-memories-redeploy.timer
# every 5 minutes. Safe to also run manually:  bash deploy/auto-redeploy.sh
#
# Required env (set via systemd unit's Environment= or the user's shell):
#   DEPLOY_DIR         — absolute path to the cloned deployment repo
#                        (e.g. /home/uet200/create-memories)
#   ADMIN_ALERT_TO     — email address to alert on failure
#   ADMIN_ALERT_FROM   — From: address (defaults to no-reply@<host>)
#   COMPOSE_BIN        — defaults to "docker compose"
#   SMTP_HOST          — relay hostname (default smtp-relay if running on
#                        the docker host alongside the stack and using
#                        --network host; else the published port)

set -uo pipefail

DEPLOY_DIR="${DEPLOY_DIR:?DEPLOY_DIR is required}"
ADMIN_ALERT_TO="${ADMIN_ALERT_TO:-}"
ADMIN_ALERT_FROM="${ADMIN_ALERT_FROM:-no-reply@$(hostname -f)}"
COMPOSE_BIN="${COMPOSE_BIN:-docker compose}"
LOG_TAG="create-memories-redeploy"
LOG_FILE="$(mktemp -t cm-redeploy.XXXXXX.log)"
trap 'rm -f "$LOG_FILE"' EXIT

log() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG_FILE"
}

send_alert() {
  local subject="$1"
  local body_file="$2"
  if [[ -z "$ADMIN_ALERT_TO" ]]; then
    log "no ADMIN_ALERT_TO set; skipping email"
    return 0
  fi

  local relay_container
  relay_container="$(docker ps --filter 'name=smtp-relay$' --format '{{.Names}}' | head -1)"
  if [[ -z "$relay_container" ]]; then
    relay_container="create-memories-smtp-relay"
  fi

  # Pipe a minimal RFC 822 message into the smtp-relay container's
  # 'sendmail' (OpenSMTPD ships one). This is the same submission path
  # Auth.js uses for magic links and reuses an already-trusted source.
  {
    printf 'From: %s\r\n' "$ADMIN_ALERT_FROM"
    printf 'To: %s\r\n' "$ADMIN_ALERT_TO"
    printf 'Subject: %s\r\n' "$subject"
    printf 'Content-Type: text/plain; charset=utf-8\r\n'
    printf '\r\n'
    cat "$body_file"
  } | docker exec -i "$relay_container" sendmail -t 2>/dev/null \
      || log "sendmail via $relay_container failed (relay container missing or unhealthy)"
}

fail() {
  local subject="$1"
  log "FAIL: $1"
  send_alert "$subject" "$LOG_FILE"
  exit 1
}

cd "$DEPLOY_DIR" || fail "[create-memories] redeploy: DEPLOY_DIR not found"

current=$(git rev-parse HEAD)
log "current HEAD: $current"

git fetch --quiet origin 2>>"$LOG_FILE" \
  || fail "[create-memories] redeploy: git fetch failed"

remote=$(git rev-parse @{u})
log "remote HEAD: $remote"

if [[ "$current" == "$remote" ]]; then
  log "no new commits; checking for image updates only"
fi

git pull --ff-only --quiet 2>>"$LOG_FILE" \
  || fail "[create-memories] redeploy: git pull failed (non-FF or conflict?)"

# Detect a stale container by comparing the image each running container
# uses against the image the service's tag currently resolves to locally
# (after pull). Compose's "Pulled" / "up to date" log lines proved
# unreliable: the regex used previously missed real updates AND would
# have fired 'up -d' on every tick if it had matched.
log "docker compose pull"
$COMPOSE_BIN pull 2>&1 | tee -a "$LOG_FILE" >/dev/null \
  || fail "[create-memories] redeploy: docker compose pull failed"

needs_up=0
if [[ "$current" != "$remote" ]]; then
  needs_up=1   # config/compose changed
else
  # `compose config --images` lists the image refs each service uses.
  # For each one, compare the local resolved digest against the digest
  # the running container is using.
  while read -r image_ref; do
    [[ -z "$image_ref" ]] && continue
    target_img=$(docker image inspect --format '{{.Id}}' "$image_ref" 2>/dev/null || echo "")
    [[ -z "$target_img" ]] && continue   # nothing to compare against
    # Find any running container using this image_ref where the actual
    # image ID differs from target_img.
    stale=$(docker ps --filter "ancestor=$image_ref" --format '{{.ID}}' \
      | while read -r cid; do
          running_img=$(docker inspect --format '{{.Image}}' "$cid" 2>/dev/null || echo "")
          if [[ -n "$running_img" && "$running_img" != "$target_img" ]]; then
            echo "$cid"
            break
          fi
        done)
    if [[ -n "$stale" ]]; then
      log "stale container $stale on $image_ref"
      needs_up=1
      break
    fi
  done < <($COMPOSE_BIN config --images 2>/dev/null | sort -u)
fi

if [[ "$needs_up" -eq 0 ]]; then
  log "nothing to do; HEAD unchanged and no new images"
  exit 0
fi

log "running 'docker compose up -d'"
if ! $COMPOSE_BIN up -d 2>>"$LOG_FILE"; then
  # Containers from the previous run keep running because compose only
  # replaces what it can successfully recreate. Surface the failure.
  fail "[create-memories] redeploy: 'docker compose up -d' failed"
fi

log "redeploy ok: $current -> $remote"
