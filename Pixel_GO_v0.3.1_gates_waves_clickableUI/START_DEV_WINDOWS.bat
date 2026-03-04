@echo off
setlocal

REM Pixel PVE — one-click dev launcher for Windows
REM - tries to unblock downloaded files
REM - reinstalls deps
REM - runs `npm run dev`

echo.
echo === Pixel PVE: Windows Dev Launcher ===
echo.

REM Basic node check
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Install Node.js LTS 20 and run this again.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo Node: %NODEVER%

REM Recommend Node LTS 20 (avoid Node 23/24 for Vite toolchain stability)
set VERSTR=%NODEVER:~1%
for /f "tokens=1 delims=." %%m in ("%VERSTR%") do set MAJOR=%%m
if %MAJOR% GEQ 23 (
  echo.
  echo [WARNING] You are using Node %NODEVER%. Recommend Node LTS 20.x for stable Vite/Rollup.
  echo Install Node 20 and retry if you get errors.
  echo.
)

REM Run PowerShell helper (handles unblock + reinstall)
powershell -NoProfile -ExecutionPolicy Bypass -File "tools\setup-win.ps1"
if %ERRORLEVEL% neq 0 (
  echo.
  echo [ERROR] Setup failed. See output above.
  pause
  exit /b 1
)

echo.
echo Starting dev server...
npm run dev

pause
