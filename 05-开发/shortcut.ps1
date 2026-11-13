# 创建「地球 Online」快捷方式：桌面一个、开机启动一个（静默模式）
# 由 安装.cmd 调用；也可以手动：powershell -File shortcut.ps1
param(
  [string]$Dev = "",
  # 测试用：把两个快捷方式都放到指定目录，不动真实的桌面/启动文件夹
  [string]$Dir = ""
)

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 不允许在 param 默认值里用 $MyInvocation，放到下面取
if (-not $Dev) { $Dev = Split-Path -Parent $MyInvocation.MyCommand.Path }

$target = Join-Path $Dev "start.cmd"
if (-not (Test-Path $target)) {
  Write-Output "找不到 start.cmd：$target"
  exit 1
}

$icon = Join-Path $Dev "earth-online.ico"
$ws = New-Object -ComObject WScript.Shell

function New-Shortcut([string]$path, [string]$arg) {
  $s = $ws.CreateShortcut($path)
  $s.TargetPath = "cmd.exe"
  $s.Arguments = "/c `"$target`" $arg".Trim()
  $s.WorkingDirectory = $Dev
  if (Test-Path $icon) { $s.IconLocation = "$icon,0" }
  $s.Description = "地球 Online"
  $s.Save()
  Write-Output $path
}

if ($Dir) {
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  New-Shortcut (Join-Path $Dir "桌面.lnk") ""
  New-Shortcut (Join-Path $Dir "自启.lnk") "--silent"
} else {
  $desk = [Environment]::GetFolderPath("Desktop")
  $startup = [Environment]::GetFolderPath("Startup")
  New-Shortcut (Join-Path $desk "地球 Online.lnk") ""
  New-Shortcut (Join-Path $startup "地球 Online.lnk") "--silent"
  Write-Output "桌面和开机启动的快捷方式都建好了"
}
