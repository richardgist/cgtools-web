import { createError, defineEventHandler, readBody } from 'h3'
import { spawn } from 'node:child_process'
import {
  DEFAULT_GAME_NAME,
  DEFAULT_PACKAGE_NAME,
  createRemotePakVersionListStep,
  extractRemotePakVersions,
  type PakCommandStep,
} from '../../utils/pakToolPlus'

type RemotePakVersionBody = {
  packageName?: string
  gameName?: string
  deviceSerial?: string
}

const runStep = async (step: PakCommandStep) => {
  return await new Promise<{ code: number, stdout: string, stderr: string }>((resolve) => {
    const child = spawn(step.cmd, step.args, {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })

    child.on('error', (error: Error) => {
      resolve({ code: 1, stdout, stderr: stderr + error.message })
    })

    child.on('close', (code: number | null) => {
      resolve({ code: typeof code === 'number' ? code : 1, stdout, stderr })
    })
  })
}

export default defineEventHandler(async (event) => {
  const body = await readBody<RemotePakVersionBody>(event)
  const packageName = typeof body.packageName === 'string' && body.packageName.trim()
    ? body.packageName.trim()
    : DEFAULT_PACKAGE_NAME
  const gameName = typeof body.gameName === 'string' && body.gameName.trim()
    ? body.gameName.trim()
    : DEFAULT_GAME_NAME
  const deviceSerial = typeof body.deviceSerial === 'string' ? body.deviceSerial.trim() : ''
  const step = createRemotePakVersionListStep(packageName, gameName, deviceSerial)
  const result = await runStep(step)

  if (result.code !== 0) {
    throw createError({
      statusCode: 400,
      statusMessage: result.stderr.trim() || result.stdout.trim() || '读取手机 Saved/Paks 目录失败',
      data: {
        remoteDir: step.remoteDir,
        stdout: result.stdout,
        stderr: result.stderr,
      },
    })
  }

  const summary = extractRemotePakVersions(result.stdout)
  if (!summary.selectedVersion) {
    throw createError({
      statusCode: 404,
      statusMessage: '手机 Saved/Paks 下没有找到可解析版本号的 .pak',
      data: {
        remoteDir: step.remoteDir,
        stdout: result.stdout,
      },
    })
  }

  return {
    success: true,
    remoteDir: step.remoteDir,
    rawListing: result.stdout,
    ...summary,
  }
})
