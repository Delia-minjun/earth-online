@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo [earth-online] 拉取最新代码...
git pull --ff-only
if errorlevel 1 (echo [earth-online] 拉取失败：本地有冲突或未提交的改动。& pause & exit /b 1)

echo [earth-online] 安装依赖（有变化时）...
call pnpm install
if errorlevel 1 (echo [earth-online] 依赖安装失败。& pause & exit /b 1)

echo [earth-online] 构建前端...
call pnpm build
if errorlevel 1 (echo [earth-online] 构建失败。& pause & exit /b 1)

echo.
echo [earth-online] 更新完成。请重新双击 start.cmd 重启服务（数据不会丢）。
pause