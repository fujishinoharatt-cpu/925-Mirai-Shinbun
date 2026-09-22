@echo off
chcp 65001 > nul
cd /d "%~dp0"

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
