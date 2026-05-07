#!/usr/bin/env bash
# Set GitHub Actions repository variables used by .github/workflows/main.yml
# to render smtpd.conf at deploy time.
#
# These are stored as repository VARIABLES, not secrets, on purpose:
#   - SMTP_TRUSTED_NETS:   the docker subnet allowed to relay through OpenSMTPD
#   - SMTP_RELAY_HELO_DOMAIN: FQDN OpenSMTPD presents on HELO
#
# Both end up in plaintext inside the rendered smtpd.conf, which itself is
# published to the public `deployment` branch. Marking them as secrets would
# only create a false sense of confidentiality. They are also non-sensitive on
# their own — the HELO domain is discoverable from any sent email's headers,
# and the trusted-net subnet is a private RFC1918 range.
#
# Usage:
#   ./scripts/setup-repo-vars.sh
#   ./scripts/setup-repo-vars.sh --repo owner/repo
#   SMTP_TRUSTED_NETS=172.20.0.0/16 SMTP_RELAY_HELO_DOMAIN=create.shanghai.nyu.edu \
#     ./scripts/setup-repo-vars.sh --repo owner/repo
#
# Requires: gh (https://cli.github.com), authenticated with `gh auth login`.

set -euo pipefail

REPO_FLAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO_FLAG="--repo $2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install from https://cli.github.com." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

# Prompt for values not provided via env.
if [[ -z "${SMTP_TRUSTED_NETS:-}" ]]; then
  read -rp "SMTP_TRUSTED_NETS (e.g. 172.20.0.0/16): " SMTP_TRUSTED_NETS
fi
if [[ -z "${SMTP_RELAY_HELO_DOMAIN:-}" ]]; then
  read -rp "SMTP_RELAY_HELO_DOMAIN (e.g. create.shanghai.nyu.edu): " SMTP_RELAY_HELO_DOMAIN
fi

if [[ -z "$SMTP_TRUSTED_NETS" || -z "$SMTP_RELAY_HELO_DOMAIN" ]]; then
  echo "Both SMTP_TRUSTED_NETS and SMTP_RELAY_HELO_DOMAIN are required." >&2
  exit 1
fi

echo "Setting repository variables…"
# shellcheck disable=SC2086
gh variable set SMTP_TRUSTED_NETS       --body "$SMTP_TRUSTED_NETS"       $REPO_FLAG
# shellcheck disable=SC2086
gh variable set SMTP_RELAY_HELO_DOMAIN  --body "$SMTP_RELAY_HELO_DOMAIN"  $REPO_FLAG

echo
echo "Done. Verify with:"
# shellcheck disable=SC2086
echo "  gh variable list $REPO_FLAG"
