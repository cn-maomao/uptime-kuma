#!/usr/bin/env bash
# One-click dev mode for the HLL fork of Uptime Kuma.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${script_dir}/.."

step() { printf '\n==> %s\n' "$*"; }

if ! command -v node >/dev/null 2>&1; then
    echo "[Error] Node.js not found in PATH. Install Node.js >= 20.4 first." >&2
    exit 1
fi
step "Using node $(node -v) / npm $(npm -v)"

if [ ! -d node_modules ]; then
    step "Installing dependencies (npm install)..."
    npm install
fi

step "Starting dev servers (vite on :3000, backend on :3001) ..."
echo "    Open http://localhost:3000 for the dev UI."
exec npm run dev
