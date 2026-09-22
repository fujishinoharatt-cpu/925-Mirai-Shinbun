@echo off
setlocal
cd /d "%~dp0"

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
  taskkill /f /pid %%a >nul 2>&1
)

npm install express > nul 2>&1
start http://127.0.0.1:3000/
npm run editor
if errorlevel 1 (
  pause
)
