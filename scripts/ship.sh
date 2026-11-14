#!/usr/bin/env bash
# Commit only your folder + status file, then push
# Usage: ROLE=data bash scripts/ship.sh "added gate data"
set -e
cd "$(git rev-parse --show-toplevel)"
ROLE="${ROLE:-$(cat .role 2>/dev/null)}"
MSG="${1:-update}"
case "$ROLE" in
  lead)     PATHS="backend contract" ;;
  data)     PATHS="data" ;;
  frontend) PATHS="frontend" ;;
  pitch)    PATHS="pitch" ;;
  *) echo "Set your role: echo data > .role"; exit 1 ;;
esac
git add $PATHS "status/$ROLE.md" 2>/dev/null || true
git commit -q -m "[$ROLE] $MSG" || echo "nothing to commit"
git pull --rebase --autostash -q || { echo "REBASE CONFLICT - tell a human"; exit 1; }
git push -q && echo "shipped: [$ROLE] $MSG"
