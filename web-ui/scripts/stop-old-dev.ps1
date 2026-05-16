[CmdletBinding(PositionalBinding = $false)]
param(
  [int[]]$Ports = @(3001, 3002, 3003, 3004, 3005, 3006, 24680),
  [int]$OlderThanHours = 8,
  [switch]$IncludeCurrent3000
)

$ErrorActionPreference = 'Continue'

$Now = Get-Date
$TargetPids = New-Object System.Collections.Generic.HashSet[int]

$PortsToCheck = New-Object System.Collections.Generic.HashSet[int]
foreach ($Port in $Ports) {
  [void]$PortsToCheck.Add([int]$Port)
}
if ($IncludeCurrent3000) {
  [void]$PortsToCheck.Add(3000)
}

$NetstatLines = netstat -ano | Select-String -Pattern 'LISTENING'
foreach ($Line in $NetstatLines) {
  $Text = [string]$Line.Line
  $Parts = $Text -split '\s+' | Where-Object { $_ }
  if ($Parts.Count -lt 5) {
    continue
  }

  $LocalAddress = $Parts[1]
  $OwningPid = $Parts[$Parts.Count - 1]

  if ($LocalAddress -match ':(\d+)$') {
    $LocalPort = [int]$Matches[1]
    if ($PortsToCheck.Contains($LocalPort) -and $OwningPid -match '^\d+$') {
      [void]$TargetPids.Add([int]$OwningPid)
    }
  }
}

$OldNodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -like '*\nodejs\node.exe' -and
  $_.StartTime -and
  (($Now - $_.StartTime).TotalHours -ge $OlderThanHours)
}

foreach ($Process in $OldNodeProcesses) {
  [void]$TargetPids.Add([int]$Process.Id)
}

$Targets = foreach ($TargetPid in $TargetPids) {
  Get-Process -Id $TargetPid -ErrorAction SilentlyContinue
}

if (-not $Targets) {
  Write-Host "[cleanup] no old Node dev processes found."
  exit 0
}

Write-Host "[cleanup] stopping Node dev processes:"
$Targets | Select-Object Id, ProcessName, Path, StartTime, @{Name='MemoryMB';Expression={[math]::Round($_.WorkingSet64 / 1MB, 1)}} | Format-Table -AutoSize

foreach ($Process in $Targets) {
  Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1

Write-Host "[cleanup] remaining Node listeners:"
$NodeIds = (Get-Process -Name node -ErrorAction SilentlyContinue).Id
if ($NodeIds) {
  $Pattern = ($NodeIds | ForEach-Object { [regex]::Escape([string]$_) }) -join '|'
  netstat -ano | Select-String -Pattern "\s($Pattern)$" | ForEach-Object { $_.Line }
}
