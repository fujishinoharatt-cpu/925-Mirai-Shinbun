@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\925-Mirai-Shinbun"

echo Starting Mirai-Shinbun Editor...
echo Folder: %cd%
echo.

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
  echo Killing existing process %%a...
  taskkill /f /pid %%a >nul 2>&1
)

echo Installing dependencies...
call npm install express >nul 2>&1

start "" cmd /c "timeout /t 3 >nul & start http://127.0.0.1:3000/"

echo URL:  http://127.0.0.1:3000/
echo Stop: Ctrl+C
echo.
node scripts\start-editor.mjs

echo.
echo [Server stopped]
pause
