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
  p4Parallel?: boolean
  dryRun?: boolean
}

const UPDATE_CODE_ASSETS_SCRIPT = path.resolve(process.cwd(), 'server', 'scripts', 'update-code-assets.py')
const UPDATE_CODE_ASSETS_PATHS_INI = path.resolve(process.cwd(), 'server', 'config', 'android-so-update-paths.ini')

export interface P4ClientRootMatch {
  client: string
  root: string
}

const quoteArg = (value: string) => {
  if (value.length === 0) return '""'
  return /[\s"&|<>^]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

const renderCommand = (cmd: string, args: string[], cwd?: string) => {
  const commandLine = [quoteArg(cmd), ...args.map(quoteArg)].join(' ')
  return cwd ? `(cwd=${cwd}) ${commandLine}` : commandLine
}

const normalizeP4RootPath = (value: string) => {
  const normalized = String(value || '').trim().replace(/\//g, '\\')
  if (/^[A-Za-z]:\\?$/.test(normalized)) {
    return `${normalized.slice(0, 2).toUpperCase()}\\`
  }
  return normalized.replace(/[\\]+$/, '')
}

const isPathUnderRoot = (targetPath: string, rootPath: string) => {
  const target = normalizeP4RootPath(targetPath).toLowerCase()
  const root = normalizeP4RootPath(rootPath).toLowerCase()
  if (!target || !root) {
    return false
  }
  if (/^[a-z]:\\$/.test(root)) {
    return target.startsWith(root)
  }
  return target === root || target.startsWith(`${root}\\`)
}

const parseP4ClientMapping = (value: string): P4ClientRootMatch | null => {
  const [root = '', client = ''] = String(value || '').split('|').map((item) => item.trim())
  return root && client ? { root, client } : null
}

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

interface P4SafePathsRootConfig {
  name: string
  base: string
  paths: string[]
  expandChildren: string[]
}

interface P4SafePathsIniConfig {
  roots: P4SafePathsRootConfig[]
  excludeChildDirs: string[]
  p4ClientMappings: P4ClientRootMatch[]
  svnUpdatePaths: string[]
}

type RawIniSection = Record<string, string | string[]>
type RawIni = Record<string, RawIniSection>

const asIniArray = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean)
  return typeof value === 'string' && value.trim() ? [value.trim()] : []
}

const parseP4SafePathsIni = (text: string): P4SafePathsIniConfig => {
  const rawIni: RawIni = {}
  let currentSection = ''

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue
    }

    const sectionMatch = line.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      currentSection = (sectionMatch[1] || '').trim()
      rawIni[currentSection] ||= {}
      continue
    }

    const keyMatch = line.match(/^(\+?[^=]+)=(.*)$/)
    if (!keyMatch || !currentSection) {
      continue
    }

    const rawKey = keyMatch[1] || ''
    const rawValue = keyMatch[2] || ''
    const isArrayEntry = rawKey.trim().startsWith('+')
    const key = rawKey.trim().replace(/^\+/, '')
    const value = rawValue.trim()
    rawIni[currentSection] ||= {}
    const section = rawIni[currentSection]
    if (!section) {
      continue
    }
    if (isArrayEntry) {
      const previous = section[key]
      section[key] = [...asIniArray(previous), value].filter(Boolean)
    } else {
      section[key] = value
    }
  }

  const roots = Object.entries(rawIni)
    .filter(([sectionName]) => sectionName.toLowerCase().startsWith('root:'))
    .map(([sectionName, section]) => ({
      name: sectionName.slice('Root:'.length),
      base: typeof section.Base === 'string' ? section.Base.trim() : '',
      paths: asIniArray(section.Paths),
      expandChildren: asIniArray(section.ExpandChildren),
    }))
    .filter((root) => root.base)

  return {
    roots,
    excludeChildDirs: asIniArray(rawIni.Exclude?.ChildDirs),
    p4ClientMappings: asIniArray(rawIni.P4Client?.Mapping)
      .map(parseP4ClientMapping)
      .filter((mapping): mapping is P4ClientRootMatch => !!mapping),
    svnUpdatePaths: asIniArray(rawIni.SVN?.UpdatePath),
  }
}

export const resolveP4ClientFromIniText = (iniText: string, projectRoot: string): P4ClientRootMatch | null => {
  const config = parseP4SafePathsIni(iniText)
  const matches = config.p4ClientMappings
    .filter((mapping) => isPathUnderRoot(projectRoot, mapping.root))
    .sort((left, right) => normalizeP4RootPath(right.root).length - normalizeP4RootPath(left.root).length)

  return matches[0] || null
}

const isSafeP4ChildDir = (entry: fs.Dirent, excludedNames: Set<string>) => entry.isDirectory() && !excludedNames.has(entry.name.toLowerCase())

const listSafeP4ChildDirs = (dir: string, excludedNames: Set<string>) => {
  if (!fs.existsSync(dir)) {
    return []
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => isSafeP4ChildDir(entry, excludedNames))
    .map((entry) => path.join(dir, entry.name))
}

const normalizeRelativePathKey = (value: string) => path.normalize(value || '').toLowerCase()

const expandP4SyncPath = (syncPath: string, shouldExpand: boolean, excludedNames: Set<string>) => {
  const normalizedPath = path.normalize(syncPath)
  // 只有 INI 中显式列入 +ExpandChildren 的目录才会按下一层子目录展开。
  if (shouldExpand) {
    return listSafeP4ChildDirs(normalizedPath, excludedNames)
  }
  return [normalizedPath]
}

export const resolveP4SyncPathsFromIniText = (iniText: string, projectRoot: string) => {
  const config = parseP4SafePathsIni(iniText)
  const excludedNames = new Set(config.excludeChildDirs.map((item) => item.toLowerCase()))
  const resolvedPaths = config.roots.flatMap((rootConfig) => {
    const rootDir = path.join(projectRoot, rootConfig.base)
    const expandSet = new Set(rootConfig.expandChildren.map(normalizeRelativePathKey))
    return rootConfig.paths.flatMap((relativePath) => {
      const shouldExpand = expandSet.has(normalizeRelativePathKey(relativePath))
      return expandP4SyncPath(path.join(rootDir, relativePath), shouldExpand, excludedNames)
    })
  })
  return [...new Set(resolvedPaths.map((item) => path.normalize(item)))]
}

export const resolveSvnUpdatePathsFromIniText = (iniText: string, projectRoot: string, fallbackPath: string) => {
  const config = parseP4SafePathsIni(iniText)
  const configuredPaths = config.svnUpdatePaths.length > 0 ? config.svnUpdatePaths : [fallbackPath]
  return [...new Set(configuredPaths
    .map((item) => path.isAbsolute(item) ? item : path.join(projectRoot, item))
    .map((item) => path.normalize(item)))]
}

const readConfiguredP4SyncPaths = (projectRoot: string) => {
  if (!fs.existsSync(UPDATE_CODE_ASSETS_PATHS_INI)) {
    return []
  }
  return resolveP4SyncPathsFromIniText(fs.readFileSync(UPDATE_CODE_ASSETS_PATHS_INI, 'utf-8'), projectRoot)
}

const readConfiguredP4Client = (projectRoot: string) => {
  if (!fs.existsSync(UPDATE_CODE_ASSETS_PATHS_INI)) {
    return null
  }
  return resolveP4ClientFromIniText(fs.readFileSync(UPDATE_CODE_ASSETS_PATHS_INI, 'utf-8'), projectRoot)
}

const readConfiguredSvnUpdatePaths = (projectRoot: string, fallbackPath: string) => {
  if (!fs.existsSync(UPDATE_CODE_ASSETS_PATHS_INI)) {
    return [fallbackPath]
  }
  return resolveSvnUpdatePathsFromIniText(fs.readFileSync(UPDATE_CODE_ASSETS_PATHS_INI, 'utf-8'), projectRoot, fallbackPath)
}

const buildVersionUpdateArgs = (
  step: 'p4' | 'svn',
  versionUpdateText: string,
  svnUpdatePaths: string[],
  p4SyncPaths: string[],
  useParallel: boolean,
  dryRun: boolean,
) => {
  const primarySvnPath = svnUpdatePaths[0] || ''
  const args = [
    UPDATE_CODE_ASSETS_SCRIPT,
    '--step',
    step,
    '--version-text',
    versionUpdateText,
    '--svn-update-path',
    primarySvnPath,
    '--svn-update-paths-json',
    JSON.stringify(svnUpdatePaths),
    '--p4-sync-paths-json',
    JSON.stringify(p4SyncPaths),
    '--parallel',
    useParallel ? 'true' : 'false',
  ]
  if (dryRun) {
    args.push('--dry-run')
  }
  return args
}

export const buildUpdateCodeAssetsPlan = (payload: UpdateCodeAssetsPayload): JobPlan => {
  const errors: string[] = []
  const warnings: string[] = []
  const projectRoot = payload.projectRoot || ''
  const projectDir = (payload.svnUpdatePath || '').trim() || path.join(projectRoot, 'Survive')
  const svnUpdatePaths = readConfiguredSvnUpdatePaths(projectRoot, projectDir)
  const versionInfo = parseBuildVersionUpdateText(payload.versionUpdateText || '')
  const hasAssetVersions = !!(versionInfo.mergedP4Head || versionInfo.p4Merge.length)
  const hasSvnVersions = !!(versionInfo.mergedSvnHead || versionInfo.svnMerge.length)
  const p4SyncPaths = readConfiguredP4SyncPaths(projectRoot)
  const p4ClientMatch = hasAssetVersions ? readConfiguredP4Client(projectRoot) : null
  const steps: CommandStep[] = []

  addValidation(errors, process.platform === 'win32', 'Only Windows is supported for this flow.')
  addValidation(errors, fs.existsSync(projectRoot), `projectRoot not found: ${projectRoot}`)
  for (const svnUpdatePath of svnUpdatePaths) {
    addValidation(errors, fs.existsSync(svnUpdatePath), `SVN update path not found: ${svnUpdatePath}`)
  }
  addValidation(errors, hasAssetVersions || hasSvnVersions, 'Version update text did not contain MergedP4Head/MergedSvnHead/P4Merge/SVNMerge.')
  addValidation(errors, fs.existsSync(UPDATE_CODE_ASSETS_SCRIPT), `Version update script not found: ${UPDATE_CODE_ASSETS_SCRIPT}`)
  addValidation(errors, fs.existsSync(UPDATE_CODE_ASSETS_PATHS_INI), `P4 safe paths INI not found: ${UPDATE_CODE_ASSETS_PATHS_INI}`)

  if (hasAssetVersions) {
    addValidation(errors, p4SyncPaths.length > 0, `No safe P4 sync paths found. Configure ${UPDATE_CODE_ASSETS_PATHS_INI}.`)
    for (const p4Path of p4SyncPaths) {
      addValidation(errors, fs.existsSync(p4Path), `P4 sync path not found: ${p4Path}`)
    }
  }

  steps.push({
    name: 'Update Assets (P4)',
    cmd: 'python',
    args: buildVersionUpdateArgs('p4', payload.versionUpdateText || '', svnUpdatePaths, p4SyncPaths, payload.p4Parallel !== false, payload.dryRun === true),
    cwd: projectRoot,
    env: p4ClientMatch ? { P4CLIENT: p4ClientMatch.client } : undefined,
  })

  steps.push({
    name: 'Update SVN',
    cmd: 'python',
    args: buildVersionUpdateArgs('svn', payload.versionUpdateText || '', svnUpdatePaths, p4SyncPaths, payload.p4Parallel !== false, payload.dryRun === true),
    cwd: svnUpdatePaths[0] || projectDir,
  })

  warnings.push(`Parsed version text: P4@${versionInfo.mergedP4Head || '-'}, SVN@${versionInfo.mergedSvnHead || '-'}, P4Merge=${versionInfo.p4Merge.join(',') || '-'}, SVNMerge=${versionInfo.svnMerge.join(',') || '-'}`)
  if (hasAssetVersions) {
    if (p4ClientMatch) {
      // P4CLIENT 只对当前 P4 同步子进程生效，避免污染启动 web-ui 的全局环境。
      warnings.push(`P4 client configured: ${p4ClientMatch.client} (root=${p4ClientMatch.root})`)
    } else {
      warnings.push(`P4 client mapping not configured for project root: ${projectRoot}; current P4 environment will be used.`)
    }
    warnings.push(`P4 safe sync paths: ${p4SyncPaths.join('; ')}`)
  }
  if (hasSvnVersions) {
    warnings.push(`SVN update paths: ${svnUpdatePaths.join('; ')}`)
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
