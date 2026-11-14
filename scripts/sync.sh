#!/usr/bin/env bash
# Pull latest, then show everyone's latest status
set -e
cd "$(git rev-parse --show-toplevel)"
git pull --rebase --autostash -q || { echo "PULL FAILED - tell a human"; exit 1; }
for f in status/*.md; do
  echo "================ $(basename "$f" .md | tr a-z A-Z) ================"
  # last entry only
  awk '/^## /{buf=""} {buf=buf $0 "\n"} END{printf "%s", buf}' "$f"
done
echo "================ CONTRACT last changed ================"
git log -1 --format='%ar by %an: %s' -- contract/ || true
