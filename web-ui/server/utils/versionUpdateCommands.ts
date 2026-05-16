import * as fs from 'fs'
import * as path from 'path'
import type { CommandStep, JobPlan } from './androidSoCommands'

export interface BuildVersionUpdateInfo {
  mergedP4Head: string
  mergedSvnHead: string
  p4Merge: string[]
  svnMerge: string[]
}

export interface UpdateCodeAssetsPayload {
  projectRoot: string
  versionUpdateText: string
  svnUpdatePath?: string
  p4SyncPaths?: string[]
  p4Parallel?: boolean
}

const SAFE_P4_CHILD_DIR_EXCLUDES = new Set(['.git', '.svn', 'Binaries', 'DerivedDataCache', 'Intermediate', 'Saved'])

const quoteArg = (value: string) => {
  if (value.length === 0) return '""'
  return /[\s"&|<>^]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

const renderCommand = (cmd: string, args: string[], cwd?: string) => {
  const commandLine = [quoteArg(cmd), ...args.map(quoteArg)].join(' ')
  return cwd ? `(cwd=${cwd}) ${commandLine}` : commandLine
}

const quotePowerShell = (value: string) => `'${String(value).replace(/'/g, "''")}'`

const addValidation = (errors: string[], condition: boolean, message: string) => {
  if (!condition) {
    errors.push(message)
  }
}

const extractBuildVersionNumber = (text: string, label: string) => {
  const match = text.match(new RegExp(`${label}\\s*[:：]\\s*(\\d+)`, 'i'))
  return match?.[1] || ''
}

const extractBuildVersionList = (text: string, label: string) => {
  const match = text.match(new RegExp(`${label}\\s*[:：]\\s*([\\d\\s\\-－–—]+)`, 'i'))
  return (match?.[1] || '')
    .split(/[\s\-－–—]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export const parseBuildVersionUpdateText = (text: string): BuildVersionUpdateInfo => {
  const normalized = String(text || '').replace(/[，,]/g, ' ')
  return {
    mergedP4Head: extractBuildVersionNumber(normalized, 'MergedP4Head'),
    mergedSvnHead: extractBuildVersionNumber(normalized, 'MergedSvnHead'),
    p4Merge: extractBuildVersionList(normalized, 'P4Merge'),
    svnMerge: extractBuildVersionList(normalized, 'SVNMerge'),
  }
}

const normalizeP4SyncPaths = (projectDir: string, projectRoot: string, requestedPaths?: string[]) => {
  const explicitPaths = (requestedPaths || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => path.isAbsolute(item) ? item : path.join(projectRoot || '', item))

  if (explicitPaths.length > 0) {
    return [...new Set(explicitPaths.map((item) => path.normalize(item)))]
  }

  if (!fs.existsSync(projectDir)) {
    return []
  }

  // P4 不能直接同步 Survive 外层目录；默认拆成一层子目录，并避开构建产物和版本控制目录。
  const childDirs = fs.readdirSync(projectDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !SAFE_P4_CHILD_DIR_EXCLUDES.has(entry.name))
    .map((entry) => path.join(projectDir, entry.name))

  return [...new Set(childDirs)]
}

const buildP4VersionSyncScript = (
  versionInfo: BuildVersionUpdateInfo,
  p4SyncPaths: string[],
  useParallel: boolean,
) => {
  const targetList = p4SyncPaths.map(quotePowerShell).join(', ')
  const changeList = versionInfo.p4Merge.map(quotePowerShell).join(', ')
  const lines = [
    '$ErrorActionPreference = "Stop"',
    '$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
    `$targets = @(${targetList})`,
    `$singleChanges = @(${changeList})`,
    `$useParallel = ${useParallel ? '$true' : '$false'}`,
    'function Invoke-P4SyncMany([string[]] $Specs, [string] $Label) {',
    '  if (-not $Specs -or $Specs.Count -eq 0) { return }',
    '  Write-Host "[version] P4 $Label: $($Specs.Count) target(s)"',
    '  if (-not $useParallel -or $Specs.Count -eq 1) {',
    '    foreach ($spec in $Specs) {',
    '      Write-Host "[version] p4 sync $spec"',
    '      & p4 sync $spec',
    '      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
    '    }',
    '    return',
    '  }',
    '  $jobs = foreach ($spec in $Specs) {',
    '    Start-Job -ScriptBlock {',
    '      param([string] $syncSpec)',
    '      & p4 sync $syncSpec',
    '      if ($LASTEXITCODE -ne 0) { throw "p4 sync failed with exitCode=$LASTEXITCODE: $syncSpec" }',
    '    } -ArgumentList $spec',
    '  }',
    '  $jobs | Wait-Job | Out-Null',
    '  $failed = $false',
    '  foreach ($job in $jobs) {',
    '    Receive-Job $job',
    '    if ($job.State -ne "Completed") {',
    '      $failed = $true',
    '      Write-Error "[version] P4 sync job failed: $($job.Name)"',
    '    }',
    '  }',
    '  $jobs | Remove-Job',
    '  if ($failed) { exit 1 }',
    '}',
  ]

  if (versionInfo.mergedP4Head) {
    lines.push(
      `$baseSpecs = $targets | ForEach-Object { "$_\...@${versionInfo.mergedP4Head}" }`,
      `Invoke-P4SyncMany $baseSpecs "base @${versionInfo.mergedP4Head}"`,
    )
  }

  lines.push(
    'foreach ($change in $singleChanges) {',
    '  $changeSpecs = $targets | ForEach-Object { "$_\...@=$change" }',
    '  Invoke-P4SyncMany $changeSpecs "change @$change"',
    '}',
  )

  return lines.join('; ')
}

const buildSvnVersionSyncScript = (versionInfo: BuildVersionUpdateInfo, svnUpdatePath: string) => {
  const lines = [
    '$ErrorActionPreference = "Stop"',
    '$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
    `$svnPath = ${quotePowerShell(svnUpdatePath)}`,
    '$svnUrl = (& svn info --show-item url $svnPath)',
    'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
  ]

  if (versionInfo.mergedSvnHead) {
    lines.push(
      `Write-Host "[version] SVN update $svnPath to r${versionInfo.mergedSvnHead}"`,
      `& svn update -r ${versionInfo.mergedSvnHead} $svnPath --non-interactive`,
      'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
    )
  }

  for (const revision of versionInfo.svnMerge) {
    lines.push(
      `Write-Host "[version] SVN merge -c ${revision} from $svnUrl"`,
      `& svn merge -c ${revision} $svnUrl $svnPath --non-interactive --accept postpone`,
      'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }',
    )
  }

  return lines.join('; ')
}

export const buildUpdateCodeAssetsPlan = (payload: UpdateCodeAssetsPayload): JobPlan => {
  const errors: string[] = []
  const warnings: string[] = []
  const projectRoot = payload.projectRoot || ''
  const projectDir = (payload.svnUpdatePath || '').trim() || path.join(projectRoot, 'Survive')
  const versionInfo = parseBuildVersionUpdateText(payload.versionUpdateText || '')
  const hasAssetVersions = !!(versionInfo.mergedP4Head || versionInfo.p4Merge.length)
  const hasSvnVersions = !!(versionInfo.mergedSvnHead || versionInfo.svnMerge.length)
  const p4SyncPaths = normalizeP4SyncPaths(projectDir, projectRoot, payload.p4SyncPaths)
  const steps: CommandStep[] = []

  addValidation(errors, process.platform === 'win32', 'Only Windows is supported for this flow.')
  addValidation(errors, fs.existsSync(projectRoot), `projectRoot not found: ${projectRoot}`)
  addValidation(errors, fs.existsSync(projectDir), `SVN update path not found: ${projectDir}`)
  addValidation(errors, hasAssetVersions || hasSvnVersions, 'Version update text did not contain MergedP4Head/MergedSvnHead/P4Merge/SVNMerge.')

  if (hasAssetVersions) {
    addValidation(errors, p4SyncPaths.length > 0, 'No safe P4 sync paths found. Configure p4SyncPaths instead of syncing the outer project directory.')
    for (const p4Path of p4SyncPaths) {
      addValidation(errors, fs.existsSync(p4Path), `P4 sync path not found: ${p4Path}`)
    }
  }

  steps.push({
    name: 'Update Assets (P4)',
    cmd: 'powershell.exe',
    args: hasAssetVersions
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', buildP4VersionSyncScript(versionInfo, p4SyncPaths, payload.p4Parallel !== false)]
      : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Write-Host "[version] No P4 asset revisions found; skipping."'],
    cwd: projectRoot,
  })

  steps.push({
    name: 'Update SVN',
    cmd: 'powershell.exe',
    args: hasSvnVersions
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', buildSvnVersionSyncScript(versionInfo, projectDir)]
      : ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Write-Host "[version] No SVN revisions found; skipping."'],
    cwd: projectDir,
  })

  warnings.push(`Parsed version text: P4@${versionInfo.mergedP4Head || '-'}, SVN@${versionInfo.mergedSvnHead || '-'}, P4Merge=${versionInfo.p4Merge.join(',') || '-'}, SVNMerge=${versionInfo.svnMerge.join(',') || '-'}`)
  if (hasAssetVersions) {
    warnings.push(`P4 safe sync paths: ${p4SyncPaths.join('; ')}`)
  }

  return {
    steps,
    cleanupSteps: [],
    outputSoCandidates: [],
    preview: steps.map((step) => renderCommand(step.cmd, step.args, step.cwd)).join('\n'),
    validationErrors: errors,
    warnings,
    outputs: {
      mergedP4Head: versionInfo.mergedP4Head,
      mergedSvnHead: versionInfo.mergedSvnHead,
    },
  }
}
