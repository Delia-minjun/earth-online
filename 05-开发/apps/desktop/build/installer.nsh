; NSIS 自定义片段：强制安装目录用显示名，而不是包名（@life/desktop → @lifedesktop）
; electron-builder 会在初始化阶段插入 preInit 宏
!macro preInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\地球 Online"
!macroend
