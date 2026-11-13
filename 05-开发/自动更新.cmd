@echo off
setlocal
chcp 65001 >nul
set "DEV=%~dp0"
set "ROOT=%~dp0.."
set "LOG=%DEV%logs\auto-update.log"
if not exist "%DEV%logs" mkdir "%DEV%logs"

echo ==== %DATE% %TIME% ==== >> "%LOG%"

set "NODE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE=C:\Users\delia\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

cd /d "%ROOT%"
git fetch origin main --quiet
for /f "delims=" %%i in ('git rev-parse HEAD') do set "LOCAL=%%i"
for /f "delims=" %%i in ('git rev-parse origin/main') do set "REMOTE=%%i"

if "%LOCAL%"=="%REMOTE%" (
  echo 已是最新 %LOCAL:~0,7% >> "%LOG%"
  exit /b 0
)

echo 发现新版本 %LOCAL:~0,7% -^> %REMOTE:~0,7% >> "%LOG%"
git pull --ff-only origin main >> "%LOG%" 2>&1
if errorlevel 1 (
  echo 拉取失败（本地有改动或冲突），本次跳过 >> "%LOG%"
  exit /b 1
)

cd /d "%DEV%"
call pnpm install >> "%LOG%" 2>&1
call pnpm build >> "%LOG%" 2>&1
if errorlevel 1 (
  echo 构建失败，旧版本继续运行 >> "%LOG%"
  exit /b 1
)

echo 重启服务 >> "%LOG%"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":7788" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>&1
timeout /t 2 /nobreak >nul
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -WindowStyle Hidden -FilePath '%NODE%' -ArgumentList 'apps\server\src\index.ts' -WorkingDirectory '%DEV%'"
timeout /t 3 /nobreak >nul
echo 更新完成 >> "%LOG%"
exit /b 0