#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

cleanup() {
  echo "Stopping services..."
  docker compose down -v
}

echo "Starting services..."
docker compose up -d --wait

trap cleanup EXIT

echo "Running tests..."
VITEST_INCLUDE_INTEGRATION=true vitest run "$@"
