[CmdletBinding()]
param(
    [string]$PackageName = 'com.tencent.tmgp.pubgmhd',
    [string]$ProjectName = 'ShadowTrackerExtra',
    [string]$DeviceSerial = '',
    [string]$LocalDir = '',
    [int]$FallbackToLogcat = 1
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

function Invoke-AdbToFile {
    param(
        [string[]]$Arguments,
        [string]$OutputPath
    )

    $adbArgs = @()
    if ($DeviceSerial.Trim()) {
        $adbArgs += @('-s', $DeviceSerial.Trim())
    }
    $adbArgs += $Arguments

    $tempError = [System.IO.Path]::GetTempFileName()
    try {
        $process = Start-Process -FilePath 'adb' -ArgumentList $adbArgs -NoNewWindow -Wait -PassThru -RedirectStandardOutput $OutputPath -RedirectStandardError $tempError
        $errorText = ''
        if (Test-Path $tempError) {
            $rawErrorText = Get-Content -Path $tempError -Raw -ErrorAction SilentlyContinue
            if ($null -ne $rawErrorText) {
                $errorText = $rawErrorText.Trim()
            }
        }
        [pscustomobject]@{
            ExitCode = $process.ExitCode
            ErrorText = $errorText
        }
    } finally {
        Remove-Item -Path $tempError -Force -ErrorAction SilentlyContinue
    }
}

function Quote-AdbShellPath {
    param([string]$Path)
    "'" + $Path.Replace("'", "'\''") + "'"
}

function Test-PulledFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return $false
    }

    $item = Get-Item $Path
    if ($item.Length -le 0) {
        return $false
    }

    # adb exec-out 在权限失败时可能把设备侧错误写进输出文件；避免把错误文本当成日志。
    $buffer = New-Object byte[] ([Math]::Min($item.Length, 4096))
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $bytesRead = $stream.Read($buffer, 0, $buffer.Length)
    } finally {
        $stream.Dispose()
    }
    $prefixText = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $bytesRead)
    $isDeviceError = (
        ($prefixText -match '(^|/)(cat|head|sh|su): .*(Permission denied|inaccessible|not found)') `
        -or ($prefixText -match 'inaccessible or not found')
    )
    return -not $isDeviceError
}

function Get-FilePrefixText {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return ''
    }

    $item = Get-Item $Path
    if ($item.Length -le 0) {
        return ''
    }

    $buffer = New-Object byte[] ([Math]::Min($item.Length, 4096))
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $bytesRead = $stream.Read($buffer, 0, $buffer.Length)
    } finally {
        $stream.Dispose()
    }
    return [System.Text.Encoding]::UTF8.GetString($buffer, 0, $bytesRead).Trim()
}

function Get-GamePid {
    $pidResult = Invoke-Adb -Arguments @('shell', 'pidof', $PackageName) -AllowFailure
    if ($pidResult.ExitCode -ne 0) {
        return ''
    }

    return (($pidResult.Output | Out-String).Trim() -split '\s+' | Select-Object -First 1)
}

function Pull-LogcatFallback {
    param(
        [string]$OutputPath,
        [System.Collections.Generic.List[string]]$Evidence
    )

    if ($FallbackToLogcat -eq 0) {
        return $false
    }

    $gamePid = Get-GamePid
    Write-Host ''
    if ($gamePid) {
        Write-Host 'Saved log file is private; pulling current process logcat instead...'
        Write-Host "  Package: $PackageName"
        Write-Host "  PID: $gamePid"
        Write-Host "  Local: $OutputPath"
        $logcatArgs = @('logcat', '-d', '--pid', $gamePid)
    } else {
        Write-Host 'Saved log file is private and the game process is not running; pulling recent logcat buffer instead...'
        Write-Host "  Package: $PackageName"
        Write-Host "  Local: $OutputPath"
        $logcatArgs = @('logcat', '-d', '-v', 'time', '-t', '20000')
    }

    $logcatResult = Invoke-AdbToFile -Arguments $logcatArgs -OutputPath $OutputPath
    if ($logcatResult.ExitCode -eq 0 -and (Test-PulledFile $OutputPath)) {
        $item = Get-Item $OutputPath
        if ($item.Length -gt 0) {
            Write-Host ''
            Write-Host '===================================='
            Write-Host '  Logcat pull completed!'
            Write-Host '===================================='
            Write-Host "Saved to: $OutputPath"
            if ($gamePid) {
                Write-Host 'Note: this is adb logcat for the running process, not the private Saved/Logs file.'
            } else {
                Write-Host 'Note: this is a recent unfiltered adb logcat buffer because the game process is not running.'
            }
            return $true
        }
    }

    $logcatDetail = (($logcatResult.ErrorText, (Get-FilePrefixText $OutputPath)) | Where-Object { $_ } | Select-Object -First 1)
    $logcatTarget = if ($gamePid) { "pid $gamePid" } else { 'recent buffer' }
    $Evidence.Add("Logcat fallback failed for ${logcatTarget}: $logcatDetail")
    Remove-Item -Path $OutputPath -Force -ErrorAction SilentlyContinue
    return $false
}

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    throw 'adb not found. Please install adb and add it to PATH.'
}

if (-not $LocalDir.Trim()) {
    $repoRoot = Split-Path -Parent $PSScriptRoot
    $LocalDir = Join-Path (Join-Path $repoRoot 'PerformanceData') 'Logs'
}

if (-not (Test-Path $LocalDir)) {
    New-Item -ItemType Directory -Path $LocalDir | Out-Null
    Write-Host "Created log directory: $LocalDir"
}

Write-Host '===================================='
Write-Host '  Game Log Puller'
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

$remoteCandidates = @(
    "/sdcard/Android/data/$PackageName/files/UE4Game/$ProjectName/$ProjectName/Saved/Logs/$ProjectName.log",
    "/sdcard/UE4Game/$ProjectName/$ProjectName/Saved/Logs/$ProjectName.log"
)

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$outputFile = Join-Path $LocalDir ("{0}_{1}.log" -f $ProjectName, $timestamp)
$lastErrors = New-Object System.Collections.Generic.List[string]

foreach ($remotePath in $remoteCandidates) {
    Write-Host "Checking: $remotePath"
    $quotedRemote = Quote-AdbShellPath $remotePath
    $existsResult = Invoke-Adb -Arguments @('shell', "test -f $quotedRemote") -AllowFailure
    if ($existsResult.ExitCode -ne 0) {
        $lastErrors.Add("Missing: $remotePath")
        continue
    }

    Write-Host 'Pulling log file...'
    Write-Host "  Source: $remotePath"
    Write-Host "  Local: $outputFile"
    $pullResult = Invoke-Adb -Arguments @('pull', $remotePath, $outputFile) -AllowFailure
    if ($pullResult.ExitCode -eq 0 -and (Test-PulledFile $outputFile)) {
        Write-Host ''
        Write-Host '===================================='
        Write-Host '  Log pull completed!'
        Write-Host '===================================='
        Write-Host "Saved to: $outputFile"
        exit 0
    }
    $lastErrors.Add("adb pull failed for ${remotePath}: $(($pullResult.Output | Out-String).Trim())")
    Remove-Item -Path $outputFile -Force -ErrorAction SilentlyContinue

    # 某些 debug 包允许 run-as 读取 app 私有文件；若设备的外部存储策略允许，这里可无 root 拉出日志。
    Write-Host 'Direct adb pull was denied, trying run-as stream...'
    $runAsResult = Invoke-AdbToFile -Arguments @('exec-out', 'run-as', $PackageName, 'cat', $remotePath) -OutputPath $outputFile
    if ($runAsResult.ExitCode -eq 0 -and (Test-PulledFile $outputFile)) {
        Write-Host ''
        Write-Host '===================================='
        Write-Host '  Log pull completed via run-as!'
        Write-Host '===================================='
        Write-Host "Saved to: $outputFile"
        exit 0
    }
    $runAsDetail = (($runAsResult.ErrorText, (Get-FilePrefixText $outputFile)) | Where-Object { $_ } | Select-Object -First 1)
    $lastErrors.Add("run-as stream failed for ${remotePath}: $runAsDetail")
    Remove-Item -Path $outputFile -Force -ErrorAction SilentlyContinue

    # rooted 工程机可通过 su 读取当前这类 770 app 文件；普通设备没有 su 时会自然失败。
    Write-Host 'run-as could not read the file, trying rooted su stream...'
    $suCommand = "cat $quotedRemote"
    $suResult = Invoke-AdbToFile -Arguments @('exec-out', 'su', '-c', $suCommand) -OutputPath $outputFile
    if ($suResult.ExitCode -eq 0 -and (Test-PulledFile $outputFile)) {
        Write-Host ''
        Write-Host '===================================='
        Write-Host '  Log pull completed via su!'
        Write-Host '===================================='
        Write-Host "Saved to: $outputFile"
        exit 0
    }
    $suDetail = (($suResult.ErrorText, (Get-FilePrefixText $outputFile)) | Where-Object { $_ } | Select-Object -First 1)
    $lastErrors.Add("su stream failed for ${remotePath}: $suDetail")
    Remove-Item -Path $outputFile -Force -ErrorAction SilentlyContinue

    $statResult = Invoke-Adb -Arguments @('shell', "ls -l $quotedRemote 2>&1") -AllowFailure
    if ($statResult.Output) {
        $lastErrors.Add("Remote stat: $(($statResult.Output | Out-String).Trim())")
    }
}

if (Pull-LogcatFallback -OutputPath $outputFile -Evidence $lastErrors) {
    exit 0
}

Write-Host ''
Write-Host '[ERROR] Failed to pull game log.'
Write-Host 'The file exists, but Android denied every host-side read method that this script can use.'
Write-Host ''
Write-Host 'What to check next:'
Write-Host '  1. If this is a debug/test build, make the game export or chmod the log to a readable public path.'
Write-Host '  2. Prefer an app-side copy to /sdcard/Download or /sdcard/UE4Game before running this puller.'
Write-Host '  3. On rooted engineering devices, ensure su is available to adb shell.'
Write-Host ''
Write-Host 'Evidence:'
$lastErrors | ForEach-Object { Write-Host "  - $_" }
exit 1
