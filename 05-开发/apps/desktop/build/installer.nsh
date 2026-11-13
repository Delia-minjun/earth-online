; NSIS 自定义片段
; 1) 安装目录用显示名（默认会拿包名拼出 @lifedesktop）
!macro preInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\地球 Online"
!macroend

; 2) 装完把安装包自身删掉（用户下到桌面的那个 exe 不会一直留着）
;    用 ping 延迟 3 秒，等安装器进程退出后再删，否则文件被占用删不掉。
;    $EXEPATH 是当前安装器路径；自动更新时同样适用（清掉 pending 里的安装包）。
!macro customInstall
  Exec 'cmd.exe /c ping -n 4 127.0.0.1 >nul & del /f /q "$EXEPATH"'
!macroend
