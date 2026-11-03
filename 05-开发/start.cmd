@echo off
setlocal
chcp 65001 >nul
set "ROOT=%~dp0"

rem Prefer a system Node if available, otherwise fall back to the runtime bundled with DSH.
set "NODE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE=C:\Users\delia\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%ROOT%apps\web\dist\index.html" (
  echo [earth-online] building web...
  pushd "%ROOT%apps\web"
  "%NODE%" "%ROOT%node_modules\vite\bin\vite.js" build
  popd
)

echo [earth-online] starting server on http://127.0.0.1:7788
start "" http://127.0.0.1:7788
"%NODE%" "%ROOT%apps\server\src\index.ts"
