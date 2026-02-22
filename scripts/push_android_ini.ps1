param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot "push_android_ini.config.json")
)

function Write-Info([string]$Message) { Write-Host $Message }
function Write-ErrorMsg([string]$Message) { Write-Host "ERROR: $Message"; exit 1 }

# Create template if missing
if (-not (Test-Path -Path $ConfigPath)) {
    $template = [ordered]@{
        packageName = "com.tencent.tmgp.pubgmhd"
        gameName    = "ShadowTrackerExtra"
        iniName     = "Engine.ini"
        pathMode    = "auto"  # auto | new | legacy
        deviceSerial = ""
        sourceIniPath = ""
        sections = [ordered]@{
            ConsoleVariables = [ordered]@{
                "r.FSOC.MaxStaticMeshOccluderQuads" = "1000"
            }
        }
    }

    $template | ConvertTo-Json -Depth 6 | Set-Content -Path $ConfigPath -Encoding UTF8
    Write-Info "Config template created: $ConfigPath"
    Write-Info "Edit it and run this script again."
    exit 0
}

# Load config
try {
    $config = Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json
} catch {
    Write-ErrorMsg "Failed to read config JSON: $ConfigPath"
}

$packageName = $config.packageName
$gameName = $config.gameName
$iniName = $config.iniName
$pathMode = $config.pathMode
$deviceSerial = $config.deviceSerial
$sourceIniPath = $config.sourceIniPath
$sections = $config.sections

if (-not $packageName) { Write-ErrorMsg "packageName is required." }
if (-not $gameName) { Write-ErrorMsg "gameName is required." }
if (-not $iniName) { $iniName = "Engine.ini" }
if (-not $pathMode) { $pathMode = "auto" }

# Resolve source ini if provided
$iniToPush = $null
if ($sourceIniPath) {
    $resolved = $sourceIniPath
    if (-not (Test-Path -Path $resolved)) {
        $resolved = Join-Path (Split-Path $ConfigPath -Parent) $sourceIniPath
    }
    if (Test-Path -Path $resolved) {
        $iniToPush = (Resolve-Path $resolved).Path
    } else {
        Write-ErrorMsg "sourceIniPath not found: $sourceIniPath"
    }
}

# Generate ini if no source file
if (-not $iniToPush) {
    if (-not $sections) { Write-ErrorMsg "sections is required when sourceIniPath is empty." }

    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($section in $sections.PSObject.Properties) {
        $sectionName = $section.Name
        $pairs = $section.Value
        $lines.Add("[$sectionName]")
        foreach ($pair in $pairs.PSObject.Properties) {
            $lines.Add("$($pair.Name)=$($pair.Value)")
        }
        $lines.Add("")
    }

    $tempPath = Join-Path $env:TEMP ("android_ini_{0}.ini" -f (Get-Date -Format "yyyyMMdd_HHmmss"))
    $lines | Set-Content -Path $tempPath -Encoding UTF8
    $iniToPush = $tempPath
}

# Check adb
$adbCmd = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbCmd) { Write-ErrorMsg "adb not found in PATH." }

$adbArgs = @()
if ($deviceSerial) { $adbArgs += @("-s", $deviceSerial) }

# Check devices
$devices = & adb @adbArgs devices
if ($LASTEXITCODE -ne 0) { Write-ErrorMsg "adb devices failed." }

$deviceLines = $devices | Select-String -Pattern "\tdevice$"
if (-not $deviceLines) { Write-ErrorMsg "No connected device in 'device' state." }
if (($deviceLines | Measure-Object).Count -gt 1 -and -not $deviceSerial) {
    Write-ErrorMsg "Multiple devices found. Set deviceSerial in config." 
}

$newPath = "/sdcard/Android/data/$packageName/files/UE4Game/$gameName/$gameName/Saved/Config/Android"
$legacyPath = "/sdcard/UE4Game/$gameName/$gameName/Saved/Config/Android"

function Test-RemoteDir([string]$Path) {
    $out = & adb @adbArgs shell sh -c "test -d $Path && echo EXISTS"
    return $out -match "EXISTS"
}

$remoteDir = $null
switch ($pathMode.ToLower()) {
    "new" { $remoteDir = $newPath }
    "legacy" { $remoteDir = $legacyPath }
    default {
        if (Test-RemoteDir $newPath) { $remoteDir = $newPath }
        else { $remoteDir = $legacyPath }
    }
}

$remoteFile = "$remoteDir/$iniName"

Write-Info "Using device path: $remoteDir"
Write-Info "Pushing ini: $iniToPush -> $remoteFile"

& adb @adbArgs shell mkdir -p $remoteDir
if ($LASTEXITCODE -ne 0) { Write-ErrorMsg "Failed to create remote directory." }

& adb @adbArgs push $iniToPush $remoteFile
if ($LASTEXITCODE -ne 0) { Write-ErrorMsg "adb push failed." }

Write-Info "Done."
