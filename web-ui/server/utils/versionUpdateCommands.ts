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
  dryRun?: boolean
}

const SAFE_P4_CHILD_DIR_EXCLUDES = new Set(['.git', '.svn', 'Binaries', 'DerivedDataCache', 'Intermediate', 'Saved'])
const UPDATE_CODE_ASSETS_SCRIPT = path.resolve(process.cwd(), 'server', 'scripts', 'update-code-assets.py')

const quoteArg = (value: string) => {
  if (value.length === 0) return '""'
  return /[\s"&|<>^]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

const renderCommand = (cmd: string, args: string[], cwd?: string) => {
  const commandLine = [quoteArg(cmd), ...args.map(quoteArg)].join(' ')
  return cwd ? `(cwd=${cwd}) ${commandLine}` : commandLine
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

const isSafeP4ChildDir = (entry: fs.Dirent) => entry.isDirectory() && !SAFE_P4_CHILD_DIR_EXCLUDES.has(entry.name)

const listSafeP4ChildDirs = (dir: string) => {
  if (!fs.existsSync(dir)) {
    return []
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(isSafeP4ChildDir)
    .map((entry) => path.join(dir, entry.name))
}

const expandP4SyncPath = (syncPath: string) => {
  const normalizedPath = path.normalize(syncPath)
  // Content 目录文件量大且容易触发外层目录锁问题，按一层子目录拆开独立同步。
  if (path.basename(normalizedPath).toLowerCase() === 'content' && fs.existsSync(normalizedPath)) {
    return listSafeP4ChildDirs(normalizedPath)
  }
  return [normalizedPath]
}

const normalizeP4SyncPaths = (projectDir: string, projectRoot: string, requestedPaths?: string[]) => {
  const explicitPaths = (requestedPaths || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => path.isAbsolute(item) ? item : path.join(projectRoot || '', item))

  if (explicitPaths.length > 0) {
    return [...new Set(explicitPaths.flatMap(expandP4SyncPath))]
  }

  if (!fs.existsSync(projectDir)) {
    return []
  }

  // P4 不能直接同步 Survive 外层目录；默认拆成一层子目录，并对 Content 再拆一层。
  return [...new Set(listSafeP4ChildDirs(projectDir).flatMap(expandP4SyncPath))]
}

const buildVersionUpdateArgs = (
  step: 'p4' | 'svn',
  versionUpdateText: string,
  svnUpdatePath: string,
  p4SyncPaths: string[],
  useParallel: boolean,
  dryRun: boolean,
) => {
  const args = [
    UPDATE_CODE_ASSETS_SCRIPT,
    '--step',
    step,
    '--version-text',
    versionUpdateText,
    '--svn-update-path',
    svnUpdatePath,
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
  const versionInfo = parseBuildVersionUpdateText(payload.versionUpdateText || '')
  const hasAssetVersions = !!(versionInfo.mergedP4Head || versionInfo.p4Merge.length)
  const hasSvnVersions = !!(versionInfo.mergedSvnHead || versionInfo.svnMerge.length)
  const p4SyncPaths = normalizeP4SyncPaths(projectDir, projectRoot, payload.p4SyncPaths)
  const steps: CommandStep[] = []

  addValidation(errors, process.platform === 'win32', 'Only Windows is supported for this flow.')
  addValidation(errors, fs.existsSync(projectRoot), `projectRoot not found: ${projectRoot}`)
  addValidation(errors, fs.existsSync(projectDir), `SVN update path not found: ${projectDir}`)
  addValidation(errors, hasAssetVersions || hasSvnVersions, 'Version update text did not contain MergedP4Head/MergedSvnHead/P4Merge/SVNMerge.')
  addValidation(errors, fs.existsSync(UPDATE_CODE_ASSETS_SCRIPT), `Version update script not found: ${UPDATE_CODE_ASSETS_SCRIPT}`)

  if (hasAssetVersions) {
    addValidation(errors, p4SyncPaths.length > 0, 'No safe P4 sync paths found. Configure p4SyncPaths instead of syncing the outer project directory.')
    for (const p4Path of p4SyncPaths) {
      addValidation(errors, fs.existsSync(p4Path), `P4 sync path not found: ${p4Path}`)
    }
  }

  steps.push({
    name: 'Update Assets (P4)',
    cmd: 'python',
    args: buildVersionUpdateArgs('p4', payload.versionUpdateText || '', projectDir, p4SyncPaths, payload.p4Parallel !== false, payload.dryRun === true),
    cwd: projectRoot,
  })

  steps.push({
    name: 'Update SVN',
    cmd: 'python',
    args: buildVersionUpdateArgs('svn', payload.versionUpdateText || '', projectDir, p4SyncPaths, payload.p4Parallel !== false, payload.dryRun === true),
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
