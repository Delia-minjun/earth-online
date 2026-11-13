@echo off
setlocal
chcp 936 >nul
set "ROOT=%~dp0"
set "URL=http://127.0.0.1:7788"
set "SILENT=0"
if /i "%~1"=="--silent" set "SILENT=1"

rem 1) 找 Node：优先系统安装的，其次用随 DSH 打包的
set "NODE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE=C:\Users\delia\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if /i not "%NODE%"=="node" if not exist "%NODE%" (
  echo.
  echo   [地球Online] 没找到 Node，无法启动。
  echo               请安装 Node 22 或更高版本： https://nodejs.org
  echo.
  if "%SILENT%"=="0" pause
  exit /b 1
)

rem 2) 端口被占用 = 已经在跑，直接开页面
netstat -ano | findstr /C:":7788" | findstr /C:"LISTENING" >nul 2>nul
if not errorlevel 1 (
  if "%SILENT%"=="0" (
    echo.
    echo   [地球Online] 服务已经在运行，直接打开页面。
    echo.
    start "" "%URL%"
    ping -n 3 127.0.0.1 >nul
  )
  exit /b 0
)

rem 3) 第一次运行，先构建前端
if not exist "%ROOT%apps\web\dist\index.html" (
  echo   [地球Online] 首次运行，正在构建前端，大约 5 秒...
  pushd "%ROOT%apps\web"
  "%NODE%" "%ROOT%node_modules\vite\bin\vite.js" build
  popd
  echo.
)

rem 4) 启动服务；非静默时 2 秒后自动打开浏览器
echo ============================================
echo    地球 Online 正在启动
echo    地址：%URL%
echo    停止：关掉这个黑窗口
echo ============================================
echo.
if "%SILENT%"=="0" start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"
"%NODE%" "%ROOT%apps\server\src\index.ts"

echo.
echo ============================================
echo    服务已停止。
echo    如果不是你关的，上面几行就是报错原因。
echo ============================================
if "%SILENT%"=="0" pause