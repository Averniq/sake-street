@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the current Node.js LTS release first.
  pause
  exit /b 1
)
node printer-bridge.mjs
if errorlevel 1 pause
