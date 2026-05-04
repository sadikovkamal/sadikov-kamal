#!/usr/bin/env bash
# Run every smoke script in order and report pass/fail.
#
# Why we grep stdout instead of trusting exit code: on Windows + Node 24
# + tsx, libuv occasionally panics during socket cleanup AFTER the
# script's process.exit(0) — so the shell sees exit 127 even though the
# smoke itself completed cleanly. We treat "Smoke: PASSED" in stdout as
# the success signal.
#
# Two flag groups: scripts that import `server-only`-marked lib modules
# need `--conditions=react-server` so Node resolves the no-op stub
# instead of the throw-on-import default. Scripts that use
# `react-dom/server` MUST run without that flag — those two conditions
# are mutually exclusive.
set -uo pipefail

cd "$(dirname "$0")/.."

PLAIN=(
  "auth-smoke.ts"
  "auth-http-smoke.ts"
  "markdown-smoke.ts"
  "preview-smoke.ts"
  "r2-smoke.ts"
  "upload-page-smoke.ts"
  "import-page-smoke.ts"
  "taxonomy-pages-smoke.ts"
  "cron-smoke.ts"
)

SERVER_ONLY=(
  "problems-smoke.ts"
  "problems-page-smoke.ts"
  "list-smoke.ts"
  "list-page-smoke.ts"
  "import-smoke.ts"
  "import-failure-smoke.ts"
  "taxonomy-smoke.ts"
  "rate-limit-smoke.ts"
)

PASS=0
FAIL=0
FAILED_SCRIPTS=()

run() {
  local script=$1
  local opts=$2
  echo ""
  echo "=========================================="
  echo "Running scripts/$script"
  echo "=========================================="
  local out
  out=$(NODE_OPTIONS="$opts" npx tsx "scripts/$script" 2>&1)
  echo "$out"
  # Success signal: PASSED appears AND FAILED does not.
  if echo "$out" | grep -q "PASSED" && ! echo "$out" | grep -q "FAILED"; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    FAILED_SCRIPTS+=("$script")
  fi
}

for s in "${PLAIN[@]}"; do
  run "$s" ""
done
for s in "${SERVER_ONLY[@]}"; do
  run "$s" "--conditions=react-server"
done

echo ""
echo "=========================================="
echo "Smoke suite: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed: ${FAILED_SCRIPTS[*]}"
fi
echo "=========================================="
exit "$FAIL"
