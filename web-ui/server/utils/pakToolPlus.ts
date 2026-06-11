import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_PROJECT_ROOT = 'E:\\CJGame\\trunk'
export const DEFAULT_PAK_TOOL_EXE = 'E:\\CJGame\\trunk\\Survive\\Paktools\\CookAndPakAsset\\Do.bat'
export const DEFAULT_PACKAGE_NAME = 'com.tencent.tmgp.pubgmhd'
export const DEFAULT_GAME_NAME = 'ShadowTrackerExtra'
export const DEFAULT_PATCH_PREFIX = 'game_patch_'

export type PakToolPaths = {
  projectRoot: string
  exePath: string
  toolDir: string
  batPath: string
  tempPaksDir: string
  mainPyPath: string
}

export type PakToolStatus = PakToolPaths & {
  latestGeneratedPak?: GeneratedPakPair
  detected: {
    windows: boolean
    projectRootExists: boolean
    exeExists: boolean
    toolDirExists: boolean
    batExists: boolean
    tempPaksDirExists: boolean
    mainPyExists: boolean
  }
}

export type PakToolLaunchPlan = {
  cmd: string
  args: string[]
  cwd: string
}

export type PakCommandStep = {
  name: string
  cmd: string
  args: string[]
}

export type GeneratedPakPair = {
  pakPath: string
  sigPath: string
  sourcePakName: string
  sourceSigName: string
}

export type LocalPakFile = {
  name: string
  path: string
  size: number
  mtimeMs: number
  hasSig: boolean
}

export type PakPushPayload = {
  tempPaksDir: string
  targetPakName: string
  packageName?: string
  gameName?: string
  deviceSerial?: string
}

export type PakPushPlan = GeneratedPakPair & {
  targetPakName: string
  targetSigName: string
  remoteDir: string
  remoteTempDir: string
  steps: PakCommandStep[]
}

export type PakPushSource = {
  pakPath: string
  targetPakName?: string
}

export type PakPushFile = {
  pakPath: string
  sigPath?: string
  sourcePakName: string
  sourceSigName?: string
  targetPakName: string
  targetSigName?: string
  hasSig: boolean
}

export type PakPushFilesPayload = {
  sources: PakPushSource[]
  packageName?: string
  gameName?: string
  deviceSerial?: string
  remotePakFiles?: string[]
  requireSig?: boolean
}

export type PakPushFilesPlan = {
  files: PakPushFile[]
  remoteDir: string
  remoteTempDir: string
  steps: PakCommandStep[]
}

export type RemotePakVersion = {
  fileName: string
  version: string
  count: number
}

export type RemotePakVersionSummary = {
  selectedVersion: string
  latestVersion: string
  pakFiles: string[]
  versions: RemotePakVersion[]
}

export type RemotePakDeletePayload = {
  fileNames: string[]
  packageName?: string
  gameName?: string
  deviceSerial?: string
}

export type RemotePakDeletePlan = {
  fileNames: string[]
  remoteDir: string
  steps: PakCommandStep[]
}

const PATCH_NAME_PATTERN = /^(game|core|tex)_patch_(.+)$/i
const KNOWN_PATCH_NAME_PATTERN = /^(?:game|core|tex|test)_patch_/i
const ETRUNK_PATCH_VERSION_PATTERN = /\d+\.\d+\.\d+\.\d+/
const PLACEHOLDER_PATCH_VERSION = '0.0.0.0'

const normalizeWindowsPath = (value: string, fallback: string) => {
  const normalized = String(value || '').trim().replace(/\//g, '\\')
  if (!normalized) {
    return fallback
  }
  if (/^[A-Za-z]:\\?$/.test(normalized)) {
    return `${normalized.slice(0, 2)}\\`
  }
  return normalized.replace(/[\\]+$/, '')
}

const normalizePakInputBaseName = (rawName: string) => {
  const trimmed = String(rawName || '').trim()
  if (!trimmed) {
    throw new Error('pak 名称不能为空')
  }
  if (/[\\/]/.test(trimmed) || trimmed.includes('..')) {
    throw new Error('pak 名称不能包含路径分隔符或 ..')
  }

  const withoutExt = trimmed.replace(/\.pak$/i, '').replace(/\.sig$/i, '')
  if (!withoutExt || /[<>:"|?*]/.test(withoutExt)) {
    throw new Error('pak 名称包含非法字符')
  }
  return withoutExt
}

const getPreferredRemoteVersion = (remotePakFiles?: string[]) => {
  if (!Array.isArray(remotePakFiles) || !remotePakFiles.length) {
    return ''
  }
  return extractRemotePakVersions(remotePakFiles.join('\n')).selectedVersion
}

const appendVersionWhenMissing = (baseName: string, remotePakFiles?: string[]) => {
  const remoteVersion = getPreferredRemoteVersion(remotePakFiles)
  if (remoteVersion && baseName.includes(PLACEHOLDER_PATCH_VERSION)) {
    return baseName.replaceAll(PLACEHOLDER_PATCH_VERSION, remoteVersion)
  }
  if (ETRUNK_PATCH_VERSION_PATTERN.test(baseName)) {
    return baseName
  }
  return remoteVersion ? `${baseName}_${remoteVersion}` : baseName
}

export const normalizePakBaseName = (rawName: string, remotePakFiles?: string[]) => {
  const withoutExt = normalizePakInputBaseName(rawName)
  const match = withoutExt.match(PATCH_NAME_PATTERN)
  if (match) {
    return appendVersionWhenMissing(withoutExt, remotePakFiles)
  }

  const suffix = withoutExt.replace(KNOWN_PATCH_NAME_PATTERN, '')
  if (!suffix) {
    throw new Error('pak 名称缺少版本或用途后缀')
  }
  return appendVersionWhenMissing(`${DEFAULT_PATCH_PREFIX}${suffix}`, remotePakFiles)
}

const normalizeRemotePakBaseNames = (remotePakFiles: string[] | undefined) => {
  return (Array.isArray(remotePakFiles) ? remotePakFiles : [])
    .map((fileName) => {
      const trimmed = String(fileName || '').trim()
      if (!trimmed.toLowerCase().endsWith('.pak')) return null
      if (/[\\/]/.test(trimmed) || trimmed.includes('..') || /[<>:"|?*]/.test(trimmed)) return null
      const baseName = trimmed.replace(/\.pak$/i, '')
      const match = baseName.match(PATCH_NAME_PATTERN)
      if (!match) return null
      return {
        baseName,
        prefix: match[1]!.toLowerCase(),
        suffix: match[2]!.toLowerCase(),
      }
    })
    .filter((item): item is { baseName: string, prefix: string, suffix: string } => Boolean(item))
}

export const inferPakTargetBaseName = (rawName: string, remotePakFiles?: string[]) => {
  const inputBaseName = normalizePakInputBaseName(rawName)
  const inputMatch = inputBaseName.match(PATCH_NAME_PATTERN)
  if (inputMatch) {
    return appendVersionWhenMissing(inputBaseName, remotePakFiles)
  }

  const normalizedDefault = normalizePakBaseName(rawName, remotePakFiles)
  const inputSuffix = inputBaseName.replace(KNOWN_PATCH_NAME_PATTERN, '').toLowerCase()

  const remoteMatches = normalizeRemotePakBaseNames(remotePakFiles)
    .filter((item) => item.suffix === inputSuffix)
  if (!remoteMatches.length) {
    return normalizedDefault
  }

  return remoteMatches[0]!.baseName
}

export const normalizeRemotePakFileName = (rawName: string) => {
  const trimmed = String(rawName || '').trim()
  if (!trimmed) {
    throw new Error('pak 名称不能为空')
  }
  if (/[\\/]/.test(trimmed) || trimmed.includes('..')) {
    throw new Error('pak 名称不能包含路径分隔符或 ..')
  }
  if (!trimmed.toLowerCase().endsWith('.pak') || /[<>:"|?*]/.test(trimmed)) {
    throw new Error('只能删除合法的 .pak 文件名')
  }
  return trimmed
}

export const buildAndroidSavedPaksDir = (
  packageName = DEFAULT_PACKAGE_NAME,
  gameName = DEFAULT_GAME_NAME,
) => {
  const safePackageName = String(packageName || '').trim() || DEFAULT_PACKAGE_NAME
  const safeGameName = String(gameName || '').trim() || DEFAULT_GAME_NAME
  return `/sdcard/Android/data/${safePackageName}/files/UE4Game/${safeGameName}/${safeGameName}/Saved/Paks`
}

const createInstallFromTempStep = (
  deviceArgs: string[],
  sourcePath: string,
  targetPath: string,
  targetName: string,
): PakCommandStep => ({
  name: `Install ${targetName} from adb temp`,
  cmd: 'adb',
  // Android/data 直推可能在 adb 的 fchown 收尾阶段失败；先推临时目录再设备侧复制，避开该限制。
  args: [...deviceArgs, 'shell', 'cp', sourcePath, targetPath],
})

const createRemoveTempStep = (
  deviceArgs: string[],
  tempPath: string,
  targetName: string,
): PakCommandStep => ({
  name: `Remove adb temp ${targetName}`,
  cmd: 'adb',
  args: [...deviceArgs, 'shell', 'rm', '-f', tempPath],
})

const createRemoveRemoteTargetStep = (
  deviceArgs: string[],
  targetPath: string,
  targetName: string,
): PakCommandStep => ({
  name: `Remove existing ${targetName}`,
  cmd: 'adb',
  args: [...deviceArgs, 'shell', 'rm', '-f', targetPath],
})

export const parsePakVersionFromName = (fileName: string) => {
  const normalized = String(fileName || '').trim()
  if (!normalized.toLowerCase().endsWith('.pak')) {
    return null
  }

  const matches = [...normalized.matchAll(/(\d+\.\d+\.\d+\.\d+)/g)]
  const latestMatch = matches.at(-1)
  return latestMatch?.[1] || null
}

const comparePakVersion = (left: string, right: string) => {
  const leftParts = left.split('.').map((part) => Number.parseInt(part, 10))
  const rightParts = right.split('.').map((part) => Number.parseInt(part, 10))
  for (let index = 0; index < 4; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (delta !== 0) {
      return delta
    }
  }
  return 0
}

export const extractRemotePakVersions = (remoteListing: string): RemotePakVersionSummary => {
  const versionByValue = new Map<string, RemotePakVersion>()
  const pakFiles: string[] = []
  for (const rawLine of String(remoteListing || '').split(/\r?\n/)) {
    const fileName = rawLine.trim()
    if (fileName.toLowerCase().endsWith('.pak')) {
      pakFiles.push(fileName)
    }
    const version = parsePakVersionFromName(fileName)
    if (!version) {
      continue
    }
    const existing = versionByValue.get(version)
    if (existing) {
      existing.count += 1
      continue
    }
    versionByValue.set(version, { fileName, version, count: 1 })
  }

  const versions = [...versionByValue.values()]
    .sort((left, right) => {
      const countDelta = right.count - left.count
      return countDelta !== 0 ? countDelta : comparePakVersion(right.version, left.version)
    })

  return {
    selectedVersion: versions[0]?.version || '',
    latestVersion: versions[0]?.version || '',
    pakFiles,
    versions,
  }
}

export const createRemotePakVersionListStep = (
  packageName = DEFAULT_PACKAGE_NAME,
  gameName = DEFAULT_GAME_NAME,
  deviceSerial?: string,
): PakCommandStep & { remoteDir: string } => {
  const remoteDir = buildAndroidSavedPaksDir(packageName, gameName)
  const deviceArgs = deviceSerial?.trim() ? ['-s', deviceSerial.trim()] : []
  return {
    name: 'List remote Saved/Paks',
    cmd: 'adb',
    args: [...deviceArgs, 'shell', 'ls', '-1', remoteDir],
    remoteDir,
  }
}

export const findLatestGeneratedPakPair = (tempPaksDir: string): GeneratedPakPair => {
  if (!fs.existsSync(tempPaksDir) || !fs.statSync(tempPaksDir).isDirectory()) {
    throw new Error(`Pak 输出目录不存在：${tempPaksDir}`)
  }

  const latestPak = fs.readdirSync(tempPaksDir)
    .filter((name) => name.toLowerCase().endsWith('.pak'))
    .map((name) => {
      const pakPath = path.join(tempPaksDir, name)
      return { name, pakPath, mtimeMs: fs.statSync(pakPath).mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]

  if (!latestPak) {
    throw new Error(`Pak 输出目录里没有 .pak 文件：${tempPaksDir}`)
  }

  const sourceBaseName = latestPak.name.replace(/\.pak$/i, '')
  const sigPath = path.join(tempPaksDir, `${sourceBaseName}.sig`)
  if (!fs.existsSync(sigPath)) {
    throw new Error(`没有找到同名 .sig 文件：${sigPath}`)
  }

  return {
    pakPath: latestPak.pakPath,
    sigPath,
    sourcePakName: latestPak.name,
    sourceSigName: `${sourceBaseName}.sig`,
  }
}

export const listLocalPakFiles = (directory: string): LocalPakFile[] => {
  const resolvedDirectory = normalizeWindowsPath(directory, '')
  if (!resolvedDirectory || !fs.existsSync(resolvedDirectory) || !fs.statSync(resolvedDirectory).isDirectory()) {
    throw new Error(`Pak 目录不存在：${resolvedDirectory || directory}`)
  }

  return fs.readdirSync(resolvedDirectory)
    .filter((name) => name.toLowerCase().endsWith('.pak'))
    .map((name) => {
      const pakPath = path.join(resolvedDirectory, name)
      const pakStat = fs.statSync(pakPath)
      const sourceBaseName = name.replace(/\.pak$/i, '')
      return {
        name,
        path: pakPath,
        size: pakStat.size,
        mtimeMs: pakStat.mtimeMs,
        hasSig: fs.existsSync(path.join(resolvedDirectory, `${sourceBaseName}.sig`)),
      }
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs || left.name.localeCompare(right.name))
}

const resolvePakPushFile = (source: PakPushSource, remotePakFiles?: string[], requireSig = false): PakPushFile => {
  const pakPath = normalizeWindowsPath(source.pakPath, '')
  if (!pakPath || !fs.existsSync(pakPath) || !fs.statSync(pakPath).isFile()) {
    throw new Error(`Pak 文件不存在：${source.pakPath}`)
  }
  if (!pakPath.toLowerCase().endsWith('.pak')) {
    throw new Error(`不是 .pak 文件：${pakPath}`)
  }

  const sourcePakName = path.basename(pakPath)
  const sourceBaseName = sourcePakName.replace(/\.pak$/i, '')
  const sigPath = path.join(path.dirname(pakPath), `${sourceBaseName}.sig`)
  const targetBaseName = source.targetPakName
    ? normalizePakBaseName(source.targetPakName, remotePakFiles)
    : inferPakTargetBaseName(sourcePakName, remotePakFiles)
  const hasSig = fs.existsSync(sigPath)
  if (requireSig && !hasSig) {
    throw new Error(`缺少同名 .sig 文件：${sigPath}`)
  }

  return {
    pakPath,
    sigPath: hasSig ? sigPath : undefined,
    sourcePakName,
    sourceSigName: hasSig ? `${sourceBaseName}.sig` : undefined,
    targetPakName: `${targetBaseName}.pak`,
    targetSigName: hasSig ? `${targetBaseName}.sig` : undefined,
    hasSig,
  }
}

const appendInstallSteps = (
  steps: PakCommandStep[],
  deviceArgs: string[],
  localPath: string,
  remoteDir: string,
  remoteTempDir: string,
  targetName: string,
) => {
  const remoteTempPath = `${remoteTempDir}/${targetName}`
  const remoteTargetPath = `${remoteDir}/${targetName}`
  steps.push(
    {
      name: `Push ${targetName} to adb temp`,
      cmd: 'adb',
      args: [...deviceArgs, 'push', localPath, remoteTempPath],
    },
    createRemoveRemoteTargetStep(deviceArgs, remoteTargetPath, targetName),
    createInstallFromTempStep(deviceArgs, remoteTempPath, remoteTargetPath, targetName),
    createRemoveTempStep(deviceArgs, remoteTempPath, targetName),
  )
}

export const createPakPushFilesPlan = (payload: PakPushFilesPayload): PakPushFilesPlan => {
  const files = payload.sources.map((source) => resolvePakPushFile(source, payload.remotePakFiles, payload.requireSig === true))
  if (!files.length) {
    throw new Error('请选择至少一个 Pak 文件')
  }

  const seenTargets = new Set<string>()
  for (const file of files) {
    const key = file.targetPakName.toLowerCase()
    if (seenTargets.has(key)) {
      throw new Error(`推送目标名重复：${file.targetPakName}`)
    }
    seenTargets.add(key)
  }

  const remoteDir = buildAndroidSavedPaksDir(payload.packageName, payload.gameName)
  const remoteTempDir = '/data/local/tmp/cgtools-pak-push'
  const deviceArgs = payload.deviceSerial?.trim() ? ['-s', payload.deviceSerial.trim()] : []
  const steps: PakCommandStep[] = [
    {
      name: 'Create remote Saved/Paks directory',
      cmd: 'adb',
      args: [...deviceArgs, 'shell', 'mkdir', '-p', remoteDir, remoteTempDir],
    },
  ]

  for (const file of files) {
    appendInstallSteps(steps, deviceArgs, file.pakPath, remoteDir, remoteTempDir, file.targetPakName)
    if (file.sigPath && file.targetSigName) {
      appendInstallSteps(steps, deviceArgs, file.sigPath, remoteDir, remoteTempDir, file.targetSigName)
    }
  }

  return {
    files,
    remoteDir,
    remoteTempDir,
    steps,
  }
}

export const createPakPushPlan = (payload: PakPushPayload): PakPushPlan => {
  const pair = findLatestGeneratedPakPair(payload.tempPaksDir)
  const plan = createPakPushFilesPlan({
    sources: [{ pakPath: pair.pakPath, targetPakName: payload.targetPakName }],
    packageName: payload.packageName,
    gameName: payload.gameName,
    deviceSerial: payload.deviceSerial,
  })
  const file = plan.files[0]

  return {
    ...pair,
    targetPakName: file.targetPakName,
    targetSigName: file.targetSigName || `${file.targetPakName.replace(/\.pak$/i, '')}.sig`,
    remoteDir: plan.remoteDir,
    remoteTempDir: plan.remoteTempDir,
    steps: plan.steps,
  }
}

export const createRemotePakDeletePlan = (payload: RemotePakDeletePayload): RemotePakDeletePlan => {
  const fileNames = payload.fileNames.map(normalizeRemotePakFileName)
  if (!fileNames.length) {
    throw new Error('请选择至少一个手机 Pak')
  }

  const remoteDir = buildAndroidSavedPaksDir(payload.packageName, payload.gameName)
  const deviceArgs = payload.deviceSerial?.trim() ? ['-s', payload.deviceSerial.trim()] : []
  const remoteTargets = fileNames.flatMap((fileName) => {
    const sigName = `${fileName.replace(/\.pak$/i, '')}.sig`
    return [`${remoteDir}/${fileName}`, `${remoteDir}/${sigName}`]
  })

  return {
    fileNames,
    remoteDir,
    steps: [{
      name: `Delete ${fileNames.length} remote pak file(s)`,
      cmd: 'adb',
      args: [...deviceArgs, 'shell', 'rm', '-f', ...remoteTargets],
    }],
  }
}

export const buildPakToolPathsFromProjectRoot = (rawProjectRoot = DEFAULT_PROJECT_ROOT): PakToolPaths => {
  const projectRoot = normalizeWindowsPath(rawProjectRoot, DEFAULT_PROJECT_ROOT)
  const toolDir = path.join(projectRoot, 'Survive', 'Paktools', 'CookAndPakAsset')
  const exePath = path.join(toolDir, 'Do.bat')

  return {
    projectRoot,
    exePath,
    toolDir,
    batPath: exePath,
    tempPaksDir: path.join(toolDir, 'Temp', 'Paks'),
    mainPyPath: path.join(toolDir, 'Script', 'Do.py'),
  }
}

const inferProjectRootFromExe = (exePath: string) => {
  const normalizedExePath = normalizeWindowsPath(exePath, DEFAULT_PAK_TOOL_EXE)
  const marker = '\\Survive\\Paktools\\CookAndPakAsset\\Do.bat'
  if (normalizedExePath.toLowerCase().endsWith(marker.toLowerCase())) {
    return normalizedExePath.slice(0, -marker.length)
  }
  return DEFAULT_PROJECT_ROOT
}

export const buildPakToolPaths = (rawExePath = DEFAULT_PAK_TOOL_EXE, rawProjectRoot?: string): PakToolPaths => {
  const exePath = normalizeWindowsPath(rawExePath, DEFAULT_PAK_TOOL_EXE)
  const projectRoot = rawProjectRoot
    ? normalizeWindowsPath(rawProjectRoot, DEFAULT_PROJECT_ROOT)
    : inferProjectRootFromExe(exePath)
  const toolDir = path.dirname(exePath)

  return {
    projectRoot,
    exePath,
    toolDir,
    batPath: exePath.toLowerCase().endsWith('\\do.bat') ? exePath : path.join(toolDir, 'Do.bat'),
    tempPaksDir: path.join(toolDir, 'Temp', 'Paks'),
    mainPyPath: path.join(toolDir, 'Script', 'Do.py'),
  }
}

export const getPakToolStatus = (rawExePath = DEFAULT_PAK_TOOL_EXE, rawProjectRoot?: string): PakToolStatus => {
  const paths = rawProjectRoot
    ? buildPakToolPathsFromProjectRoot(rawProjectRoot)
    : buildPakToolPaths(rawExePath)
  let latestGeneratedPak: GeneratedPakPair | undefined
  try {
    latestGeneratedPak = findLatestGeneratedPakPair(paths.tempPaksDir)
  } catch {
    latestGeneratedPak = undefined
  }

  return {
    ...paths,
    latestGeneratedPak,
    detected: {
      windows: process.platform === 'win32',
      projectRootExists: fs.existsSync(paths.projectRoot),
      exeExists: fs.existsSync(paths.exePath),
      toolDirExists: fs.existsSync(paths.toolDir),
      batExists: fs.existsSync(paths.batPath),
      tempPaksDirExists: fs.existsSync(paths.tempPaksDir),
      mainPyExists: fs.existsSync(paths.mainPyPath),
    },
  }
}

export const createPakToolLaunchPlan = (rawExePath = DEFAULT_PAK_TOOL_EXE, rawProjectRoot?: string): PakToolLaunchPlan => {
  const paths = rawProjectRoot
    ? buildPakToolPathsFromProjectRoot(rawProjectRoot)
    : buildPakToolPaths(rawExePath)

  return {
    cmd: paths.exePath,
    args: [],
    cwd: paths.toolDir,
  }
}

export const validatePakToolLaunch = (rawExePath = DEFAULT_PAK_TOOL_EXE, rawProjectRoot?: string) => {
  const status = getPakToolStatus(rawExePath, rawProjectRoot)
  const errors: string[] = []

  if (!status.detected.windows) {
    errors.push('CookAndPakAsset 目前仅支持在 Windows 上启动。')
  }
  if (!status.detected.projectRootExists) {
    errors.push(`项目 Root 不存在：${status.projectRoot}`)
  }
  if (!status.detected.exeExists) {
    errors.push(`Do.bat 不存在：${status.exePath}`)
  }
  if (!status.detected.toolDirExists) {
    errors.push(`CookAndPakAsset 工具目录不存在：${status.toolDir}`)
  }

  return {
    status,
    errors,
  }
}
