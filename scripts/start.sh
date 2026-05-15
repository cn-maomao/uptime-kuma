#!/usr/bin/env bash
# One-click production startup for the HLL fork of Uptime Kuma.
# Equivalent to scripts/start.ps1 for Linux / macOS.

set -euo pipefail

# Resolve repo root (parent of this script's directory)
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
else
    step "node_modules already exists, skipping install"
fi

step "Building frontend (npm run build)..."
npm run build

step "Starting Uptime Kuma server on http://localhost:3001 ..."
exec node server/server.js
