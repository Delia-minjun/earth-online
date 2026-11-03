@echo off
setlocal
chcp 65001 >nul
set "ROOT=%~dp0"

set "NODE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE=C:\Users\delia\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

pushd "%ROOT%apps\server"
"%NODE%" --test test\weeks.test.ts test\api.test.ts test\p2.test.ts
set "CODE=%ERRORLEVEL%"
popd

echo.
if "%CODE%"=="0" (echo [earth-online] all tests passed) else (echo [earth-online] tests failed, code %CODE%)
pause
