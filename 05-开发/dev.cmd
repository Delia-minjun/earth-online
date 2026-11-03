@echo off
setlocal
chcp 65001 >nul
set "ROOT=%~dp0"

rem Prefer a system Node if available, otherwise fall back to the runtime bundled with DSH.
set "NODE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE=C:\Users\delia\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

echo [life-os] starting API on http://127.0.0.1:7788
start "life-os api" "%NODE%" "%ROOT%apps\server\src\index.ts"

timeout /t 2 >nul

echo [life-os] starting Vite dev server on http://127.0.0.1:5173 (hot reload)
start "life-os web" /D "%ROOT%apps\web" "%NODE%" "%ROOT%node_modules\vite\bin\vite.js" --host 127.0.0.1

timeout /t 3 >nul
start "" http://127.0.0.1:5173
