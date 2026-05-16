import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawnSync } from 'child_process'

export type AndroidArch = 'arm64-v8a' | 'armeabi-v7a' | 'x86_64'
export type BuildConfig = 'Development' | 'Test' | 'Shipping'
export type AndroidSoJobType = 'buildSo' | 'rebuildSo' | 'replaceA' | 'injectB' | 'pushSo'

export interface BuildSoPayload {
  projectRoot: string
  projectFile: string
  engineRoot: string
  defaultEngineIniPath?: string
  config: BuildConfig
  arch: AndroidArch
  logPath?: string
  maxParallelActions?: number
  versionUpdateEnabled?: boolean
  versionUpdateText?: string
  svnUpdatePath?: string
  p4SyncPaths?: string[]
  p4Parallel?: boolean
}

export interface ReplaceAPayload {
  apkPath: string
  soPath: string
  arch: AndroidArch
  ueAppToolsExe: string
  showInstallHint?: boolean
}

export interface InjectBPayload {
  packageName: string
  androidInjectDir: string
  soPath: string
  launchActivity: string
}

export interface PushSoPayload {
  soPath: string
  remotePath: string
  packageName?: string
  useRunAs?: boolean
  launchAfterPush?: boolean
}

export type AndroidSoPayload = BuildSoPayload | ReplaceAPayload | InjectBPayload | PushSoPayload

export interface CommandStep {
  name: string
  cmd: string
  args: string[]
  cwd?: string
  internalAction?: {
    type: 'updateDefaultEngineIni'
    defaultEngineIniPath: string
    arch: AndroidArch
  }
}

export interface JobPlan {
  steps: CommandStep[]
  cleanupSteps?: CommandStep[]
  outputSoCandidates?: string[]
  preview: string
  validationErrors: string[]
  warnings: string[]
  outputs: Record<string, string>
}

export interface BuildVersionUpdateInfo {
  mergedP4Head: string
  mergedSvnHead: string
  p4Merge: string[]
  svnMerge: string[]
}

const VALID_ARCHES = new Set<AndroidArch>(['arm64-v8a', 'armeabi-v7a', 'x86_64'])
const VALID_CONFIGS = new Set<BuildConfig>(['Development', 'Test', 'Shipping'])
const REPLACE_MANAGER_DIR = 'I:\\cgtools\\ReplaceManager\\RevertTool'
const REPLACE_MANAGER_SOURCE_DIR = path.dirname(REPLACE_MANAGER_DIR)
const REPLACE_MANAGER_TOOL_PY = path.join(REPLACE_MANAGER_DIR, 'ReplaceManagerTool.py')
const REPLACE_MANAGER_CONFIG_JSON = path.join(REPLACE_MANAGER_SOURCE_DIR, 'ReplaceConfig.json')
const ANDROID_RUNTIME_SETTINGS_SECTION = '[/Script/AndroidRuntimeSettings.AndroidRuntimeSettings]'
const SAFE_P4_CHILD_DIR_EXCLUDES = new Set(['.git', '.svn', 'Binaries', 'DerivedDataCache', 'Intermediate', 'Saved'])

const quoteArg = (value: string) => {
  if (value.length === 0) return '""'
  return /[\s"&|<>^]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

const renderCommand = (cmd: string, args: string[], cwd?: string) => {
  const commandLine = [quoteArg(cmd), ...args.map(quoteArg)].join(' ')
  if (!cwd) {
    return commandLine
  }
  return `(cwd=${cwd}) ${commandLine}`
}

const quotePowerShell = (value: string) => `'${String(value).replace(/'/g, "''")}'`

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

export const getDefaultEngineIniAndroidAbiSettings = (arch: AndroidArch) => ({
  bBuildForArmV7: arch === 'armeabi-v7a' ? 'True' : 'False',
  bBuildForArm64: arch === 'arm64-v8a' ? 'True' : 'False',
  bBuildForX86: 'False',
  bBuildForX8664: arch === 'x86_64' ? 'True' : 'False',
})

const buildDefaultEngineIniPreviewCommand = (defaultEngineIniPath: string, arch: AndroidArch) => {
  const values = getDefaultEngineIniAndroidAbiSettings(arch)
  return [
    'cgtools:update-default-engine-ini',
    `-Path=${defaultEngineIniPath}`,
    ...Object.entries(values).map(([key, value]) => `-${key}=${value}`),
  ]
}

export const formatDefaultEngineIniSnippet = (arch: AndroidArch) => {
  const values = getDefaultEngineIniAndroidAbiSettings(arch)
  return [
    ANDROID_RUNTIME_SETTINGS_SECTION,
    ...Object.entries(values).map(([key, value]) => `${key}=${value}`),
  ].join('\n')
}

export const updateDefaultEngineIniAndroidAbi = (defaultEngineIniPath: string, arch: AndroidArch) => {
  const values = getDefaultEngineIniAndroidAbiSettings(arch)
  const originalContent = fs.readFileSync(defaultEngineIniPath, 'utf-8')
  // DefaultEngine.ini 可能来自不同工具或人工编辑，写回时保留原始换行风格和末尾换行，避免制造无关 diff。
  const newline = originalContent.includes('\r\n') ? '\r\n' : '\n'
  const hadTrailingNewline = originalContent.length === 0 || /\r?\n$/.test(originalContent)
  const lines = originalContent.length > 0 ? originalContent.replace(/\r?\n$/, '').split(/\r?\n/) : []
  // UE ini section 名大小写不影响语义，这里按不区分大小写查找 AndroidRuntimeSettings section。
  const sectionMatcher = (line: string) => line.trim().toLowerCase() === ANDROID_RUNTIME_SETTINGS_SECTION.toLowerCase()
  const findSectionIndexes = () => lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => sectionMatcher(line))
    .map(({ index }) => index)
  let sectionIndexes = findSectionIndexes()

  if (sectionIndexes.length === 0) {
    // 如果工程配置里还没有 AndroidRuntimeSettings，就追加一个新 section；前面补空行只是为了保持 ini 可读性。
    if (lines.length > 0 && lines[lines.length - 1]!.trim() !== '') {
      lines.push('')
    }
    lines.push(ANDROID_RUNTIME_SETTINGS_SECTION)
    sectionIndexes = [lines.length - 1]
  }

  const findSectionEnd = (sectionIndex: number) => {
    // section 的有效范围到下一个 [Section.Name] 之前为止，避免把别的配置段里的同名 key 改掉。
    for (let index = sectionIndex + 1; index < lines.length; index += 1) {
      if (/^\s*\[[^\]]+\]\s*$/.test(lines[index]!)) {
        return index
      }
    }
    return lines.length
  }

  for (let sectionPosition = sectionIndexes.length - 1; sectionPosition >= 0; sectionPosition -= 1) {
    const sectionIndex = sectionIndexes[sectionPosition]
    if (typeof sectionIndex !== 'number') {
      continue
    }

    for (const [key, value] of Object.entries(values)) {
      const keyPattern = new RegExp(`^\\s*${key}\\s*=`, 'i')
      const sectionEnd = findSectionEnd(sectionIndex)
      const matchingIndexes: number[] = []

      // 同一个 section 内可能因为手工合并出现重复 key，先收集再统一处理，避免边遍历边删除导致索引漂移。
      for (let index = sectionIndex + 1; index < sectionEnd; index += 1) {
        if (keyPattern.test(lines[index]!)) {
          matchingIndexes.push(index)
        }
      }

      if (matchingIndexes.length === 0) {
        lines.splice(sectionEnd, 0, `${key}=${value}`)
        continue
      }

      // 保留第一个 key 的位置来减少配置重排；后续重复项删除，避免 UE 读取时被残留旧值覆盖。
      lines[matchingIndexes[0]!] = `${key}=${value}`
      for (let index = matchingIndexes.length - 1; index > 0; index -= 1) {
        lines.splice(matchingIndexes[index]!, 1)
      }
    }
  }

  const nextContent = `${lines.join(newline)}${hadTrailingNewline ? newline : ''}`
  // 内容没变就不写盘，减少时间戳变化和无意义的工具链重新扫描。
  if (nextContent !== originalContent) {
    fs.writeFileSync(defaultEngineIniPath, nextContent, 'utf-8')
  }

  return {
    changed: nextContent !== originalContent,
    defaultEngineIniPath,
    settings: values,
  }
}

const addValidation = (errors: string[], condition: boolean, message: string) => {
  if (!condition) {
    errors.push(message)
  }
}

const isAdbAvailable = () => {
  const probe = spawnSync('adb', ['version'], { encoding: 'utf-8', shell: false, windowsHide: true })
  return probe.status === 0
}

const buildReplaceOutputApk = (apkPath: string) => {
  const ext = path.extname(apkPath)
  if (!ext) {
    return `${apkPath}_so_replaced`
  }
  return `${apkPath.slice(0, -ext.length)}_so_replaced${ext}`
}

const getAndroidBinaryArchCandidates = (arch: AndroidArch) => {
  if (arch === 'arm64-v8a') return ['arm64', 'arm64-v8a']
  if (arch === 'armeabi-v7a') return ['armv7', 'armeabi-v7a']
  return ['x64', 'x86_64']
}

const buildAndroidSoOutputCandidates = (projectFile: string, config: BuildConfig, arch: AndroidArch) => {
  const projectDir = path.dirname(projectFile || '')
  const targetName = path.basename(projectFile || '', path.extname(projectFile || ''))
  const binariesDir = path.join(projectDir, 'Binaries', 'Android')
  const archCandidates = getAndroidBinaryArchCandidates(arch)
  const fileCandidates: string[] = []

  for (const archName of archCandidates) {
    fileCandidates.push(path.join(binariesDir, `${targetName}-Android-${config}-${archName}-es2.so`))
    fileCandidates.push(path.join(binariesDir, `${targetName}-Android-${config}-${archName}.so`))
    if (config === 'Development') {
      fileCandidates.push(path.join(binariesDir, `${targetName}-Android-${archName}-es2.so`))
      fileCandidates.push(path.join(binariesDir, `${targetName}-Android-${archName}.so`))
    }
  }

  fileCandidates.push(path.join(projectDir, 'Intermediate', 'Android', 'APK', 'jni', arch || 'arm64-v8a', 'libUE4.so'))
  return [...new Set(fileCandidates)]
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

  // P4 同步不能直接打到 Survive 这种工作区外层目录；默认拆成一层子目录，避开构建产物目录。
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

const buildVersionUpdateSteps = (payload: BuildSoPayload, projectDir: string, errors: string[], warnings: string[]) => {
  if (!payload.versionUpdateEnabled) {
    return []
  }

  const versionInfo = parseBuildVersionUpdateText(payload.versionUpdateText || '')
  const hasAnyVersion = !!(versionInfo.mergedP4Head || versionInfo.mergedSvnHead || versionInfo.p4Merge.length || versionInfo.svnMerge.length)
  addValidation(errors, hasAnyVersion, 'Version update text did not contain MergedP4Head/MergedSvnHead/P4Merge/SVNMerge.')

  const svnUpdatePath = (payload.svnUpdatePath || '').trim() || projectDir
  const p4SyncPaths = normalizeP4SyncPaths(projectDir, payload.projectRoot, payload.p4SyncPaths)
  const needsSvn = !!(versionInfo.mergedSvnHead || versionInfo.svnMerge.length)
  const needsP4 = !!(versionInfo.mergedP4Head || versionInfo.p4Merge.length)
  const steps: CommandStep[] = []

  if (needsSvn) {
    addValidation(errors, fs.existsSync(svnUpdatePath), `SVN update path not found: ${svnUpdatePath}`)
    steps.push({
      name: 'Update SVN to test version',
      cmd: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', buildSvnVersionSyncScript(versionInfo, svnUpdatePath)],
      cwd: svnUpdatePath,
    })
  }

  if (needsP4) {
    addValidation(errors, p4SyncPaths.length > 0, 'No safe P4 sync paths found. Configure p4SyncPaths instead of syncing the outer project directory.')
    for (const p4Path of p4SyncPaths) {
      addValidation(errors, fs.existsSync(p4Path), `P4 sync path not found: ${p4Path}`)
    }
    steps.push({
      name: 'Sync P4 to test version',
      cmd: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', buildP4VersionSyncScript(versionInfo, p4SyncPaths, payload.p4Parallel !== false)],
      cwd: payload.projectRoot,
    })
  }

  warnings.push(`Parsed version text: P4@${versionInfo.mergedP4Head || '-'}, SVN@${versionInfo.mergedSvnHead || '-'}, P4Merge=${versionInfo.p4Merge.join(',') || '-'}, SVNMerge=${versionInfo.svnMerge.join(',') || '-'}`)
  if (needsP4) {
    warnings.push(`P4 safe sync paths: ${p4SyncPaths.join('; ')}`)
  }

  return steps
}

const buildBuildSoPlan = (payload: BuildSoPayload): JobPlan => {
  const errors: string[] = []
  const warnings: string[] = []
  const projectDir = path.dirname(payload.projectFile || '')
  const requestedDefaultEngineIniPath = payload.defaultEngineIniPath?.trim() || ''
  const defaultEngineIniPath = requestedDefaultEngineIniPath
    ? requestedDefaultEngineIniPath
    : path.join(projectDir, 'Config', 'DefaultEngine.ini')
  const targetName = path.basename(payload.projectFile || '', path.extname(payload.projectFile || ''))
  const ubtExe = path.join(payload.engineRoot || '', 'Binaries', 'DotNET', 'UnrealBuildTool.exe')
  const defaultLogPath = path.join(projectDir, 'Saved', 'Logs', 'Build', `AndroidSO_${payload.config}_${payload.arch}.log`)
  const resolvedLogPath = (payload.logPath || '').trim()
    ? (path.isAbsolute((payload.logPath || '').trim()) ? (payload.logPath || '').trim() : path.join(payload.projectRoot || '', (payload.logPath || '').trim()))
    : defaultLogPath
  const outputSoCandidates = buildAndroidSoOutputCandidates(payload.projectFile, payload.config, payload.arch)
  const outputSoPath = outputSoCandidates[0] || ''
  const archArgMap: Record<AndroidArch, string> = {
    'arm64-v8a': '-arm64',
    'armeabi-v7a': '-armv7',
    x86_64: '-x64',
  }
  const archArg = archArgMap[payload.arch]
  const maxParallelActions = Number(payload.maxParallelActions)
  const hasMaxParallelActions = Number.isInteger(maxParallelActions) && maxParallelActions > 0

  addValidation(errors, process.platform === 'win32', 'Only Windows is supported for this flow.')
  addValidation(errors, fs.existsSync(payload.projectRoot || ''), `projectRoot not found: ${payload.projectRoot}`)
  addValidation(errors, fs.existsSync(payload.projectFile || ''), `projectFile not found: ${payload.projectFile}`)
  addValidation(errors, fs.existsSync(defaultEngineIniPath), `DefaultEngine.ini not found: ${defaultEngineIniPath}`)
  addValidation(errors, fs.existsSync(payload.engineRoot || ''), `engineRoot not found: ${payload.engineRoot}`)
  addValidation(errors, fs.existsSync(ubtExe), `UnrealBuildTool.exe not found: ${ubtExe}`)
  addValidation(errors, fs.existsSync(REPLACE_MANAGER_TOOL_PY), `ReplaceManagerTool.py not found: ${REPLACE_MANAGER_TOOL_PY}`)
  addValidation(errors, fs.existsSync(REPLACE_MANAGER_CONFIG_JSON), `ReplaceConfig.json not found: ${REPLACE_MANAGER_CONFIG_JSON}`)
  addValidation(errors, VALID_ARCHES.has(payload.arch), `Unsupported arch: ${payload.arch}`)
  addValidation(errors, VALID_CONFIGS.has(payload.config), `Unsupported config: ${payload.config}`)
  addValidation(errors, !!targetName, `Unable to resolve target name from projectFile: ${payload.projectFile}`)
  addValidation(
    errors,
    !payload.maxParallelActions || (hasMaxParallelActions && maxParallelActions <= 128),
    `maxParallelActions must be an integer between 1 and 128, got: ${payload.maxParallelActions}`,
  )

  const commonArgs = [
    targetName,
    'Android',
    payload.config,
    `-Project=${payload.projectFile}`,
    payload.projectFile,
    '-NoUBTMakefiles',
    `-remoteini=${projectDir}`,
    '-skipdeploy',
    '-BuildPipeline=',
    archArg,
    ...(payload.config === 'Shipping' ? ['-ShippingDev'] : []),
    '-forceframepointer',
    '-noxge',
  ].filter(Boolean) as string[]

  const manifestArgs = [
    ...commonArgs,
    '-generatemanifest',
    ...(hasMaxParallelActions ? [`-MaxParallelActions=${maxParallelActions}`] : []),
    `-log=${resolvedLogPath}`,
    '-NoHotReload',
  ].filter(Boolean) as string[]

  const buildArgs = [
    ...commonArgs,
    ...(hasMaxParallelActions ? [`-MaxParallelActions=${maxParallelActions}`] : []),
    `-log=${resolvedLogPath}`,
    '-NoHotReload',
  ].filter(Boolean) as string[]

  if (payload.config !== 'Shipping') {
    warnings.push('ShippingDev is only added when config=Shipping.')
  }
  warnings.push(`UBT log will be written to: ${resolvedLogPath}`)
  warnings.push(`DefaultEngine.ini Android ABI will be updated before build: ${defaultEngineIniPath}`)
  warnings.push(`ReplaceManager source: ${REPLACE_MANAGER_SOURCE_DIR}`)
  warnings.push('ReplaceManager will run in non-interactive Python mode.')

  const defaultEngineIniCommand = buildDefaultEngineIniPreviewCommand(defaultEngineIniPath, payload.arch)
  const defaultEngineIniStep: CommandStep = {
    name: 'Update DefaultEngine.ini Android ABI',
    cmd: defaultEngineIniCommand[0] || 'cgtools:update-default-engine-ini',
    args: defaultEngineIniCommand.slice(1),
    cwd: projectDir,
    internalAction: {
      type: 'updateDefaultEngineIni',
      defaultEngineIniPath,
      arch: payload.arch,
    },
  }

  const replaceManagerStep: CommandStep = {
    name: 'Prepare ReplaceManager patch',
    cmd: 'python',
    args: [REPLACE_MANAGER_TOOL_PY, REPLACE_MANAGER_SOURCE_DIR, payload.projectRoot, 'restore'],
    cwd: REPLACE_MANAGER_DIR,
  }

  const manifestStep: CommandStep = {
    name: 'Generate UBT manifest',
    cmd: ubtExe,
    args: manifestArgs,
    cwd: payload.projectRoot,
  }

  const buildStep: CommandStep = {
    name: 'Build Android SO with UBT',
    cmd: ubtExe,
    args: buildArgs,
    cwd: payload.projectRoot,
  }

  const restoreReplaceManagerStep: CommandStep = {
    name: 'Restore ReplaceManager state',
    cmd: 'python',
    args: [REPLACE_MANAGER_TOOL_PY, REPLACE_MANAGER_SOURCE_DIR, payload.projectRoot, 'clean'],
    cwd: REPLACE_MANAGER_DIR,
  }
  const versionUpdateSteps = buildVersionUpdateSteps(payload, projectDir, errors, warnings)
  const steps = [...versionUpdateSteps, defaultEngineIniStep, replaceManagerStep, manifestStep, buildStep]

  return {
    steps,
    cleanupSteps: [restoreReplaceManagerStep],
    outputSoCandidates,
    preview: [
      ...versionUpdateSteps.map((step) => renderCommand(step.cmd, step.args, step.cwd)),
      renderCommand(defaultEngineIniStep.cmd, defaultEngineIniStep.args, defaultEngineIniStep.cwd),
      renderCommand(replaceManagerStep.cmd, replaceManagerStep.args, replaceManagerStep.cwd),
      renderCommand(manifestStep.cmd, manifestStep.args, manifestStep.cwd),
      renderCommand(buildStep.cmd, buildStep.args, buildStep.cwd),
      renderCommand(restoreReplaceManagerStep.cmd, restoreReplaceManagerStep.args, restoreReplaceManagerStep.cwd),
    ].join('\n'),
    validationErrors: errors,
    warnings,
    outputs: {
      soPath: outputSoPath,
      buildLogPath: resolvedLogPath,
    },
  }
}

const buildReplaceSoPlan = (payload: ReplaceAPayload): JobPlan => {
  const errors: string[] = []
  const warnings: string[] = []

  addValidation(errors, process.platform === 'win32', 'Only Windows is supported for this flow.')
  addValidation(errors, fs.existsSync(payload.ueAppToolsExe || ''), `UEAppTools.exe not found: ${payload.ueAppToolsExe}`)
  addValidation(errors, fs.existsSync(payload.apkPath || ''), `APK not found: ${payload.apkPath}`)
  addValidation(errors, payload.apkPath.toLowerCase().endsWith('.apk'), 'apkPath must end with .apk')
  addValidation(errors, fs.existsSync(payload.soPath || ''), `SO not found: ${payload.soPath}`)
  addValidation(errors, payload.soPath.toLowerCase().endsWith('.so'), 'soPath must end with .so')
  addValidation(errors, VALID_ARCHES.has(payload.arch), `Unsupported arch: ${payload.arch}`)

  const step: CommandStep = {
    name: 'Replace SO in APK',
    cmd: payload.ueAppToolsExe,
    args: [
      '-mode=replaceSo',
      '-platform=android',
      `-apkPath=${payload.apkPath}`,
      `-soPath=${payload.soPath}`,
      `-arch=${payload.arch}`,
    ],
    cwd: path.dirname(payload.ueAppToolsExe),
  }

  const outputApk = buildReplaceOutputApk(payload.apkPath)
  if (payload.showInstallHint) {
    warnings.push(`Install hint: adb install -r "${outputApk}"`)
  }

  return {
    steps: [step],
    cleanupSteps: [],
    outputSoCandidates: [],
    preview: renderCommand(step.cmd, step.args, step.cwd),
    validationErrors: errors,
    warnings,
    outputs: {
      outputApk,
    },
  }
}

const normalizeActivityComponent = (packageName: string, launchActivity: string) => {
  if (!launchActivity) {
    return `${packageName}/com.epicgames.ue4.SplashActivity`
  }
  if (launchActivity.includes('/')) {
    return launchActivity
  }
  return `${packageName}/${launchActivity}`
}

const buildInjectPlan = (payload: InjectBPayload): JobPlan => {
  const errors: string[] = []
  const warnings: string[] = []

  const injectDemoPath = path.join(payload.androidInjectDir || '', 'inject_demo')
  const injectEntrySoPath = path.join(payload.androidInjectDir || '', 'lib_inject_entry.so')
  const localLogPath = path.join(os.tmpdir(), `android_inject_${Date.now()}.txt`)
  const activityComponent = normalizeActivityComponent(payload.packageName, payload.launchActivity)

  addValidation(errors, process.platform === 'win32', 'Only Windows is supported for this flow.')
  addValidation(errors, !!payload.packageName, 'packageName is required.')
  addValidation(errors, fs.existsSync(payload.androidInjectDir || ''), `androidInjectDir not found: ${payload.androidInjectDir}`)
  addValidation(errors, fs.existsSync(injectDemoPath), `inject_demo not found: ${injectDemoPath}`)
  addValidation(errors, fs.existsSync(injectEntrySoPath), `lib_inject_entry.so not found: ${injectEntrySoPath}`)
  addValidation(errors, fs.existsSync(payload.soPath || ''), `SO not found: ${payload.soPath}`)
  addValidation(errors, payload.soPath.toLowerCase().endsWith('.so'), 'soPath must end with .so')
  addValidation(errors, isAdbAvailable(), 'adb is not available in PATH.')

  const copyRuntimeCmd = `run-as ${payload.packageName} sh -c 'cp /data/local/tmp/libUE4.so . && cp /data/local/tmp/inject_demo . && cp /data/local/tmp/lib_inject_entry.so . && chmod 777 ./inject_demo && chmod 777 ./lib_inject_entry.so'`
  const injectCmd = `run-as ${payload.packageName} sh -c './inject_demo ${payload.packageName} > /data/local/tmp/log_android_inject.txt'`

  const steps: CommandStep[] = [
    {
      name: 'Push inject_demo',
      cmd: 'adb',
      args: ['push', injectDemoPath, '/data/local/tmp/'],
    },
    {
      name: 'Push lib_inject_entry.so',
      cmd: 'adb',
      args: ['push', injectEntrySoPath, '/data/local/tmp/'],
    },
    {
      name: 'Push target libUE4.so',
      cmd: 'adb',
      args: ['push', payload.soPath, '/data/local/tmp/libUE4.so'],
    },
    {
      name: 'Prepare log file',
      cmd: 'adb',
      args: ['shell', 'touch /data/local/tmp/log_android_inject.txt'],
    },
    {
      name: 'Copy runtime files into app sandbox',
      cmd: 'adb',
      args: ['shell', copyRuntimeCmd],
    },
    {
      name: 'Launch game activity',
      cmd: 'adb',
      args: ['shell', 'am', 'start', '-n', activityComponent],
    },
    {
      name: 'Execute injector',
      cmd: 'adb',
      args: ['shell', injectCmd],
    },
    {
      name: 'Pull injector log',
      cmd: 'adb',
      args: ['pull', '/data/local/tmp/log_android_inject.txt', localLogPath],
    },
  ]

  warnings.push('If the app crashes right after injection, re-run once to verify stability.')

  return {
    steps,
    cleanupSteps: [],
    outputSoCandidates: [],
    preview: steps.map((step) => renderCommand(step.cmd, step.args, step.cwd)).join('\n'),
    validationErrors: errors,
    warnings,
    outputs: {
      localLogPath,
      expectedMarker: 'inject dlclose_addr res : 0',
    },
  }
}

const normalizePushDestination = (remotePath: string) => {
  const sanitized = (remotePath || '').trim().replace(/\\/g, '/')
  if (!sanitized) {
    return '/data/local/tmp/libUE4.so'
  }
  if (sanitized.endsWith('/')) {
    return `${sanitized}libUE4.so`
  }
  if (sanitized.toLowerCase().endsWith('.so')) {
    const parentDir = path.posix.dirname(sanitized)
    return `${parentDir}/libUE4.so`
  }
  return `${sanitized}/libUE4.so`
}

const buildPushSoPlan = (payload: PushSoPayload): JobPlan => {
  const errors: string[] = []
  const warnings: string[] = []

  addValidation(errors, process.platform === 'win32', 'Only Windows is supported for this flow.')
  addValidation(errors, fs.existsSync(payload.soPath || ''), `SO not found: ${payload.soPath}`)
  addValidation(errors, payload.soPath.toLowerCase().endsWith('.so'), 'soPath must end with .so')
  addValidation(errors, !!(payload.remotePath || '').trim(), 'remotePath is required.')
  addValidation(errors, isAdbAvailable(), 'adb is not available in PATH.')
  if (payload.useRunAs) {
    addValidation(errors, !!(payload.packageName || '').trim(), 'packageName is required when useRunAs=true.')
  }

  const remotePath = normalizePushDestination(payload.remotePath || '')
  if (payload.useRunAs) {
    const packageName = (payload.packageName || '').trim()
    const steps: CommandStep[] = [
      {
        name: 'Push target libUE4.so to temp path',
        cmd: 'adb',
        args: ['push', payload.soPath, '/data/local/tmp/libUE4.so'],
      },
      {
        name: 'Ensure app_lib exists',
        cmd: 'adb',
        args: ['shell', 'run-as', packageName, 'mkdir', '-p', 'app_lib'],
      },
      {
        name: 'Copy SO into app_lib',
        cmd: 'adb',
        args: ['shell', 'run-as', packageName, 'cp', '/data/local/tmp/libUE4.so', 'app_lib/libUE4.so'],
      },
      {
        name: 'Verify libUE4.so in app_lib',
        cmd: 'adb',
        args: ['shell', 'run-as', packageName, 'ls', '-l', 'app_lib/libUE4.so'],
      },
    ]

    if (payload.launchAfterPush) {
      steps.push({
        name: 'Launch package after SO push',
        cmd: 'adb',
        args: ['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'],
      })
    }

    warnings.push(`Run-as mode enabled, target package: ${packageName}`)
    if (payload.launchAfterPush) {
      warnings.push(`Package will be launched after push: ${packageName}`)
    }

    return {
      steps,
      cleanupSteps: [],
      outputSoCandidates: [],
      preview: steps.map((step) => renderCommand(step.cmd, step.args, step.cwd)).join('\n'),
      validationErrors: errors,
      warnings,
      outputs: {
        remoteSoPath: 'app_lib/libUE4.so',
      },
    }
  }

  const step: CommandStep = {
    name: 'Push SO via adb',
    cmd: 'adb',
    args: ['push', payload.soPath, remotePath],
  }

  return {
    steps: [step],
    cleanupSteps: [],
    outputSoCandidates: [],
    preview: renderCommand(step.cmd, step.args, step.cwd),
    validationErrors: errors,
    warnings,
    outputs: {
      remoteSoPath: remotePath,
    },
  }
}

const buildRebuildSoPlan = (payload: BuildSoPayload): JobPlan => {
  const errors: string[] = []
  const warnings: string[] = []
  const projectDir = path.dirname(payload.projectFile || '')
  const targetName = path.basename(payload.projectFile || '', path.extname(payload.projectFile || ''))
  const ubtExe = path.join(payload.engineRoot || '', 'Binaries', 'DotNET', 'UnrealBuildTool.exe')
  const defaultLogPath = path.join(projectDir, 'Saved', 'Logs', 'Build', `AndroidSO_Rebuild_${payload.config}_${payload.arch}.log`)
  const resolvedLogPath = (payload.logPath || '').trim()
    ? (path.isAbsolute((payload.logPath || '').trim()) ? (payload.logPath || '').trim() : path.join(payload.projectRoot || '', (payload.logPath || '').trim()))
    : defaultLogPath
  const outputSoCandidates = buildAndroidSoOutputCandidates(payload.projectFile, payload.config, payload.arch)
  const outputSoPath = outputSoCandidates[0] || ''
  const archArgMap: Record<AndroidArch, string> = {
    'arm64-v8a': '-arm64',
    'armeabi-v7a': '-armv7',
    x86_64: '-x64',
  }
  const archArg = archArgMap[payload.arch]
  const maxParallelActions = Number(payload.maxParallelActions)
  const hasMaxParallelActions = Number.isInteger(maxParallelActions) && maxParallelActions > 0

  addValidation(errors, process.platform === 'win32', 'Only Windows is supported for this flow.')
  addValidation(errors, fs.existsSync(payload.projectRoot || ''), `projectRoot not found: ${payload.projectRoot}`)
  addValidation(errors, fs.existsSync(payload.projectFile || ''), `projectFile not found: ${payload.projectFile}`)
  addValidation(errors, fs.existsSync(payload.engineRoot || ''), `engineRoot not found: ${payload.engineRoot}`)
  addValidation(errors, fs.existsSync(ubtExe), `UnrealBuildTool.exe not found: ${ubtExe}`)
  addValidation(errors, VALID_ARCHES.has(payload.arch), `Unsupported arch: ${payload.arch}`)
  addValidation(errors, VALID_CONFIGS.has(payload.config), `Unsupported config: ${payload.config}`)
  addValidation(errors, !!targetName, `Unable to resolve target name from projectFile: ${payload.projectFile}`)
  addValidation(
    errors,
    !payload.maxParallelActions || (hasMaxParallelActions && maxParallelActions <= 128),
    `maxParallelActions must be an integer between 1 and 128, got: ${payload.maxParallelActions}`,
  )

  const buildArgs = [
    targetName,
    'Android',
    payload.config,
    `-Project=${payload.projectFile}`,
    payload.projectFile,
    '-NoUBTMakefiles',
    `-remoteini=${projectDir}`,
    '-skipdeploy',
    '-BuildPipeline=',
    archArg,
    ...(payload.config === 'Shipping' ? ['-ShippingDev'] : []),
    '-forceframepointer',
    '-noxge',
    ...(hasMaxParallelActions ? [`-MaxParallelActions=${maxParallelActions}`] : []),
    `-log=${resolvedLogPath}`,
    '-NoHotReload',
  ].filter(Boolean) as string[]

  const buildStep: CommandStep = {
    name: 'Rebuild Android SO with UBT',
    cmd: ubtExe,
    args: buildArgs,
    cwd: payload.projectRoot,
  }

  warnings.push('Quick rebuild skips DefaultEngine.ini ABI update, ReplaceManager restore/clean, and UBT manifest generation.')
  warnings.push('Use the full Build SO mode again after changing ABI/config/toolchain setup.')
  warnings.push(`UBT log will be written to: ${resolvedLogPath}`)

  return {
    steps: [buildStep],
    cleanupSteps: [],
    outputSoCandidates,
    preview: renderCommand(buildStep.cmd, buildStep.args, buildStep.cwd),
    validationErrors: errors,
    warnings,
    outputs: {
      soPath: outputSoPath,
      buildLogPath: resolvedLogPath,
    },
  }
}

export const buildAndroidSoJobPlan = (jobType: AndroidSoJobType, payload: AndroidSoPayload): JobPlan => {
  if (jobType === 'buildSo') {
    return buildBuildSoPlan(payload as BuildSoPayload)
  }
  if (jobType === 'rebuildSo') {
    return buildRebuildSoPlan(payload as BuildSoPayload)
  }
  if (jobType === 'replaceA') {
    return buildReplaceSoPlan(payload as ReplaceAPayload)
  }
  if (jobType === 'injectB') {
    return buildInjectPlan(payload as InjectBPayload)
  }
  if (jobType === 'pushSo') {
    return buildPushSoPlan(payload as PushSoPayload)
  }
  return {
    steps: [],
    cleanupSteps: [],
    outputSoCandidates: [],
    preview: '',
    validationErrors: [`Unsupported jobType: ${jobType}`],
    warnings: [],
    outputs: {},
  }
}
