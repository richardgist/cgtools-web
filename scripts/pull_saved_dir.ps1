[CmdletBinding()]
param(
    [string]$PackageName = 'com.tencent.tmgp.pubgmhd',
    [string]$ProjectName = 'ShadowTrackerExtra',
    [string]$DeviceSerial = '',
    [string]$LocalDir = ''
)

$ErrorActionPreference = 'Stop'

function Invoke-Adb {
    param(
        [string[]]$Arguments,
        [switch]$AllowFailure
    )

    $adbArgs = @()
    if ($DeviceSerial.Trim()) {
        $adbArgs += @('-s', $DeviceSerial.Trim())
    }
    $adbArgs += $Arguments

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & adb @adbArgs 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        $message = ($output | Out-String).Trim()
        if (-not $message) {
            $message = "adb exited with code $exitCode"
        }
        throw $message
    }

    [pscustomobject]@{
        ExitCode = $exitCode
        Output = $output
    }
}

function Quote-AdbShellPath {
    param([string]$Path)
    "'" + $Path.Replace("'", "'\''") + "'"
}

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    throw 'adb not found. Please install adb and add it to PATH.'
}

if (-not $LocalDir.Trim()) {
    $LocalDir = Join-Path $PSScriptRoot 'Saved'
}

if (-not (Test-Path $LocalDir)) {
    New-Item -ItemType Directory -Path $LocalDir | Out-Null
    Write-Host "Created saved directory: $LocalDir"
}

Write-Host '===================================='
Write-Host '  Saved Directory Puller'
Write-Host '===================================='
Write-Host ''

Write-Host 'Checking device connection...'
if ($DeviceSerial.Trim()) {
    Invoke-Adb -Arguments @('get-state') | Out-Null
    Write-Host "Device connected: $($DeviceSerial.Trim())"
} else {
    $deviceLines = @((& adb devices) | Where-Object { $_ -match "`tdevice$" })
    if (-not $deviceLines -or $deviceLines.Count -eq 0) {
        Write-Host '[ERROR] No device detected. Current adb devices:'
        & adb devices
        exit 1
    }
    if ($deviceLines.Count -gt 1) {
        Write-Host '[ERROR] Multiple devices detected. Please fill DeviceSerial in the script runner.'
        & adb devices
        exit 1
    }
    Write-Host "Device connected: $($deviceLines[0].Split("`t")[0])"
}
Write-Host ''

$remoteRoots = @(
    "/sdcard/Android/data/$PackageName/files/UE4Game/$ProjectName/$ProjectName/Saved",
    "/sdcard/UE4Game/$ProjectName/$ProjectName/Saved"
)

$remoteSavedDir = $null
foreach ($root in $remoteRoots) {
    Write-Host "Checking: $root"
    $quotedRoot = Quote-AdbShellPath $root
    $testResult = Invoke-Adb -Arguments @('shell', "test -d $quotedRoot") -AllowFailure
    if ($testResult.ExitCode -eq 0) {
        $remoteSavedDir = $root
        break
    }
}

if (-not $remoteSavedDir) {
    Write-Host ''
    Write-Host '[ERROR] Saved directory not found.'
    Write-Host 'Checked roots:'
    $remoteRoots | ForEach-Object { Write-Host "  $_" }
    exit 1
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$destination = Join-Path $LocalDir ("{0}_Saved_{1}" -f $ProjectName, $timestamp)

Write-Host ''
Write-Host 'Pulling Saved directory...'
Write-Host "  Remote: $remoteSavedDir"
Write-Host "  Local: $destination"

Invoke-Adb -Arguments @('pull', $remoteSavedDir, $destination) | Out-Null

Write-Host ''
Write-Host '===================================='
Write-Host '  Saved pull completed!'
Write-Host '===================================='
Write-Host "Saved to: $destination"
