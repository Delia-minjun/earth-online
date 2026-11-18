@echo off
setlocal
chcp 936 >nul
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\地球 Online.lnk"
if exist "%LNK%" (
  del /f /q "%LNK%"
  echo.
  echo   已取消开机自启：下次开机不会自己启动地球 Online。
  echo   需要用时双击桌面「地球 Online」图标即可。
  echo.
) else (
  echo.
  echo   当前没有设开机自启，不需要取消。
  echo.
)
if "%~1"=="--silent" exit /b 0
pause
