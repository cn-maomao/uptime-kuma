#Requires -Version 5.1
<#
.SYNOPSIS
    One-click dev mode: vite (port 3000) + backend (port 3001) with hot reload.
#>

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

function Write-Step {
    param([string]$Text)
    Write-Host ""
    Write-Host "==> $Text" -ForegroundColor Cyan
}

try {
    $nodeVersion = & node -v
    $npmVersion = & npm -v
} catch {
    Write-Host "Node.js / npm not found in PATH. Install Node.js >= 20.4 first." -ForegroundColor Red
    exit 1
}
Write-Step "Using node $nodeVersion / npm $npmVersion"

if (-not (Test-Path -LiteralPath (Join-Path $repoRoot 'node_modules'))) {
    Write-Step "Installing dependencies (npm install)..."
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

Write-Step "Starting dev servers (vite on :3000, backend on :3001) ..."
Write-Host "    Open http://localhost:3000 for the dev UI." -ForegroundColor DarkGray
npm run dev
