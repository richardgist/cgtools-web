import { createError, defineEventHandler, readBody } from 'h3'
import { spawn } from 'node:child_process'
import {
  DEFAULT_GAME_NAME,
  DEFAULT_PACKAGE_NAME,
  createPakPushFilesPlan,
  type PakCommandStep,
} from '../../utils/pakToolPlus'

type PushFilesBody = {
  files?: Array<{
    path?: string
    targetPakName?: string
  }>
  packageName?: string
  gameName?: string
  deviceSerial?: string
}

type StepResult = {
  name: string
  code: number
  stdout: string
  stderr: string
}

const runStep = async (step: PakCommandStep): Promise<StepResult> => {
  return await new Promise<StepResult>((resolve) => {
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
      resolve({ name: step.name, code: 1, stdout, stderr: stderr + error.message })
    })

    child.on('close', (code: number | null) => {
      resolve({ name: step.name, code: typeof code === 'number' ? code : 1, stdout, stderr })
    })
  })
}

export default defineEventHandler(async (event) => {
  const body = await readBody<PushFilesBody>(event)
  const packageName = typeof body.packageName === 'string' && body.packageName.trim()
    ? body.packageName.trim()
    : DEFAULT_PACKAGE_NAME
  const gameName = typeof body.gameName === 'string' && body.gameName.trim()
    ? body.gameName.trim()
    : DEFAULT_GAME_NAME
  const deviceSerial = typeof body.deviceSerial === 'string' ? body.deviceSerial.trim() : ''

  let plan
  try {
    plan = createPakPushFilesPlan({
      sources: (Array.isArray(body.files) ? body.files : [])
        .map((file) => ({
          pakPath: typeof file.path === 'string' ? file.path : '',
          targetPakName: typeof file.targetPakName === 'string' ? file.targetPakName : undefined,
        }))
        .filter((file) => file.pakPath.trim()),
      packageName,
      gameName,
      deviceSerial,
    })
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : '创建 Pak 推送计划失败',
    })
  }

  const results: StepResult[] = []
  for (const step of plan.steps) {
    const result = await runStep(step)
    results.push(result)
    if (result.code !== 0) {
      return {
        success: false,
        exitCode: result.code,
        ...plan,
        results,
      }
    }
  }

  return {
    success: true,
    exitCode: 0,
    ...plan,
    results,
  }
})
