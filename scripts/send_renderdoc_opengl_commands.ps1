param(
    [string]$PackageName = "com.tencent.tmgp.pubgmhd",
    [string]$DeviceSerial = "",
    [string]$Commands = "r.RHISetGPUCaptureOptions 1;r.ShowMaterialDrawEvents 1",
    [int]$DelayMs = 300,
    [int]$RequireProcess = 1,
    [int]$DryRun = 0
)

function Write-Info([string]$Message) { Write-Host $Message }
function Write-Warn([string]$Message) { Write-Host "WARNING: $Message" }
function Write-ErrorMsg([string]$Message) { Write-Host "ERROR: $Message"; exit 1 }

function Get-AdbArgs {
    $args = @()
    if ($DeviceSerial) {
        $args += @("-s", $DeviceSerial)
    }
    return $args
}

function Invoke-AdbChecked([string[]]$AdbCommandArgs, [string]$ErrorMessage) {
    $adbArgs = Get-AdbArgs
    $fullArgs = @($adbArgs + $AdbCommandArgs)
    Write-Info ("adb " + ($fullArgs -join " "))

    if ($DryRun -ne 0) {
        return @()
    }

    $output = & adb @fullArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        if ($output) { $output | ForEach-Object { Write-Host $_ } }
        Write-ErrorMsg $ErrorMessage
    }
    return $output
}

function ConvertTo-ShellSingleQuoted([string]$Value) {
    return "'" + ($Value -replace "'", "'\\''") + "'"
}

function Send-UeConsoleCommand([string]$CommandText) {
    $quotedPackage = ConvertTo-ShellSingleQuoted $PackageName
    $quotedCommand = ConvertTo-ShellSingleQuoted $CommandText
    $remoteCommand = "am broadcast -p $quotedPackage -a android.intent.action.RUN --es cmd $quotedCommand"
    Invoke-AdbChecked -AdbCommandArgs @("shell", $remoteCommand) -ErrorMessage "Failed to broadcast command: $CommandText" | Out-Null
}

function Test-AdbAvailable {
    if ($DryRun -ne 0) {
        return
    }

    $adb = Get-Command adb -ErrorAction SilentlyContinue
    if (-not $adb) {
        Write-ErrorMsg "adb not found in PATH."
    }
}

function Test-DeviceConnected {
    if ($DryRun -ne 0) {
        return
    }

    $adbArgs = Get-AdbArgs
    $devices = & adb @adbArgs devices 2>&1
    if ($LASTEXITCODE -ne 0) {
        $devices | ForEach-Object { Write-Host $_ }
        Write-ErrorMsg "adb devices failed."
    }

    $deviceLines = $devices | Select-String -Pattern "`tdevice$"
    if (-not $deviceLines) {
        $devices | ForEach-Object { Write-Host $_ }
        Write-ErrorMsg "No connected device in 'device' state."
    }

    if (($deviceLines | Measure-Object).Count -gt 1 -and -not $DeviceSerial) {
        $devices | ForEach-Object { Write-Host $_ }
        Write-ErrorMsg "Multiple devices found. Set DeviceSerial."
    }
}

function Test-GameProcess {
    if ($RequireProcess -eq 0 -or $DryRun -ne 0) {
        return
    }

    $adbArgs = Get-AdbArgs
    $pidOutput = & adb @adbArgs shell pidof $PackageName 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (($pidOutput -join "").Trim())) {
        Write-ErrorMsg "Package process is not running: $PackageName. Start the game first, then run this shortcut."
    }

    Write-Info ("Game process detected: " + (($pidOutput -join " ").Trim()))
}

function Get-CommandList([string]$RawCommands) {
    return $RawCommands -split "[;`r`n]+" |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_.Length -gt 0 }
}

Write-Info "RenderDoc OpenGL runtime command shortcut"
Write-Info "Package: $PackageName"

$commandList = @(Get-CommandList $Commands)
if ($commandList.Count -eq 0) {
    Write-ErrorMsg "Commands is empty."
}

Test-AdbAvailable
Test-DeviceConnected
Test-GameProcess

foreach ($cmd in $commandList) {
    Write-Info "Sending UE console command: $cmd"
    Send-UeConsoleCommand $cmd
    if ($DelayMs -gt 0) {
        Start-Sleep -Milliseconds $DelayMs
    }
}

Write-Info "Done. Capture the next frame in RenderDoc and check whether marker names replace plain glDrawElements entries."
