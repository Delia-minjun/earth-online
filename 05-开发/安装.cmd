@echo off
setlocal
chcp 936 >nul
title 地球 Online 安装
set "DEV=%~dp0"
cd /d "%DEV%"

echo ============================================
echo    地球 Online 一键安装
echo    会做四件事：装依赖 / 构建 / 建快捷方式 / 设开机自启
echo ============================================
echo.

rem ---------- 0) 找到 Node ----------
set "NODE=node"
where node >nul 2>nul
if not errorlevel 1 goto node_ok
if exist "%ProgramFiles%\nodejs\node.exe" (set "NODE=%ProgramFiles%\nodejs\node.exe" & goto node_ok)
if exist "C:\Users\delia\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" (set "NODE=C:\Users\delia\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" & goto node_ok)

echo [1/5] 没检测到 Node.js
echo.
echo    请先安装 Node 22 或更高版本： https://nodejs.org/zh-cn
echo    装的时候一路点 Next 就行，装完重新双击本文件。
echo.
pause
exit /b 1

:node_ok
for /f "tokens=*" %%v in ('"%NODE%" -v') do set "NODEV=%%v"
echo [1/5] Node 版本 %NODEV%  OK
echo.

rem ---------- 1) 找到 pnpm（没有就用 npx，再没有就跳过安装）----------
set "PNPM=pnpm"
where pnpm >nul 2>nul
if not errorlevel 1 goto pnpm_ok

call corepack enable >nul 2>&1
where pnpm >nul 2>nul
if not errorlevel 1 goto pnpm_ok

where npx >nul 2>nul
if not errorlevel 1 (set "PNPM=npx --yes pnpm@11" & goto pnpm_ok)

set "PNPM="

:pnpm_ok

rem ---------- 2) 依赖 ----------
if not defined PNPM (
  if exist "%DEV%node_modules\vite\bin\vite.js" (
    echo [2/5] 这个 Node 里没有 pnpm/npm，但依赖已经装好，跳过安装
  ) else (
    echo.
    echo   这个 Node 里既没有 pnpm 也没有 npm，没法安装依赖。
    echo   请去 https://nodejs.org/zh-cn 重新安装 Node（官方安装包自带 npm），
    echo   装完重新双击本文件即可。
    echo.
    pause
    exit /b 1
  )
) else (
  echo [2/5] 安装依赖（第一次 1-3 分钟，会滚很多行，正常）
  call %PNPM% install
  if errorlevel 1 (
    echo.
    echo   依赖安装失败。网络不稳可以重试，或先执行： %PNPM% install --force
    pause
    exit /b 1
  )
)
echo.

rem ---------- 3) 构建 ----------
echo [3/5] 构建前端
pushd "%DEV%apps\web"
"%NODE%" "%DEV%node_modules\vite\bin\vite.js" build
set "BUILDCODE=%ERRORLEVEL%"
popd
if not "%BUILDCODE%"=="0" (
  echo.
  echo   构建失败，请把上面的报错发给维护者。
  pause
  exit /b 1
)
echo.
rem ---------- 4) 快捷方式 ----------
echo [4/5] 创建快捷方式（桌面 + 开机启动）
powershell -NoProfile -ExecutionPolicy Bypass -File "%DEV%shortcut.ps1"
if errorlevel 1 (
  echo    快捷方式创建失败，不影响使用；可手动双击 start.cmd 启动。
) else (
  echo    桌面和开机启动的快捷方式都建好了
)
echo.

rem ---------- 5) 每天自动更新 ----------
echo [5/5] 注册每天自动更新（凌晨 4 点，仅在登录时触发）
schtasks /Create /TN "EarthOnlineAutoUpdate" /TR "\"%DEV%自动更新.cmd\"" /SC DAILY /ST 04:00 /F >nul 2>&1
if errorlevel 1 (
  echo    注册失败（可能没有权限），不影响使用；可稍后手动双击 自动更新.cmd
) else (
  echo    已注册计划任务 EarthOnlineAutoUpdate
)
echo.

echo ============================================
echo    装好了
echo    现在会自动启动服务并打开浏览器。
echo    以后：双击桌面「地球 Online」即可。
echo ============================================
echo.
call "%DEV%start.cmd"