; NSIS 自定义片段
!include "FileFunc.nsh"

; 1) 安装目录用显示名（默认会拿包名拼出 @lifedesktop）
!macro preInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\地球 Online"
!macroend

; 2) 只清理「自动更新」留下的安装包。
;    electron-updater 会以 --updated 参数启动安装器；用户自己从浏览器下载的
;    exe 不带这个参数，因此永远不会被删。
;    延迟几秒再删，否则文件还被安装器占用。
!macro customInstall
  ${GetOptions} $CMDLINE "--updated" $R1
  ${If} $R1 == "--updated"
    Exec 'cmd.exe /c ping -n 4 127.0.0.1 >nul & del /f /q "$EXEPATH"'
  ${EndIf}
!macroend
