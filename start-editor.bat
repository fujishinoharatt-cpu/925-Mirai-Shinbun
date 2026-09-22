@echo off
setlocal
chcp 65001 > nul
cd /d "%~dp0"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
  taskkill /f /pid %%a >nul 2>&1
)

echo.
echo 📰 未来新聞 - 紙面管理ツール
echo.
echo npm パッケージをインストール中...
call npm install express > nul 2>&1

echo エディタを起動しています...
echo ブラウザで http://localhost:3000 を開いてください
echo.
timeout /t 2

start http://localhost:3000
npm run editor
if errorlevel 1 (
  echo [ERROR] エディタの起動に失敗しました。
  pause
)
