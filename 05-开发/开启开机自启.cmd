@echo off
setlocal
chcp 936 >nul
set "DEV=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%DEV%shortcut.ps1" -NoStartup >nul 2>&1
powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) '地球 Online.lnk')); $s.TargetPath='cmd.exe'; $s.Arguments='/c \"%DEV%start.cmd\" --silent'; $s.WorkingDirectory='%DEV%'; $icon=Join-Path '%DEV%' 'earth-online.ico'; if (Test-Path $icon) { $s.IconLocation=($icon + ',0') }; $s.Description='地球 Online'; $s.Save()"
echo.
echo   已设为开机自启：下次开机自动启动（静默，不弹浏览器）。
echo   想取消就双击「关闭开机自启.cmd」。
echo.
if "%~1"=="--silent" exit /b 0
pause
