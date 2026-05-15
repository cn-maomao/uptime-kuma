#Requires -Version 5.1
<#
.SYNOPSIS
    One-click production startup for the HLL fork of Uptime Kuma.

.DESCRIPTION
    1. Switches to the repository root.
    2. Installs npm dependencies if node_modules/ is missing.
    3. Builds the frontend with vite (npm run build).
    4. Starts the server (node server/server.js).

    Stops on the first error. Re-running is safe (idempotent).
#>

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

function Write-Step {
    param([string]$Text)
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

# 1. Sanity check: node + npm available
try {
    $nodeVersion = & node -v
    $npmVersion = & npm -v
} catch {
    Write-Host "Node.js / npm not found in PATH. Install Node.js >= 20.4 first." -ForegroundColor Red
    exit 1
}
Write-Step "Using node $nodeVersion / npm $npmVersion"

# 2. Install dependencies on first run
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules'))) {
    Write-Step "Installing dependencies (npm install)..."
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
} else {
    Write-Step "node_modules already exists, skipping install"
}

# 3. Build the frontend so the new HLL RCON form is included in dist/
Write-Step "Building frontend (npm run build)..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

# 4. Start the server (foreground)
Write-Step "Starting Uptime Kuma server on http://localhost:3001 ..."
node server/server.js
