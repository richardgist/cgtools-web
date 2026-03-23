import { defineEventHandler, getQuery } from 'h3'
import * as fs from 'fs'
import * as path from 'path'
import { spawnSync } from 'child_process'

const DEFAULT_PROJECT_ROOT = 'C:\\CJGame\\PRE418'

const normalizeProjectRoot = (value: string) => {
  const normalized = String(value || '').trim().replace(/\//g, '\\')
  if (!normalized) {
    return DEFAULT_PROJECT_ROOT
  }
  if (/^[A-Za-z]:\\?$/.test(normalized)) {
    return `${normalized.slice(0, 2)}\\`
  }
  return normalized.replace(/[\\]+$/, '')
}

const buildSharedPaths = (projectRoot: string) => {
  const resolvedProjectRoot = normalizeProjectRoot(projectRoot)
  return {
    projectRoot: resolvedProjectRoot,
    projectFile: path.join(resolvedProjectRoot, 'Survive', 'ShadowTrackerExtra.uproject'),
    engineRoot: path.join(resolvedProjectRoot, 'UE4181', 'Engine'),
    ueAppToolsExe: path.join(resolvedProjectRoot, 'Survive', 'Tools', 'UEAppTools', 'build', 'Release', 'UEAppTools.exe'),
    androidInjectDir: path.join(resolvedProjectRoot, 'Survive', 'ExternalTools', 'AndroidInject'),
  }
}

const probeCommand = (cmd: string, args: string[]) => {
  const result = spawnSync(cmd, args, {
    encoding: 'utf-8',
    shell: false,
    windowsHide: true,
  })
  return result.status === 0
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedProjectRoot = typeof query.projectRoot === 'string' ? query.projectRoot : DEFAULT_PROJECT_ROOT
  const {
    projectRoot,
    projectFile,
    engineRoot,
    ueAppToolsExe,
    androidInjectDir,
  } = buildSharedPaths(requestedProjectRoot)

  const injectDemoPath = path.join(androidInjectDir, 'inject_demo')
  const injectEntryPath = path.join(androidInjectDir, 'lib_inject_entry.so')

  const adbAvailable = process.platform === 'win32'
    ? probeCommand('adb', ['version']) || probeCommand('where', ['adb'])
    : probeCommand('adb', ['version']) || probeCommand('which', ['adb'])

  return {
    projectRoot,
    projectFile,
    engineRoot,
    ueAppToolsExe,
    androidInjectDir,
    detected: {
      windows: process.platform === 'win32',
      adbAvailable,
      projectRootExists: fs.existsSync(projectRoot),
      projectFileExists: fs.existsSync(projectFile),
      engineRootExists: fs.existsSync(engineRoot),
      ueAppToolsExists: fs.existsSync(ueAppToolsExe),
      androidInjectDirExists: fs.existsSync(androidInjectDir),
      injectDemoExists: fs.existsSync(injectDemoPath),
      injectEntrySoExists: fs.existsSync(injectEntryPath),
    },
  }
})
