import { createError, defineEventHandler, readBody } from 'h3'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import {
  getConsoleCommandLogsDir,
  loadLatestConsoleCommandSnapshot,
} from '../../../utils/ueConsoleCommands'

type SyncBody = {
  packageName?: string
  deviceSerial?: string
}

const DEFAULT_PACKAGE_NAME = 'com.tencent.tmgp.pubgmhd'
const DEFAULT_GAME_NAME = 'ShadowTrackerExtra'

const getTimestamp = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '_',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('')
}

const runAdb = (args: string[]) => new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
  const child = spawn('adb', args, {
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', CGTOOLS_WEB_RUNNER: '1' },
    windowsHide: true,
  })

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8') })
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8') })

  child.on('error', (error) => reject(error))
  child.on('close', (code) => {
    if (code === 0) {
      resolve({ stdout, stderr })
      return
    }

    reject(new Error((stderr || stdout || `adb pull failed with code ${code}`).trim()))
  })
})

const getRemoteCandidates = (packageName: string) => [
  `/sdcard/Android/data/${packageName}/files/UE4Game/${DEFAULT_GAME_NAME}/${DEFAULT_GAME_NAME}/Saved/Profiling/CVar/CVarList.csv`,
  `/sdcard/Android/data/${packageName}/files/UE4Game/${DEFAULT_GAME_NAME}/Saved/Profiling/CVar/CVarList.csv`,
  `/sdcard/UE4Game/${DEFAULT_GAME_NAME}/${DEFAULT_GAME_NAME}/Saved/Profiling/CVar/CVarList.csv`,
  `/sdcard/UE4Game/${DEFAULT_GAME_NAME}/Saved/Profiling/CVar/CVarList.csv`,
]

const testRemoteFile = async (deviceSerial: string, remotePath: string) => {
  const adbArgs = [
    ...(deviceSerial ? ['-s', deviceSerial] : []),
    'shell',
    'if',
    '[',
    '-f',
    remotePath,
    '];',
    'then',
    'echo',
    'FOUND;',
    'else',
    'echo',
    'MISSING;',
    'fi',
  ]
  const { stdout } = await runAdb(adbArgs)
  return stdout.includes('FOUND')
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SyncBody>(event)
  const packageName = body.packageName?.trim() || DEFAULT_PACKAGE_NAME
  const deviceSerial = body.deviceSerial?.trim() || ''
  const remoteCandidates = getRemoteCandidates(packageName)
  const logsDir = getConsoleCommandLogsDir()
  fs.mkdirSync(logsDir, { recursive: true })

  const outputPath = path.join(logsDir, `CVar_${getTimestamp()}.csv`)

  try {
    let remotePath = ''
    for (const candidate of remoteCandidates) {
      if (await testRemoteFile(deviceSerial, candidate)) {
        remotePath = candidate
        break
      }
    }

    if (!remotePath) {
      throw new Error(`设备上没有找到 CVarList.csv，已尝试：${remoteCandidates.join(' ; ')}`)
    }

    await runAdb([
      ...(deviceSerial ? ['-s', deviceSerial] : []),
      'pull',
      remotePath,
      outputPath,
    ])
    return {
      success: true,
      remotePath,
      outputPath,
      ...loadLatestConsoleCommandSnapshot(),
    }
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error instanceof Error ? error.message : '同步 UE Console 命令失败',
    })
  }
})
