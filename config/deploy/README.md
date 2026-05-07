# Auto-redeploy

A 5-minute systemd timer on the deploy host that fast-forwards the
`deployment` branch and reconciles the docker compose stack. Failures
email `uet200@nyu.edu` via the in-stack `smtp-relay` container (same
relay Auth.js uses for magic-link emails).

## Files

- `auto-redeploy.sh` — the script. Idempotent. Pulls, decides whether
  anything actually changed, runs `docker compose up -d` only if so.
- `systemd/create-memories-redeploy.service` — oneshot unit that runs
  the script. `DEPLOY_DIR` and `ADMIN_ALERT_TO` are baked in.
- `systemd/create-memories-redeploy.timer` — fires at boot + every 5 min.

## Install on `create`

```bash
ssh create

# 1. Drop the unit files into the user's systemd dir
mkdir -p ~/.config/systemd/user
cp ~/create-memories/deploy/systemd/create-memories-redeploy.service ~/.config/systemd/user/
cp ~/create-memories/deploy/systemd/create-memories-redeploy.timer   ~/.config/systemd/user/

# 2. Enable + start the timer
systemctl --user daemon-reload
systemctl --user enable --now create-memories-redeploy.timer

# 3. Make the user's services survive logout
sudo loginctl enable-linger "$(whoami)"

# 4. Sanity check
systemctl --user list-timers create-memories-redeploy.timer
journalctl --user -u create-memories-redeploy.service -n 50 --no-pager

# Manual trigger (handy for testing the email path):
systemctl --user start create-memories-redeploy.service
journalctl --user -u create-memories-redeploy.service -f
```

## How alerts work

`auto-redeploy.sh` collects the run's log lines into a temp file. On
any failure step (git fetch, git pull, docker compose up, etc.) it:

1. Locates the running smtp-relay container (`docker ps --filter
   name=smtp-relay`).
2. Pipes an RFC 822 message to `sendmail -t` *inside* that container
   so the `From:` we set is what OpenSMTPD relays out.
3. Continues to exit with the failure code so journalctl shows the
   failure.

Subjects are prefixed `[create-memories] redeploy:` so you can filter.

If the smtp-relay container is missing/unhealthy the email fails
gracefully and the failure is still in `journalctl`.

## Disable temporarily

```bash
systemctl --user stop create-memories-redeploy.timer
systemctl --user disable create-memories-redeploy.timer
```

## Uninstall

```bash
systemctl --user disable --now create-memories-redeploy.timer
rm ~/.config/systemd/user/create-memories-redeploy.{service,timer}
systemctl --user daemon-reload
```
