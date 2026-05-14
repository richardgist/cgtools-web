########################################################################
# Update-AllRepos.ps1
# Sequentially updates multiple SVN repositories and P4 workspaces,
# then reports any conflicted files.
########################################################################

#region ==================== COMMAND-LINE PARAMETERS ====================
param(
    [string]$RootPath = "E:\PUBGTrunk",
    [string]$P4Client = "jesephjiang_JESEPHJIAN-PCBU_E_Trunk",

    [Alias('svn')]
    [switch]$SvnOnly,

    [Alias('p4')]
    [switch]$P4Only,

    [Alias('latest')]
    [switch]$P4Latest,

    [Alias('conflict-abort')]
    [switch]$ConflictAbort
)
#endregion ==================== COMMAND-LINE PARAMETERS ====================

#region ==================== CONFIGURATION ====================
# 
# Configure your SVN repositories and P4 workspaces below.
# Modify these arrays to match your local environment.
#

function Resolve-UpdateRoot {
    param([string]$InputRoot)

    $candidate = if ($InputRoot) { $InputRoot.Trim() } else { "E:\PUBGTrunk" }
    if (-not $candidate) { $candidate = "E:\PUBGTrunk" }

    $candidate = $candidate -replace '/', '\'
    $candidate = $candidate.TrimEnd('\')

    if ($candidate -match '^[A-Za-z]:$') {
        return "$candidate\"
    }

    if ((Split-Path -Path $candidate -Leaf) -ieq "Survive") {
        $parent = Split-Path -Path $candidate -Parent
        if ($parent) { return $parent.TrimEnd('\') }
    }

    return $candidate
}

$UpdateRoot = Resolve-UpdateRoot -InputRoot $RootPath

# SVN Repositories: Array of local folder paths to SVN working copies.
# Example:
#   $SVN_REPOS = @(
#       "E:\Projects\MyGame\Art",
#       "E:\Projects\MyGame\Design",
#       "D:\SharedAssets\Common"
#   )
$SVN_REPOS = @(
    (Join-Path -Path $UpdateRoot -ChildPath "Survive\Source"),
    (Join-Path -Path $UpdateRoot -ChildPath "Survive\Plugins"),
    (Join-Path -Path $UpdateRoot -ChildPath "UE4181\Engine\Source")
)

# P4 Connection Settings:
#   - P4_PORT: The Perforce server address and port (e.g., "ssl:perforce.company.com:1666")
#   - P4_USER: Your Perforce username
#
# These will be set as P4PORT and P4USER environment variables at runtime.
# Leave empty ("") to use the existing system/user environment variable values.
$P4_PORT = "cgproxy.ied.com:9666"   # e.g., "ssl:perforce.company.com:1666"
$P4_USER = "jesephjiang"   # e.g., "john.doe"

$ResolvedP4Client = if ($P4Client -and $P4Client.Trim()) {
    $P4Client.Trim()
} elseif ($env:P4CLIENT) {
    $env:P4CLIENT
} else {
    ""
}

# Preferred P4 sync path:
#   The project already ships Tools\ParallelP4Sync. Use it by default so this
#   wrapper follows the same directory list and parallel sync behavior as the
#   project update tool.
$ParallelP4SyncRoot = Join-Path -Path $UpdateRoot -ChildPath "Survive\Tools\ParallelP4Sync"
$ParallelP4SyncArgs = @("main.py", "daily")
if ($P4Latest.IsPresent) {
    $ParallelP4SyncArgs += "latest"
}

$P4_SYNC_TOOLS = @(
    @{
        Name      = "ParallelP4Sync"
        RootPath  = $ParallelP4SyncRoot
        Command   = "python"
        Arguments = $ParallelP4SyncArgs
        P4Client  = $ResolvedP4Client
    }
)

# Legacy direct P4 workspace sync fallback. Keep empty by default; the project
# updater above is the normal P4 path now.
#
# P4 Workspaces: Array of objects, each containing:
#   - P4Client:  The Perforce client workspace name (used as P4CLIENT)
#   - RootPath:  The local root folder path of the workspace
#   - SubDirs:   (Optional) Array of sub-directory entries under RootPath.
#                If specified, only these sub-directories will be synced instead of
#                the entire workspace. Paths are relative to RootPath.
#                If omitted or empty, the entire workspace will be synced.
#   - EnumerateSubDirs:
#                (Optional) If true, queries immediate P4 child directories under
#                RootPath and syncs each child directory separately. This keeps
#                large roots such as Survive and UE4181 split without hardcoding
#                every child folder in this script.
#
#                Each entry in SubDirs can be:
#                  - A simple string: e.g., "Source\Runtime"
#                    Syncs the entire sub-directory in one request.
#                  - A hashtable with Path and BatchCount: e.g.,
#                    @{ Path = "Content"; BatchCount = 3 }
#                    Enumerates immediate child directories under "Content",
#                    splits them into 3 batches, and syncs each batch separately.
#                    This is useful for very large directories where a single sync
#                    request may be interrupted by the server.
#                    BatchCount = 1 (or omitted) means sync the entire sub-directory at once.
#
# Authentication: Uses existing P4 tickets or logged-in session.
#                 NO passwords are stored in this script.
#
# Example:
#   $P4_WORKSPACES = @(
#       # Sync entire workspace
#       @{ P4Client = "john_game_main"; RootPath = "E:\P4\GameMain" },
#       # Sync specific sub-directories, with batched sync for large dirs
#       @{ P4Client = "john_engine"; RootPath = "E:\P4\Engine";
#          SubDirs = @(
#              "Source\Runtime",                          # simple string, sync at once
#              "Source\Editor",                           # simple string, sync at once
#              @{ Path = "Content"; BatchCount = 4 }      # split into 4 batches
#          ) }
#   )
$P4_WORKSPACES = @(
    # Add fallback P4 workspace configurations here only if ParallelP4Sync is unavailable.
)

#endregion ==================== CONFIGURATION ====================


#region ==================== HELPER FUNCTIONS ====================

function Write-LogInfo {
    <#
    .SYNOPSIS
        Writes an informational message in Cyan.
    #>
    param([string]$Message)
    Write-Host "[INFO]    $Message" -ForegroundColor Cyan
}

function Write-LogSuccess {
    <#
    .SYNOPSIS
        Writes a success message in Green.
    #>
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-LogWarning {
    <#
    .SYNOPSIS
        Writes a warning message in Yellow.
    #>
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-LogError {
    <#
    .SYNOPSIS
        Writes an error message in Red.
    #>
    param([string]$Message)
    Write-Host "[ERROR]   $Message" -ForegroundColor Red
}

function Write-ScriptHeader {
    <#
    .SYNOPSIS
        Displays the script header with timestamp and configured repo counts.
    #>
    param(
        [int]$SvnCount,
        [int]$P4Count
    )

    $totalCount = $SvnCount + $P4Count
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    Write-Host ""
    Write-Host "========================================================" -ForegroundColor White
    Write-Host "  Multi-Repo Updater" -ForegroundColor White
    Write-Host "  Started at: $timestamp" -ForegroundColor White
    Write-Host "  Configured repositories: $totalCount (SVN: $SvnCount, P4: $P4Count)" -ForegroundColor White
    Write-Host "========================================================" -ForegroundColor White
    Write-Host ""
}

function Write-SectionHeader {
    <#
    .SYNOPSIS
        Displays a section separator with a title.
    #>
    param([string]$Title)

    Write-Host ""
    Write-Host "--------------------------------------------------------" -ForegroundColor White
    Write-Host "  $Title" -ForegroundColor White
    Write-Host "--------------------------------------------------------" -ForegroundColor White
}

function Invoke-P4SyncWithProgress {
    <#
    .SYNOPSIS
        Runs p4 sync with real-time progress display.
    .DESCRIPTION
        Executes p4 sync and streams output line by line, showing a live
        progress counter so the user can see the sync is not stuck.
        Returns a hashtable with Output (full text), ExitCode, and FileCount.
    #>
    param(
        [string[]]$SyncPaths,
        [string]$DisplayLabel = ""
    )

    $result = @{
        Output    = ""
        ExitCode  = 0
        FileCount = 0
    }

    # Build the p4 sync command arguments
    $p4Args = @("sync")
    if ($SyncPaths -and $SyncPaths.Count -gt 0) {
        $p4Args += $SyncPaths
    }

    $allLines = @()
    $fileCount = 0
    $syncStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $lastProgressTime = [datetime]::Now

    try {
        # Start p4 process and read output line by line for real-time progress
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "p4"
        $psi.Arguments = ($p4Args | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } }) -join ' '
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true

        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $psi

        # Collect stderr asynchronously using MessageData to pass the StringBuilder
        # into the event scriptblock (avoids scope issues with Register-ObjectEvent)
        $stderrBuilder = New-Object System.Text.StringBuilder
        $stderrEvent = Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived -MessageData $stderrBuilder -Action {
            if ($EventArgs.Data) {
                $Event.MessageData.AppendLine($EventArgs.Data) | Out-Null
            }
        }

        $process.Start() | Out-Null
        $process.BeginErrorReadLine()

        # Read stdout line by line for real-time progress
        while ($null -ne ($line = $process.StandardOutput.ReadLine())) {
            $allLines += $line

            # Count synced files (lines like "//depot/path#rev - updating/added/deleted ...")
            if ($line -match '^//.*#\d+') {
                $fileCount++
            }

            # Update progress display periodically (every 0.5 seconds) to avoid flooding
            $now = [datetime]::Now
            if (($now - $lastProgressTime).TotalMilliseconds -ge 500) {
                $elapsed = $syncStopwatch.Elapsed.ToString('mm\:ss')
                # Show a truncated version of the current file being synced
                $shortLine = if ($line.Length -gt 80) { $line.Substring(0, 77) + "..." } else { $line }
                Write-Host "`r[PROGRESS] $DisplayLabel | Files: $fileCount | Elapsed: $elapsed | $shortLine" -ForegroundColor DarkGray -NoNewline
                $lastProgressTime = $now
            }
        }

        $process.WaitForExit()
        $result.ExitCode = $process.ExitCode

        # Clean up the progress line with enough spaces to overwrite
        Write-Host "`r$(' ' * 160)`r" -NoNewline

        # Final progress summary
        $elapsed = $syncStopwatch.Elapsed.ToString('mm\:ss')
        Write-LogInfo "  $DisplayLabel | Completed: $fileCount file(s) synced in $elapsed"

        # Combine stdout and stderr
        Unregister-Event -SourceIdentifier $stderrEvent.Name -ErrorAction SilentlyContinue
        $stderrText = $stderrBuilder.ToString()
        $stdoutText = $allLines -join "`n"

        if ($stderrText.Trim().Length -gt 0) {
            $result.Output = $stdoutText + "`n" + $stderrText
        } else {
            $result.Output = $stdoutText
        }
    }
    catch {
        Write-Host "`r$(' ' * 120)`r" -NoNewline
        $result.Output = "Exception during p4 sync: $($_.Exception.Message)"
        $result.ExitCode = 1
    }
    finally {
        $syncStopwatch.Stop()
        if ($stderrEvent) {
            Unregister-Event -SourceIdentifier $stderrEvent.Name -ErrorAction SilentlyContinue
        }
    }

    $result.FileCount = $fileCount
    return $result
}

function Split-IntoBatches {
    <#
    .SYNOPSIS
        Splits an array into N roughly equal batches.
    .DESCRIPTION
        Distributes items as evenly as possible across the specified number of batches.
        Returns an array of arrays (batches).
    #>
    param(
        [array]$Items,
        [int]$BatchCount
    )

    if ($BatchCount -le 0) { $BatchCount = 1 }
    if ($BatchCount -gt $Items.Count) { $BatchCount = $Items.Count }
    if ($Items.Count -eq 0) { return @() }

    $batches = @()
    $batchSize = [math]::Floor($Items.Count / $BatchCount)
    $remainder = $Items.Count % $BatchCount
    $index = 0

    for ($i = 0; $i -lt $BatchCount; $i++) {
        # Distribute remainder items one per batch to the first N batches
        $currentBatchSize = $batchSize
        if ($i -lt $remainder) { $currentBatchSize++ }

        $batch = @()
        for ($j = 0; $j -lt $currentBatchSize; $j++) {
            $batch += $Items[$index]
            $index++
        }
        $batches += ,($batch)
    }

    return $batches
}

function Get-P4MappedChildDirs {
    <#
    .SYNOPSIS
        Returns immediate depot-backed child directories under a local P4 root.
    .DESCRIPTION
        Uses "p4 dirs" instead of local directory enumeration so editor/cache-only
        folders such as .vs, Intermediate, and DerivedDataCache are not treated as
        update targets.
    #>
    param(
        [string]$RootPath,
        [string]$ClientName
    )

    $normalizedRoot = ($RootPath -replace '[\\/]+$', '')
    $p4Args = @()
    if ($ClientName -and $ClientName.Trim()) {
        $p4Args += @("-c", $ClientName.Trim())
    }
    $p4Args += @("dirs", "$normalizedRoot\*")

    $dirsOutput = & p4 @p4Args 2>&1
    $childDirs = @()

    foreach ($rawLine in @($dirsOutput)) {
        $line = ([string]$rawLine).Trim()
        if (-not $line) { continue }
        if ($line -match 'no such file\(s\)' -or $line -match 'not under client') { continue }

        if ($line -match '^//') {
            $line = $line -replace '/', '\'
        }

        $childName = Split-Path -Path $line -Leaf
        if ($childName) {
            $childDirs += $childName
        }
    }

    return @($childDirs | Sort-Object -Unique)
}

function Invoke-P4SyncTool {
    <#
    .SYNOPSIS
        Runs an external project P4 sync tool and streams its output.
    #>
    param(
        [hashtable]$Tool
    )

    $result = @{
        Output   = ""
        ExitCode = 0
        HasError = $false
    }

    $savedP4Client = $env:P4CLIENT
    $savedP4User = $env:P4USER
    $savedP4Port = $env:P4PORT
    $pushedLocation = $false
    $outputLines = @()

    try {
        if ($Tool.P4Client -and $Tool.P4Client.Trim()) {
            $env:P4CLIENT = $Tool.P4Client.Trim()
        }

        Push-Location -LiteralPath $Tool.RootPath
        $pushedLocation = $true

        Write-LogInfo "  Command: $($Tool.Command) $($Tool.Arguments -join ' ')"
        & $Tool.Command @($Tool.Arguments) 2>&1 | ForEach-Object {
            $line = [string]$_
            $outputLines += $line
            Write-Host $line
        }

        $result.ExitCode = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }
        $result.Output = $outputLines -join "`n"

        if ($result.ExitCode -ne 0 -or $result.Output -match '(?im)(Error executing|\[ERROR\]|Traceback|Command failed)') {
            $result.HasError = $true
        }
    }
    catch {
        $result.ExitCode = 1
        $result.HasError = $true
        $result.Output = ($outputLines + "Exception during P4 sync tool: $($_.Exception.Message)") -join "`n"
    }
    finally {
        if ($pushedLocation) {
            Pop-Location
        }
        $env:P4CLIENT = $savedP4Client
        $env:P4USER = $savedP4User
        $env:P4PORT = $savedP4Port
    }

    return $result
}

#endregion ==================== HELPER FUNCTIONS ====================


#region ==================== INITIALIZATION ====================

# Start the stopwatch for elapsed time tracking
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

# Results collections
$script:Results = @()

# Determine which repo types to update based on command-line switches
$script:SkipSvn = $false
$script:SkipP4  = $false
$script:ConflictAbortEnabled = $ConflictAbort.IsPresent

if ($SvnOnly -and $P4Only) {
    # Both specified — update everything (same as no flags)
    Write-LogInfo "Both -svn and -p4 specified, updating all repositories."
} elseif ($SvnOnly) {
    $script:SkipP4 = $true
    Write-LogInfo "Mode: SVN only (P4 sync will be skipped)"
} elseif ($P4Only) {
    $script:SkipSvn = $true
    Write-LogInfo "Mode: P4 only (SVN update will be skipped)"
}

if ($script:ConflictAbortEnabled) {
    Write-LogInfo "Conflict-abort mode enabled: will stop on first conflict."
}

Write-LogInfo "Update root: $UpdateRoot"
if ($P4Latest.IsPresent) {
    Write-LogInfo "P4 mode: ParallelP4Sync daily latest"
} else {
    Write-LogInfo "P4 mode: ParallelP4Sync daily"
}

# Display the script header
$configuredP4Count = $P4_SYNC_TOOLS.Count + $P4_WORKSPACES.Count
Write-ScriptHeader -SvnCount $SVN_REPOS.Count -P4Count $configuredP4Count

#endregion ==================== INITIALIZATION ====================


#region ==================== PREREQUISITE VALIDATION ====================

Write-SectionHeader "Validating Prerequisites"

# Check if svn command is available
$svnAvailable = $false
if (Get-Command "svn" -ErrorAction SilentlyContinue) {
    $svnAvailable = $true
    Write-LogSuccess "SVN command found in PATH."
} else {
    Write-LogError "SVN command not found in PATH. All SVN updates will be skipped."
}

# Check if p4 command is available
$p4Available = $false
if (Get-Command "p4" -ErrorAction SilentlyContinue) {
    $p4Available = $true
    Write-LogSuccess "P4 command found in PATH."

    # Apply P4 connection settings if configured
    if ($P4_PORT -and $P4_PORT.Trim().Length -gt 0) {
        $env:P4PORT = $P4_PORT.Trim()
        Write-LogInfo "P4PORT set to: $env:P4PORT"
    } elseif ($env:P4PORT) {
        Write-LogInfo "P4PORT using existing env: $env:P4PORT"
    } else {
        Write-LogWarning "P4PORT is not set. P4 commands may fail if not configured elsewhere."
    }

    if ($P4_USER -and $P4_USER.Trim().Length -gt 0) {
        $env:P4USER = $P4_USER.Trim()
        Write-LogInfo "P4USER set to: $env:P4USER"
    } elseif ($env:P4USER) {
        Write-LogInfo "P4USER using existing env: $env:P4USER"
    } else {
        Write-LogWarning "P4USER is not set. P4 commands may fail if not configured elsewhere."
    }
} else {
    Write-LogError "P4 command not found in PATH. All P4 syncs will be skipped."
}

# Validate SVN folder paths
$validSvnRepos = @()
if ($svnAvailable -and $SVN_REPOS.Count -gt 0) {
    foreach ($svnPath in $SVN_REPOS) {
        if (Test-Path -Path $svnPath -PathType Container) {
            $validSvnRepos += $svnPath
            Write-LogInfo "SVN path validated: $svnPath"
        } else {
            Write-LogWarning "SVN path does not exist, skipping: $svnPath"
        }
    }
} elseif ($svnAvailable) {
    Write-LogInfo "No SVN repositories configured."
}

# Validate external P4 sync tools
$validP4SyncTools = @()
$pythonAvailable = $false
if (Get-Command "python" -ErrorAction SilentlyContinue) {
    $pythonAvailable = $true
    Write-LogSuccess "Python command found in PATH."
} else {
    Write-LogError "Python command not found in PATH. ParallelP4Sync will be skipped."
}

if ($p4Available -and $pythonAvailable -and $P4_SYNC_TOOLS.Count -gt 0) {
    foreach ($p4Tool in $P4_SYNC_TOOLS) {
        if (-not (Test-Path -Path $p4Tool.RootPath -PathType Container)) {
            Write-LogWarning "P4 sync tool root does not exist, skipping: $($p4Tool.Name) -> $($p4Tool.RootPath)"
            continue
        }

        $mainScript = Join-Path -Path $p4Tool.RootPath -ChildPath "main.py"
        if (-not (Test-Path -Path $mainScript -PathType Leaf)) {
            Write-LogWarning "P4 sync tool main.py does not exist, skipping: $mainScript"
            continue
        }

        $validP4SyncTools += $p4Tool
        Write-LogInfo "P4 sync tool validated: $($p4Tool.Name) -> $($p4Tool.RootPath)"
    }
} elseif ($p4Available -and $P4_SYNC_TOOLS.Count -gt 0) {
    Write-LogWarning "P4 sync tools configured but prerequisites are missing."
}

# Validate P4 workspace root paths and sub-directories
$validP4Workspaces = @()
if ($p4Available -and $P4_WORKSPACES.Count -gt 0) {
    foreach ($p4ws in $P4_WORKSPACES) {
        if (-not (Test-Path -Path $p4ws.RootPath -PathType Container)) {
            Write-LogWarning "P4 workspace root does not exist, skipping: $($p4ws.P4Client) -> $($p4ws.RootPath)"
            continue
        }

        # Validate sub-directories if specified
        # Normalize SubDirs entries: each becomes @{ Path = "..."; BatchCount = N }
        $enumerateSubDirs = $p4ws.ContainsKey('EnumerateSubDirs') -and [bool]$p4ws.EnumerateSubDirs
        $hasSubDirs = $p4ws.ContainsKey('SubDirs') -and $p4ws.SubDirs -and $p4ws.SubDirs.Count -gt 0
        if ($enumerateSubDirs) {
            $childDirNames = Get-P4MappedChildDirs -RootPath $p4ws.RootPath -ClientName $p4ws.P4Client
            if (-not $childDirNames -or $childDirNames.Count -eq 0) {
                Write-LogWarning "P4 workspace has no mapped child directories, skipping: $($p4ws.P4Client) -> $($p4ws.RootPath)"
                continue
            }

            $validSubDirs = @()
            foreach ($childName in $childDirNames) {
                $validSubDirs += @{ Path = $childName; BatchCount = 1 }
                Write-LogInfo "  P4 mapped child directory discovered: $childName"
            }

            $p4ws.ValidSubDirs = $validSubDirs
            Write-LogInfo "P4 workspace validated: $($p4ws.P4Client) -> $($p4ws.RootPath) (Enumerated SubDirs: $($validSubDirs.Count))"
        } elseif ($hasSubDirs) {
            $validSubDirs = @()
            foreach ($subDirEntry in $p4ws.SubDirs) {
                # Normalize entry to hashtable format
                if ($subDirEntry -is [hashtable]) {
                    $subDirPath = $subDirEntry.Path
                    $batchCount = if ($subDirEntry.ContainsKey('BatchCount')) { [int]$subDirEntry.BatchCount } else { 1 }
                } else {
                    # Simple string entry
                    $subDirPath = [string]$subDirEntry
                    $batchCount = 1
                }

                if ($batchCount -lt 1) { $batchCount = 1 }

                $fullSubPath = Join-Path -Path $p4ws.RootPath -ChildPath $subDirPath
                if (Test-Path -Path $fullSubPath -PathType Container) {
                    $normalizedEntry = @{ Path = $subDirPath; BatchCount = $batchCount }
                    $validSubDirs += $normalizedEntry
                    if ($batchCount -gt 1) {
                        Write-LogInfo "  P4 sub-directory validated: $subDirPath (batched sync: $batchCount batches)"
                    } else {
                        Write-LogInfo "  P4 sub-directory validated: $subDirPath"
                    }
                } else {
                    Write-LogWarning "  P4 sub-directory does not exist, skipping: $subDirPath ($fullSubPath)"
                }
            }
            if ($validSubDirs.Count -eq 0) {
                Write-LogWarning "P4 workspace has no valid sub-directories, skipping: $($p4ws.P4Client)"
                continue
            }
            # Store validated sub-dirs back
            $p4ws.ValidSubDirs = $validSubDirs
            Write-LogInfo "P4 workspace validated: $($p4ws.P4Client) -> $($p4ws.RootPath) (SubDirs: $($validSubDirs.Count))"
        } else {
            $p4ws.ValidSubDirs = @()
            Write-LogInfo "P4 workspace validated: $($p4ws.P4Client) -> $($p4ws.RootPath) (entire workspace)"
        }

        $validP4Workspaces += $p4ws
    }
} elseif ($p4Available) {
    Write-LogInfo "No P4 workspaces configured."
}

# Check if there is anything to do
$totalValid = $validSvnRepos.Count + $validP4SyncTools.Count + $validP4Workspaces.Count
if ($totalValid -eq 0) {
    Write-Host ""
    Write-LogWarning "No valid repositories to update. Nothing to do."
    Write-Host ""
    $stopwatch.Stop()
    Write-Host "Total elapsed time: $($stopwatch.Elapsed.ToString('hh\:mm\:ss'))" -ForegroundColor White
    exit 0
}

Write-LogInfo "Validated $totalValid repositories ready for update (SVN: $($validSvnRepos.Count), P4 tools: $($validP4SyncTools.Count), P4 fallback workspaces: $($validP4Workspaces.Count))."

#endregion ==================== PREREQUISITE VALIDATION ====================


#region ==================== SVN UPDATE ====================

if ($script:SkipSvn) {
    Write-SectionHeader "Updating SVN Repositories"
    Write-LogInfo "SVN update skipped (running in P4-only mode)."
} elseif ($validSvnRepos.Count -gt 0) {
    Write-SectionHeader "Updating SVN Repositories"

    $svnIndex = 0
    $svnTotal = $validSvnRepos.Count

    foreach ($svnPath in $validSvnRepos) {
        $svnIndex++
        $repoName = Split-Path -Path $svnPath -Leaf
        Write-LogInfo "[$svnIndex/$svnTotal] Updating SVN: $svnPath ..."

        $resultEntry = @{
            Type       = "SVN"
            Name       = $repoName
            Path       = $svnPath
            Status     = "Unknown"
            Conflicts  = @()
            ErrorMsg   = ""
        }

        try {
            # Run svn update and capture output
            # Uses cached authentication (no credentials in script)
            $svnOutput = & svn update "$svnPath" 2>&1 | Out-String
            $svnExitCode = $LASTEXITCODE

            if ($svnExitCode -ne 0) {
                $resultEntry.Status = "Failed"
                $resultEntry.ErrorMsg = $svnOutput.Trim()
                Write-LogError "[$svnIndex/$svnTotal] SVN update failed for: $svnPath"
                Write-LogError "  Exit code: $svnExitCode"
                Write-LogError "  Output: $($svnOutput.Trim())"
            } else {
                # Parse output for conflicts (lines starting with 'C ' indicate conflicts)
                $conflicts = @()
                $lines = $svnOutput -split "`n"
                foreach ($line in $lines) {
                    $trimmedLine = $line.Trim()
                    # SVN conflict markers: lines starting with 'C ' or 'C  ' (tree conflicts)
                    if ($trimmedLine -match "^C\s+(.+)$") {
                        $conflictFile = $Matches[1].Trim()
                        $conflicts += $conflictFile
                    }
                }

                # Also check for "Summary of conflicts" to confirm conflict detection
                $resultEntry.Conflicts = $conflicts

                if ($conflicts.Count -gt 0) {
                    $resultEntry.Status = "Conflicts"
                    Write-LogWarning "[$svnIndex/$svnTotal] SVN update completed with $($conflicts.Count) conflict(s): $svnPath"
                    foreach ($cf in $conflicts) {
                        Write-LogWarning "  Conflict: $cf"
                    }
                } else {
                    $resultEntry.Status = "Success"
                    # Extract revision number from output
                    $revMatch = [regex]::Match($svnOutput, "(?:Updated to|At) revision (\d+)")
                    $revInfo = if ($revMatch.Success) { " (Revision: $($revMatch.Groups[1].Value))" } else { "" }
                    Write-LogSuccess "[$svnIndex/$svnTotal] SVN update succeeded: $svnPath$revInfo"
                }
            }
        }
        catch {
            $resultEntry.Status = "Failed"
            $resultEntry.ErrorMsg = $_.Exception.Message
            Write-LogError "[$svnIndex/$svnTotal] SVN update exception for: $svnPath"
            Write-LogError "  Error: $($_.Exception.Message)"
        }

        $script:Results += $resultEntry

        # Abort on conflict if --conflict-abort is enabled
        if ($script:ConflictAbortEnabled -and $resultEntry.Status -eq "Conflicts") {
            Write-LogWarning "Conflict-abort: Stopping further updates due to conflicts in $svnPath"
            break
        }
    }
}

#endregion ==================== SVN UPDATE ====================


#region ==================== P4 SYNC ====================

# Check if we should skip P4 entirely (P4-only skip or conflict-abort triggered during SVN)
$script:ConflictAborted = $script:ConflictAbortEnabled -and ($script:Results | Where-Object { $_.Status -eq "Conflicts" }).Count -gt 0

if ($script:SkipP4) {
    Write-SectionHeader "Syncing Perforce Workspaces"
    Write-LogInfo "P4 sync skipped (running in SVN-only mode)."
} elseif ($script:ConflictAborted) {
    Write-SectionHeader "Syncing Perforce Workspaces"
    Write-LogWarning "P4 sync skipped due to --conflict-abort (conflicts detected in SVN phase)."
} elseif ($validP4Workspaces.Count -gt 0) {
    Write-SectionHeader "Syncing Perforce Workspaces"

    $p4Index = 0
    $p4Total = $validP4Workspaces.Count

    foreach ($p4ws in $validP4Workspaces) {
        $p4Index++
        $clientName = $p4ws.P4Client
        $rootPath   = $p4ws.RootPath
        $hasSubDirs = $p4ws.ValidSubDirs -and $p4ws.ValidSubDirs.Count -gt 0

        if ($hasSubDirs) {
            $syncLabel = "$clientName ($($p4ws.ValidSubDirs.Count) sub-dirs)"
        } else {
            $syncLabel = "$clientName ($rootPath)"
        }
        Write-LogInfo "[$p4Index/$p4Total] Syncing P4: $syncLabel ..."

        $resultEntry = @{
            Type       = "P4"
            Name       = $clientName
            Path       = $rootPath
            Status     = "Unknown"
            Conflicts  = @()
            ErrorMsg   = ""
        }

        try {
            # Set P4CLIENT environment variable for this workspace
            $env:P4CLIENT = $clientName

            # Build the list of sync targets
            # If SubDirs are specified, sync each sub-directory; otherwise sync entire workspace
            # For sub-dirs with BatchCount > 1, enumerate child directories and split into batches
            $syncTargets = @()  # Each element: @{ Target = "path\..."; Label = "display label" }
            if ($hasSubDirs) {
                foreach ($subDirInfo in $p4ws.ValidSubDirs) {
                    $subDirPath = $subDirInfo.Path
                    $batchCount = $subDirInfo.BatchCount
                    $fullSubPath = Join-Path -Path $rootPath -ChildPath $subDirPath

                    if ($batchCount -gt 1) {
                        # Enumerate immediate child directories for batched sync
                        $childDirs = Get-ChildItem -Path $fullSubPath -Directory -ErrorAction SilentlyContinue
                        if ($childDirs -and $childDirs.Count -gt 0) {
                            $childDirNames = @($childDirs | ForEach-Object { $_.Name })
                            $actualBatchCount = [math]::Min($batchCount, $childDirNames.Count)
                            Write-LogInfo "  Sub-directory '$subDirPath' has $($childDirNames.Count) child dirs, splitting into $actualBatchCount batch(es)"

                            $batches = Split-IntoBatches -Items $childDirNames -BatchCount $actualBatchCount
                            $batchIdx = 0
                            foreach ($batch in $batches) {
                                $batchIdx++
                                foreach ($childName in $batch) {
                                    $childFullPath = Join-Path -Path $fullSubPath -ChildPath $childName
                                    $syncTargets += @{ Target = "$childFullPath\..."; Label = "$subDirPath\$childName (batch $batchIdx/$actualBatchCount)"; BatchGroup = "${subDirPath}_batch_$batchIdx" }
                                }
                            }

                            # Also sync files directly under the sub-directory (not in child dirs)
                            $syncTargets += @{ Target = "$fullSubPath\*"; Label = "$subDirPath (root files)"; BatchGroup = "${subDirPath}_rootfiles" }
                        } else {
                            # No child directories found, sync the whole sub-directory
                            Write-LogWarning "  Sub-directory '$subDirPath' has no child directories, syncing entirely"
                            $syncTargets += @{ Target = "$fullSubPath\..."; Label = $subDirPath; BatchGroup = $null }
                        }
                    } else {
                        # Normal sync: entire sub-directory at once
                        $syncTargets += @{ Target = "$fullSubPath\..."; Label = $subDirPath; BatchGroup = $null }
                    }
                }
            } else {
                $syncTargets += @{ Target = $null; Label = "entire workspace"; BatchGroup = $null }
            }

            $allP4Output = ""
            $syncFailed = $false

            # Group sync targets by BatchGroup so we can sync each batch in one p4 sync call
            $currentBatchGroup = $null
            $batchTargetPaths = @()

            # Add a sentinel to flush the last batch
            $syncTargets += @{ Target = "__SENTINEL__"; Label = ""; BatchGroup = "__SENTINEL__" }

            foreach ($syncEntry in $syncTargets) {
                $syncTarget = $syncEntry.Target
                $syncLabel2 = $syncEntry.Label
                $batchGroup = $syncEntry.BatchGroup

                # If we have a batch group, accumulate targets and sync them together
                if ($batchGroup -and $batchGroup -ne "__SENTINEL__" -and $currentBatchGroup -eq $batchGroup) {
                    $batchTargetPaths += $syncTarget
                    continue
                }

                # Flush previous batch if any
                if ($batchTargetPaths.Count -gt 0) {
                    Write-LogInfo "  Syncing batch '$currentBatchGroup' ($($batchTargetPaths.Count) paths)..."
                    $syncResult = Invoke-P4SyncWithProgress -SyncPaths $batchTargetPaths -DisplayLabel "Batch '$currentBatchGroup'"
                    $p4Output = $syncResult.Output
                    $p4ExitCode = $syncResult.ExitCode
                    $allP4Output += $p4Output

                    if ($p4ExitCode -ne 0) {
                        if ($p4Output -match "file\(s\) up-to-date") {
                            Write-LogSuccess "  Batch '$currentBatchGroup' already up-to-date"
                        } else {
                            $syncFailed = $true
                            $resultEntry.ErrorMsg += $p4Output.Trim() + "`n"
                            Write-LogError "  P4 sync failed for batch: $currentBatchGroup"
                            Write-LogError "  Exit code: $p4ExitCode"
                            Write-LogError "  Output: $($p4Output.Trim())"
                        }
                    } else {
                        Write-LogSuccess "  Batch '$currentBatchGroup' synced successfully"
                    }
                    $batchTargetPaths = @()
                }

                # Sentinel: stop processing
                if ($syncTarget -eq "__SENTINEL__") { break }

                # Start new batch group or sync individual target
                if ($batchGroup) {
                    $currentBatchGroup = $batchGroup
                    $batchTargetPaths = @($syncTarget)
                } else {
                    # Individual sync (no batch group)
                    if ($syncTarget) {
                        Write-LogInfo "  Syncing: $syncLabel2"
                        $syncResult = Invoke-P4SyncWithProgress -SyncPaths @($syncTarget) -DisplayLabel $syncLabel2
                    } else {
                        $syncResult = Invoke-P4SyncWithProgress -SyncPaths @() -DisplayLabel "$clientName (entire workspace)"
                    }
                    $p4Output = $syncResult.Output
                    $p4ExitCode = $syncResult.ExitCode
                    $allP4Output += $p4Output

                    if ($p4ExitCode -ne 0) {
                        if ($p4Output -match "file\(s\) up-to-date") {
                            Write-LogSuccess "  Already up-to-date: $syncLabel2"
                        } else {
                            $syncFailed = $true
                            $resultEntry.ErrorMsg += $p4Output.Trim() + "`n"
                            Write-LogError "  P4 sync failed: $syncLabel2"
                            Write-LogError "  Exit code: $p4ExitCode"
                            Write-LogError "  Output: $($p4Output.Trim())"
                        }
                    } else {
                        Write-LogSuccess "  Synced: $syncLabel2"
                    }
                }
            }

            if ($syncFailed) {
                $resultEntry.Status = "Failed"
                Write-LogError "[$p4Index/$p4Total] P4 sync failed for: $clientName"
            } else {
                $resultEntry.Status = "Success"
                Write-LogSuccess "[$p4Index/$p4Total] P4 sync succeeded: $syncLabel"
            }

            # Check for unresolved files (conflicts) using p4 resolve -n
            if ($resultEntry.Status -ne "Failed") {
                # If sub-dirs specified, check resolve per sub-dir; otherwise check entire workspace
                # Use a separate process to avoid PowerShell treating stderr as ErrorRecord
                $allResolveOutput = ""
                $savedEAP = $ErrorActionPreference
                $ErrorActionPreference = "SilentlyContinue"

                if ($hasSubDirs) {
                    foreach ($subDirInfo in $p4ws.ValidSubDirs) {
                        $fullSubPath = Join-Path -Path $rootPath -ChildPath $subDirInfo.Path
                        $resolveTarget = "$fullSubPath\..."
                        # Run p4 resolve -n via cmd to cleanly capture stdout only
                        $resolveOutput = & cmd /c "p4 resolve -n `"$resolveTarget`" 2>nul"
                        if ($resolveOutput) {
                            $allResolveOutput += ($resolveOutput | Out-String)
                        }
                    }
                } else {
                    $resolveOutput = & cmd /c "p4 resolve -n 2>nul"
                    if ($resolveOutput) {
                        $allResolveOutput = $resolveOutput | Out-String
                    }
                }

                $ErrorActionPreference = $savedEAP

                $conflicts = @()
                if ($allResolveOutput -and $allResolveOutput.Trim().Length -gt 0) {
                    # Parse resolve output for conflict file paths
                    $resolveLines = $allResolveOutput -split "`n"
                    foreach ($line in $resolveLines) {
                        $trimmedLine = $line.Trim()
                        if ($trimmedLine.Length -gt 0 -and $trimmedLine -notmatch "^$" -and $trimmedLine -notmatch "no file\(s\) to resolve") {
                            # p4 resolve -n output format: <depotFile> - merging/resolving ...
                            if ($trimmedLine -match "^(.+?)\s+-\s+") {
                                $conflicts += $Matches[1].Trim()
                            } else {
                                $conflicts += $trimmedLine
                            }
                        }
                    }
                }

                if ($conflicts.Count -gt 0) {
                    $resultEntry.Status = "Conflicts"
                    $resultEntry.Conflicts = $conflicts
                    Write-LogWarning "[$p4Index/$p4Total] P4 workspace has $($conflicts.Count) unresolved file(s): $clientName"
                    foreach ($cf in $conflicts) {
                        Write-LogWarning "  Unresolved: $cf"
                    }
                }
            }
        }
        catch {
            $resultEntry.Status = "Failed"
            $resultEntry.ErrorMsg = $_.Exception.Message
            Write-LogError "[$p4Index/$p4Total] P4 sync exception for: $clientName"
            Write-LogError "  Error: $($_.Exception.Message)"
        }

        $script:Results += $resultEntry

        # Abort on conflict if --conflict-abort is enabled
        if ($script:ConflictAbortEnabled -and $resultEntry.Status -eq "Conflicts") {
            Write-LogWarning "Conflict-abort: Stopping further updates due to conflicts in $clientName"
            break
        }
    }
}

#endregion ==================== P4 SYNC ====================


#region ==================== CONFLICT REPORT & SUMMARY ====================

# Stop the stopwatch
$stopwatch.Stop()

Write-SectionHeader "Conflict Report"

# Collect all entries with conflicts
$conflictEntries = $script:Results | Where-Object { $_.Conflicts.Count -gt 0 }
$totalConflicts = ($conflictEntries | ForEach-Object { $_.Conflicts.Count } | Measure-Object -Sum).Sum
if (-not $totalConflicts) { $totalConflicts = 0 }

if ($conflictEntries.Count -gt 0) {
    Write-LogWarning "Conflicts detected in $($conflictEntries.Count) repository/workspace(s):"
    Write-Host ""

    foreach ($entry in $conflictEntries) {
        $label = "[$($entry.Type)] $($entry.Name)"
        Write-Host "  $label" -ForegroundColor Yellow
        foreach ($cf in $entry.Conflicts) {
            Write-Host "    - $cf" -ForegroundColor Red
        }
        Write-Host ""
    }
} else {
    Write-LogSuccess "No conflicts found across all repositories. Everything is clean!"
}

# Final summary
Write-SectionHeader "Summary"

$totalProcessed = $script:Results.Count
$totalSucceeded = ($script:Results | Where-Object { $_.Status -eq "Success" }).Count
$totalFailed    = ($script:Results | Where-Object { $_.Status -eq "Failed" }).Count
$totalWithConflicts = ($script:Results | Where-Object { $_.Status -eq "Conflicts" }).Count

Write-Host ""
Write-Host "  Total repositories processed : $totalProcessed" -ForegroundColor White
Write-Host "  Succeeded                    : " -ForegroundColor White -NoNewline
Write-Host "$totalSucceeded" -ForegroundColor Green
Write-Host "  Failed                       : " -ForegroundColor White -NoNewline
if ($totalFailed -gt 0) { Write-Host "$totalFailed" -ForegroundColor Red } else { Write-Host "$totalFailed" -ForegroundColor Green }
Write-Host "  With conflicts               : " -ForegroundColor White -NoNewline
if ($totalWithConflicts -gt 0) { Write-Host "$totalWithConflicts" -ForegroundColor Yellow } else { Write-Host "$totalWithConflicts" -ForegroundColor Green }
Write-Host "  Total conflicted files       : " -ForegroundColor White -NoNewline
if ($totalConflicts -gt 0) { Write-Host "$totalConflicts" -ForegroundColor Yellow } else { Write-Host "$totalConflicts" -ForegroundColor Green }
Write-Host ""
Write-Host "  Total elapsed time: $($stopwatch.Elapsed.ToString('hh\:mm\:ss'))" -ForegroundColor White
Write-Host ""
Write-Host "========================================================" -ForegroundColor White
Write-Host "  Multi-Repo Updater - Complete" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor White
Write-Host ""

#endregion ==================== CONFLICT REPORT & SUMMARY ====================
