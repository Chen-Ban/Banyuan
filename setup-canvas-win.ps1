# setup-canvas-win.ps1
# Usage: Run as Administrator in PowerShell
# Set-ExecutionPolicy Bypass -Scope Process -Force; .\setup-canvas-win.ps1

$ErrorActionPreference = "Stop"

Write-Host "=== node-canvas Windows Setup ===" -ForegroundColor Cyan

# 1. Check admin
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Please run as Administrator!" -ForegroundColor Red
    exit 1
}

# 2. Install VS Build Tools
Write-Host "[1/4] Installing Visual Studio Build Tools..." -ForegroundColor Green
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$needVS = $true
if (Test-Path $vswhere) {
    $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($vsPath) {
        Write-Host "  Already installed, skipping." -ForegroundColor DarkGray
        $needVS = $false
    }
}
if ($needVS) {
    Write-Host "  Downloading Build Tools installer..." -ForegroundColor Yellow
    $vsUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
    $vsExe = Join-Path $env:TEMP "vs_BuildTools.exe"
    Invoke-WebRequest -Uri $vsUrl -OutFile $vsExe -UseBasicParsing
    Write-Host "  Installing (this may take several minutes)..." -ForegroundColor Yellow
    $args1 = "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --wait"
    Start-Process -FilePath $vsExe -ArgumentList $args1 -Wait
    Remove-Item $vsExe -Force -ErrorAction SilentlyContinue
    Write-Host "  Done." -ForegroundColor Green
}

# 3. Install GTK2
Write-Host "[2/4] Installing GTK2 (Cairo/Pango)..." -ForegroundColor Green
$gtkRoot = "C:\GTK"
if (Test-Path (Join-Path $gtkRoot "bin\libcairo-2.dll")) {
    Write-Host "  Already installed, skipping." -ForegroundColor DarkGray
} else {
    $gtkUrl = "https://ftp.gnome.org/pub/GNOME/binaries/win64/gtk+/2.22/gtk+-bundle_2.22.1-20101229_win64.zip"
    $gtkZip = Join-Path $env:TEMP "gtk2.zip"
    Write-Host "  Downloading GTK2..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri $gtkUrl -OutFile $gtkZip -UseBasicParsing -TimeoutSec 120
    } catch {
        Write-Host "  Primary mirror failed, trying alternative..." -ForegroundColor Yellow
        $gtkUrl2 = "https://mirror.umd.edu/gnome/binaries/win64/gtk+/2.22/gtk+-bundle_2.22.1-20101229_win64.zip"
        Invoke-WebRequest -Uri $gtkUrl2 -OutFile $gtkZip -UseBasicParsing -TimeoutSec 120
    }
    Write-Host "  Extracting to C:\GTK..." -ForegroundColor Yellow
    if (Test-Path $gtkRoot) { Remove-Item $gtkRoot -Recurse -Force }
    New-Item -ItemType Directory -Path $gtkRoot -Force | Out-Null
    Expand-Archive -Path $gtkZip -DestinationPath $gtkRoot -Force
    Remove-Item $gtkZip -Force -ErrorAction SilentlyContinue
    Write-Host "  Done." -ForegroundColor Green
}

# 4. Install libjpeg-turbo
Write-Host "[3/4] Installing libjpeg-turbo..." -ForegroundColor Green
$jpegRoot = "C:\libjpeg-turbo64"
if (Test-Path (Join-Path $jpegRoot "bin")) {
    Write-Host "  Already installed, skipping." -ForegroundColor DarkGray
} else {
    Write-Host "  Installing via winget..." -ForegroundColor Yellow
    winget install libjpeg-turbo.libjpeg-turbo --accept-source-agreements --accept-package-agreements --silent 2>$null
    if (-not (Test-Path $jpegRoot)) {
        Write-Host "  winget failed. Please install manually from:" -ForegroundColor Red
        Write-Host "  https://sourceforge.net/projects/libjpeg-turbo/files/" -ForegroundColor Yellow
        Write-Host "  Install to C:\libjpeg-turbo64" -ForegroundColor Yellow
    } else {
        Write-Host "  Done." -ForegroundColor Green
    }
}

# 5. Set environment variables
Write-Host "[4/4] Setting environment variables..." -ForegroundColor Green

[Environment]::SetEnvironmentVariable("GTK_Root", $gtkRoot, "Machine")
Write-Host "  GTK_Root = $gtkRoot" -ForegroundColor Yellow

$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$gtkBin = Join-Path $gtkRoot "bin"
$jpegBin = Join-Path $jpegRoot "bin"

if ($machinePath -notlike "*$gtkBin*") {
    $machinePath = $machinePath + ";" + $gtkBin
    Write-Host "  Added $gtkBin to PATH" -ForegroundColor Yellow
}
if ($machinePath -notlike "*$jpegBin*") {
    $machinePath = $machinePath + ";" + $jpegBin
    Write-Host "  Added $jpegBin to PATH" -ForegroundColor Yellow
}
[Environment]::SetEnvironmentVariable("Path", $machinePath, "Machine")

Write-Host ""
Write-Host "=== ALL DONE ===" -ForegroundColor Cyan
Write-Host "Close this terminal, open a new one, then run:" -ForegroundColor Yellow
Write-Host "  cd E:\Banyuan" -ForegroundColor White
Write-Host "  pnpm install" -ForegroundColor White
Write-Host ""
