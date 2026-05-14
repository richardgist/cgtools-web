import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_PROJECT_ROOT = 'E:\\CJGame\\trunk'
export const DEFAULT_PAK_TOOL_EXE = 'E:\\CJGame\\trunk\\Survive\\Paktools\\CookAndPakAssetPlus\\PakToolPlus.exe'
export const DEFAULT_PACKAGE_NAME = 'com.tencent.tmgp.pubgmhd'
export const DEFAULT_GAME_NAME = 'ShadowTrackerExtra'
export const DEFAULT_PATCH_PREFIX = 'tex_patch_'

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

export const normalizePakBaseName = (rawName: string) => {
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
  const suffix = withoutExt.replace(/^(?:game|core|tex|test)_patch_/i, '')
  if (!suffix) {
    throw new Error('pak 名称缺少版本或用途后缀')
  }
  return `${DEFAULT_PATCH_PREFIX}${suffix}`
}

export const buildAndroidSavedPaksDir = (
  packageName = DEFAULT_PACKAGE_NAME,
  gameName = DEFAULT_GAME_NAME,
) => {
  const safePackageName = String(packageName || '').trim() || DEFAULT_PACKAGE_NAME
  const safeGameName = String(gameName || '').trim() || DEFAULT_GAME_NAME
  return `/sdcard/Android/data/${safePackageName}/files/UE4Game/${safeGameName}/${safeGameName}/Saved/Paks`
}

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

export const createPakPushPlan = (payload: PakPushPayload): PakPushPlan => {
  const pair = findLatestGeneratedPakPair(payload.tempPaksDir)
  const targetBaseName = normalizePakBaseName(payload.targetPakName)
  const targetPakName = `${targetBaseName}.pak`
  const targetSigName = `${targetBaseName}.sig`
  const remoteDir = buildAndroidSavedPaksDir(payload.packageName, payload.gameName)
  const deviceArgs = payload.deviceSerial?.trim() ? ['-s', payload.deviceSerial.trim()] : []

  return {
    ...pair,
    targetPakName,
    targetSigName,
    remoteDir,
    steps: [
      {
        name: 'Create remote Saved/Paks directory',
        cmd: 'adb',
        args: [...deviceArgs, 'shell', 'mkdir', '-p', remoteDir],
      },
      {
        name: `Push ${targetPakName}`,
        cmd: 'adb',
        args: [...deviceArgs, 'push', pair.pakPath, `${remoteDir}/${targetPakName}`],
      },
      {
        name: `Push ${targetSigName}`,
        cmd: 'adb',
        args: [...deviceArgs, 'push', pair.sigPath, `${remoteDir}/${targetSigName}`],
      },
    ],
  }
}

export const buildPakToolPathsFromProjectRoot = (rawProjectRoot = DEFAULT_PROJECT_ROOT): PakToolPaths => {
  const projectRoot = normalizeWindowsPath(rawProjectRoot, DEFAULT_PROJECT_ROOT)
  const toolDir = path.join(projectRoot, 'Survive', 'Paktools', 'CookAndPakAssetPlus')
  const exePath = path.join(toolDir, 'PakToolPlus.exe')

  return {
    projectRoot,
    exePath,
    toolDir,
    batPath: path.join(toolDir, 'PakToolPlus.bat'),
    tempPaksDir: path.join(toolDir, 'Temp', 'Paks'),
    mainPyPath: path.join(toolDir, 'src', 'main.py'),
  }
}

const inferProjectRootFromExe = (exePath: string) => {
  const normalizedExePath = normalizeWindowsPath(exePath, DEFAULT_PAK_TOOL_EXE)
  const marker = '\\Survive\\Paktools\\CookAndPakAssetPlus\\PakToolPlus.exe'
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
    batPath: path.join(toolDir, 'PakToolPlus.bat'),
    tempPaksDir: path.join(toolDir, 'Temp', 'Paks'),
    mainPyPath: path.join(toolDir, 'src', 'main.py'),
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
    errors.push('PakToolPlus 目前仅支持在 Windows 上启动。')
  }
  if (!status.detected.projectRootExists) {
    errors.push(`项目 Root 不存在：${status.projectRoot}`)
  }
  if (!status.detected.exeExists) {
    errors.push(`PakToolPlus.exe 不存在：${status.exePath}`)
  }
  if (!status.detected.toolDirExists) {
    errors.push(`PakToolPlus 工具目录不存在：${status.toolDir}`)
  }

  return {
    status,
    errors,
  }
}
