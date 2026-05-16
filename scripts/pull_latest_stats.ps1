[CmdletBinding()]
param(
    [string]$PackageName = 'com.tencent.tmgp.pubgmhd',
    [string]$ProjectName = 'ShadowTrackerExtra',
    [string]$DeviceSerial = '',
    [string]$LocalDir = '',
    [string]$P4Client = 'jesephjiang_JESEPHJIAN-PCBU_E_Trunk'
)

$ErrorActionPreference = 'Stop'

$P4_PORT = 'cgproxy.ied.com:9666'
$P4_USER = 'jesephjiang'
$P4_CHARSET = 'utf8'

function Set-P4Environment {
    $env:P4PORT = $P4_PORT
    $env:P4USER = $P4_USER
    $env:P4CHARSET = $P4_CHARSET

    if ($P4Client.Trim()) {
        $env:P4CLIENT = $P4Client.Trim()
    }
}

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
    $repoRoot = Split-Path -Parent $PSScriptRoot
    $performanceDataRoot = Join-Path $repoRoot 'PerformanceData'
    $LocalDir = Join-Path $performanceDataRoot 'Stats'
}

if (-not (Test-Path $LocalDir)) {
    New-Item -ItemType Directory -Path $LocalDir | Out-Null
    Write-Host "Created stats directory: $LocalDir"
}

Write-Host '===================================='
Write-Host '  Latest Stats Puller'
Write-Host '===================================='
Write-Host ''

Set-P4Environment
Write-Host "P4PORT: $env:P4PORT"
Write-Host "P4USER: $env:P4USER"
Write-Host "P4CLIENT: $($env:P4CLIENT)"
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

$candidatesByPath = @{}

foreach ($root in $remoteRoots) {
    $quotedRoot = Quote-AdbShellPath $root
    $findCommand = "find $quotedRoot -type f \( -name '*.ue4stats' -o -name '*.uestats' -o -name '*.ue4statsraw' \) 2>/dev/null"

    Write-Host "Scanning: $root"
    $findResult = Invoke-Adb -Arguments @('shell', $findCommand) -AllowFailure

    foreach ($line in $findResult.Output) {
        $remotePath = ($line.ToString() -replace "`r", '').Trim()
        if (-not $remotePath -or $candidatesByPath.ContainsKey($remotePath)) {
            continue
        }

        $quotedRemotePath = Quote-AdbShellPath $remotePath
        $statCommand = "stat -c '%Y|%s|%n' $quotedRemotePath 2>/dev/null"
        $statResult = Invoke-Adb -Arguments @('shell', $statCommand) -AllowFailure
        if ($statResult.ExitCode -ne 0 -or -not $statResult.Output) {
            continue
        }

        $statLine = ($statResult.Output | Select-Object -First 1).ToString().Trim()
        $parts = $statLine -split '\|', 3
        if ($parts.Count -lt 3) {
            continue
        }

        $candidatesByPath[$remotePath] = [pscustomobject]@{
            ModifiedAt = [DateTimeOffset]::FromUnixTimeSeconds([int64]$parts[0]).LocalDateTime
            ModifiedUnix = [int64]$parts[0]
            SizeBytes = [int64]$parts[1]
            RemotePath = $parts[2]
        }
    }
}

$latest = $candidatesByPath.Values | Sort-Object ModifiedUnix -Descending | Select-Object -First 1
if (-not $latest) {
    Write-Host ''
    Write-Host '[ERROR] No stats file found.'
    Write-Host 'Checked extensions: .ue4stats, .uestats, .ue4statsraw'
    Write-Host 'Checked roots:'
    $remoteRoots | ForEach-Object { Write-Host "  $_" }
    exit 1
}

$remoteFileName = [IO.Path]::GetFileName($latest.RemotePath)
if (-not $remoteFileName) {
    $remoteFileName = "LatestStats_$((Get-Date).ToString('yyyyMMdd_HHmmss')).ue4stats"
}

$outputPath = Join-Path $LocalDir $remoteFileName
if (Test-Path $outputPath) {
    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $stem = [IO.Path]::GetFileNameWithoutExtension($remoteFileName)
    $ext = [IO.Path]::GetExtension($remoteFileName)
    $outputPath = Join-Path $LocalDir ("{0}_{1}{2}" -f $stem, $timestamp, $ext)
}

Write-Host ''
Write-Host 'Latest stats file:'
Write-Host "  Remote: $($latest.RemotePath)"
Write-Host "  Modified: $($latest.ModifiedAt)"
Write-Host "  Size: $($latest.SizeBytes) bytes"
Write-Host ''
Write-Host 'Pulling latest stats file...'
Write-Host "  Local: $outputPath"

Invoke-Adb -Arguments @('pull', $latest.RemotePath, $outputPath) | Out-Null

Write-Host ''
Write-Host '===================================='
Write-Host '  Stats pull completed!'
Write-Host '===================================='
Write-Host "Saved to: $outputPath"
