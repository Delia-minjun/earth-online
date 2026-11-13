@echo off
setlocal
chcp 936 >nul
title 地球 Online 打包（免安装）
set "DEV=%~dp0"
cd /d "%DEV%"

set "NODE=node"
where node >nul 2>nul
if not errorlevel 1 goto node_ok
if exist "%ProgramFiles%\nodejs\node.exe" (set "NODE=%ProgramFiles%\nodejs\node.exe" & goto node_ok)
if exist "C:\Users\delia\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" (set "NODE=C:\Users\delia\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" & goto node_ok)
echo 没找到 Node，先装 Node 22+： https://nodejs.org
pause
exit /b 1

:node_ok
echo [1/4] 安装打包工具（electron / electron-builder，第一次约 2-3 分钟）
if not exist "%DEV%desktop-tools\node_modules\electron\install.js" (
  pushd "%DEV%desktop-tools"
  call npm install --no-audit --no-fund || (popd & echo 工具安装失败，检查网络后重试 & pause & exit /b 1)
  node node_modules\electron\install.js || (echo electron 二进制下载失败 & popd & pause & exit /b 1)
  popd
) else (
  echo    已装好，跳过
)

echo [2/4] 构建前端
pushd "%DEV%apps\web"
"%NODE%" "%DEV%node_modules\vite\bin\vite.js" build || (popd & echo 前端构建失败 & pause & exit /b 1)
popd

echo [3/4] 打包服务端与资源
pushd "%DEV%apps\desktop"
"%NODE%" scripts\build.mjs || (popd & echo 资源打包失败 & pause & exit /b 1)

echo [4/4] 生成免安装压缩包
echo    NSIS 安装包改由 GitHub Actions 构建；本机只打 zip，解开就能用
"%NODE%" "%DEV%desktop-tools\node_modules\electron-builder\out\cli\cli.js" --win zip --config electron-builder.yml --config.npmRebuild=false --config.win.signAndEditExecutable=false
set "CODE=%ERRORLEVEL%"
popd

echo.
if not "%CODE%"=="0" (
  echo 安装包构建失败，请把上面的报错发给维护者。
  pause
  exit /b %CODE%
)
echo ============================================
echo    好了，压缩包在：
echo    %DEV%apps\desktop\release\
echo ============================================
dir /b "%DEV%apps\desktop\release\*.zip" 2>nul
echo.
pause