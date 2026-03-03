import { defineEventHandler } from 'h3'
import * as fs from 'fs'
import * as path from 'path'
import { spawnSync } from 'child_process'

const probeCommand = (cmd: string, args: string[]) => {
  const result = spawnSync(cmd, args, {
    encoding: 'utf-8',
    shell: false,
    windowsHide: true,
  })
  return result.status === 0
}

export default defineEventHandler(async () => {
  const projectRoot = 'C:\\CJGame\\PRE418'
  const projectFile = path.join(projectRoot, 'Survive', 'ShadowTrackerExtra.uproject')
  const engineRoot = path.join(projectRoot, 'UE4181', 'Engine')
  const ueAppToolsExe = path.join(projectRoot, 'Survive', 'Tools', 'UEAppTools', 'build', 'Release', 'UEAppTools.exe')
  const androidInjectDir = path.join(projectRoot, 'Survive', 'ExternalTools', 'AndroidInject')

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

