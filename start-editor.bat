@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo Starting Mirai-Shinbun Editor...
echo.

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
  echo Killing existing process %%a...
  taskkill /f /pid %%a >nul 2>&1
)

echo Installing dependencies...
call npm install express >nul 2>&1

echo Starting browser...
start http://127.0.0.1:3000/

echo.
echo ========================================================
echo   Mirai-Shinbun - Editor
echo ========================================================
echo Folder: %cd%
echo URL:    http://127.0.0.1:3000/
echo Stop:   Ctrl+C (in this prompt)
echo ========================================================
echo.

echo Starting server...
node "%~dp0scripts/start-editor.mjs"

if !errorlevel! neq 0 (
  echo [ERROR] Server failed to start
  pause
)
