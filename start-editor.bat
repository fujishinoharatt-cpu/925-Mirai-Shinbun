@echo off
setlocal
chcp 65001 > nul
cd /d "%~dp0"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
  taskkill /f /pid %%a >nul 2>&1
)

echo.
echo ========================================================
echo   未来新聞 - 紙面管理ツール
echo ========================================================
echo ルートフォルダ: %cd%
echo URL:              http://127.0.0.1:3000/
echo 停止:             Ctrl+C (このコマンドプロンプトで)
echo --------------------------------------------------------
echo.

npm install express > nul 2>&1

start http://127.0.0.1:3000/
npm run editor
if errorlevel 1 (
  echo [ERROR] エディタの起動に失敗しました。
  pause
)
