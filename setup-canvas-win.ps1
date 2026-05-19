# setup-canvas-win.ps1
# 一键安装 Windows 上编译 node-canvas 所需的全部依赖
# 使用方法：以管理员身份打开 PowerShell，执行 .\setup-canvas-win.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " node-canvas Windows 编译环境一键安装" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. 检查管理员权限 ---
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] 请以管理员身份运行此脚本！" -ForegroundColor Red
    Write-Host "右键 PowerShell -> 以管理员身份运行" -ForegroundColor Yellow
    exit 1
}

# --- 2. 安装 Visual Studio Build Tools (C++ 编译工具) ---
Write-Host "[1/4] 检查 Visual Studio Build Tools..." -ForegroundColor Green

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vsInstalled = $false
if (Test-Path $vswhere) {
    $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($vsPath) { $vsInstalled = $true }
}

if ($vsInstalled) {
    Write-Host "  -> 已安装，跳过" -ForegroundColor DarkGray
} else {
    Write-Host "  -> 正在安装 Visual Studio 2022 Build Tools (C++ workload)..." -ForegroundColor Yellow
    winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --wait" --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  -> winget 安装失败，尝试直接下载安装..." -ForegroundColor Yellow
        $installerUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
        $installerPath = "$env:TEMP\vs_BuildTools.exe"
        Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath
        Start-Process -FilePath $installerPath -ArgumentList "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --wait" -Wait
        Remove-Item $installerPath -Force
    }
    Write-Host "  -> Build Tools 安装完成" -ForegroundColor Green
}

# --- 3. 安装 GTK2 (Cairo/Pango 图形库) ---
Write-Host "[2/4] 检查 GTK2..." -ForegroundColor Green

$gtkRoot = "C:\GTK"
if (Test-Path "$gtkRoot\bin\libcairo-2.dll") {
    Write-Host "  -> 已安装在 $gtkRoot，跳过" -ForegroundColor DarkGray
} else {
    Write-Host "  -> 正在下载 GTK2 bundle..." -ForegroundColor Yellow
    $gtkUrl = "https://ftp.gnome.org/pub/GNOME/binaries/win64/gtk+/2.22/gtk+-bundle_2.22.1-20101229_win64.zip"
    $gtkZip = "$env:TEMP\gtk2-bundle.zip"
    
    # 尝试多个下载源
    $gtkUrls = @(
        "https://ftp.gnome.org/pub/GNOME/binaries/win64/gtk+/2.22/gtk+-bundle_2.22.1-20101229_win64.zip",
        "https://mirror.umd.edu/gnome/binaries/win64/gtk+/2.22/gtk+-bundle_2.22.1-20101229_win64.zip"
    )
    
    $downloaded = $false
    foreach ($url in $gtkUrls) {
        try {
            Write-Host "  -> 尝试下载: $url" -ForegroundColor DarkGray
            Invoke-WebRequest -Uri $url -OutFile $gtkZip -UseBasicParsing -TimeoutSec 60
            $downloaded = $true
            break
        } catch {
            Write-Host "  -> 下载失败，尝试下一个源..." -ForegroundColor Yellow
        }
    }
    
    if (-not $downloaded) {
        Write-Host "[ERROR] GTK2 下载失败，请手动下载并解压到 C:\GTK" -ForegroundColor Red
        Write-Host "下载地址: https://ftp.gnome.org/pub/GNOME/binaries/win64/gtk+/2.22/gtk+-bundle_2.22.1-20101229_win64.zip" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "  -> 解压到 $gtkRoot..." -ForegroundColor Yellow
    if (Test-Path $gtkRoot) { Remove-Item $gtkRoot -Recurse -Force }
    New-Item -ItemType Directory -Path $gtkRoot -Force | Out-Null
    Expand-Archive -Path $gtkZip -DestinationPath $gtkRoot -Force
    Remove-Item $gtkZip -Force
    Write-Host "  -> GTK2 安装完成" -ForegroundColor Green
}

# --- 4. 安装 libjpeg-turbo ---
Write-Host "[3/4] 检查 libjpeg-turbo..." -ForegroundColor Green

$jpegRoot = "C:\libjpeg-turbo64"
if (Test-Path "$jpegRoot\bin\jpeg62.dll") {
    Write-Host "  -> 已安装在 $jpegRoot，跳过" -ForegroundColor DarkGray
} else {
    Write-Host "  -> 正在安装 libjpeg-turbo..." -ForegroundColor Yellow
    winget install libjpeg-turbo.libjpeg-turbo --accept-source-agreements --accept-package-agreements 2>$null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path "$jpegRoot\bin\jpeg62.dll")) {
        # winget 失败时直接下载
        $jpegUrl = "https://sourceforge.net/projects/libjpeg-turbo/files/3.0.1/libjpeg-turbo-3.0.1-vc64.exe/download"
        $jpegInstaller = "$env:TEMP\libjpeg-turbo-install.exe"
        Write-Host "  -> winget 失败，直接下载安装包..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $jpegUrl -OutFile $jpegInstaller -UseBasicParsing
        Start-Process -FilePath $jpegInstaller -ArgumentList "/S" -Wait
        Remove-Item $jpegInstaller -Force
    }
    Write-Host "  -> libjpeg-turbo 安装完成" -ForegroundColor Green
}

# --- 5. 配置环境变量 ---
Write-Host "[4/4] 配置环境变量..." -ForegroundColor Green

# 设置 GTK_Root
$currentGtkRoot = [Environment]::GetEnvironmentVariable("GTK_Root", "Machine")
if ($currentGtkRoot -ne $gtkRoot) {
    [Environment]::SetEnvironmentVariable("GTK_Root", $gtkRoot, "Machine")
    Write-Host "  -> 已设置 GTK_Root=$gtkRoot" -ForegroundColor Yellow
} else {
    Write-Host "  -> GTK_Root 已正确设置" -ForegroundColor DarkGray
}

# 将 GTK\bin 和 libjpeg-turbo\bin 加入 PATH
$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$pathsToAdd = @("$gtkRoot\bin", "$jpegRoot\bin")
$pathModified = $false

foreach ($p in $pathsToAdd) {
    if ($machinePath -notlike "*$p*") {
        $machinePath = "$machinePath;$p"
        $pathModified = $true
        Write-Host "  -> 已添加 $p 到 PATH" -ForegroundColor Yellow
    } else {
        Write-Host "  -> $p 已在 PATH 中" -ForegroundColor DarkGray
    }
}

if ($pathModified) {
    [Environment]::SetEnvironmentVariable("Path", $machinePath, "Machine")
}

# 刷新当前会话的 PATH
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$env:GTK_Root = $gtkRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " 安装完成！" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "请关闭当前终端，重新打开后执行：" -ForegroundColor Yellow
Write-Host "  cd E:\Banyuan" -ForegroundColor White
Write-Host "  pnpm install" -ForegroundColor White
Write-Host ""
Write-Host "如果 canvas 仍编译失败，请检查 Node 版本（推荐 v20 LTS）：" -ForegroundColor Yellow
Write-Host "  nvm install 20" -ForegroundColor White
Write-Host "  nvm use 20" -ForegroundColor White
Write-Host ""
