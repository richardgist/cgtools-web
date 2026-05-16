param(
  [int]$Port = 3000,
  [int]$MaxOldSpaceMb = 1536
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$env:NODE_OPTIONS = "--max-old-space-size=$MaxOldSpaceMb"
if (-not $env:NUXT_DEVTOOLS) {
  $env:NUXT_DEVTOOLS = '0'
}

Write-Host "[dev] web-ui root: $Root"
Write-Host "[dev] port: 127.0.0.1:$Port"
Write-Host "[dev] NODE_OPTIONS=$env:NODE_OPTIONS"
Write-Host "[dev] NUXT_DEVTOOLS=$env:NUXT_DEVTOOLS"

$CleanupScript = Join-Path $PSScriptRoot 'stop-old-dev.ps1'
if (Test-Path -LiteralPath $CleanupScript) {
  & $CleanupScript -IncludeCurrent3000
}

npx nuxt dev --host 127.0.0.1 --port $Port
