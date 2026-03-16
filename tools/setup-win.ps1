$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "[Setup] Unblocking files (if needed)..." -ForegroundColor Cyan
try {
  Get-ChildItem -Recurse -File -Force . | Unblock-File -ErrorAction SilentlyContinue
} catch {}

Write-Host "[Setup] Removing node_modules and package-lock.json..." -ForegroundColor Cyan
if (Test-Path "node_modules") { Remove-Item -Recurse -Force "node_modules" }
if (Test-Path "package-lock.json") { Remove-Item -Force "package-lock.json" }

Write-Host "[Setup] Installing dependencies (including devDependencies)..." -ForegroundColor Cyan
npm install

Write-Host "[Setup] Done." -ForegroundColor Green
