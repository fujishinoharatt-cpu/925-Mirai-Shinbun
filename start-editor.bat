@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
cd /d "%~dp0"

REM ポート 3000 を使用しているプロセスを停止
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
  taskkill /f /pid %%a >nul 2>&1
)

REM npm install
npm install express > nul 2>&1

REM サーバー起動後にメッセージを表示するため、少し遅延させる
start /b "" cmd /c "timeout /t 2 && start http://127.0.0.1:3000/"

echo.
echo ========================================================
echo   未来新聞 - 紙面管理ツール
echo ========================================================
echo ルートフォルダ: %cd%
echo URL:              http://127.0.0.1:3000/
echo 停止:             Ctrl+C (このコマンドプロンプトで)
echo ========================================================
echo.

npm run editor
if errorlevel 1 (
  echo [ERROR] エディタの起動に失敗しました。
  pause
)
