@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo [earth-online] 正在把改动同步到 GitHub...
git add -A
git diff --cached --quiet && (echo [earth-online] 没有新改动，退出。& pause & exit /b 0)

set "MSG=chore: 同步 %DATE% %TIME%"
git commit -m "%MSG%"
if errorlevel 1 (echo [earth-online] 提交失败，请检查上面的报错。& pause & exit /b 1)

git push origin main
if errorlevel 1 (echo [earth-online] 推送失败：检查网络或 SSH key。& pause & exit /b 1)

echo.
echo [earth-online] 已推送到 https://github.com/Delia-minjun/earth-online
pause