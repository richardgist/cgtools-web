import { createError, defineEventHandler, readBody } from 'h3'
import { spawn } from 'node:child_process'
import {
  DEFAULT_GAME_NAME,
  DEFAULT_PACKAGE_NAME,
  buildPakToolPathsFromProjectRoot,
  createPakPushPlan,
  type PakCommandStep,
} from '../../utils/pakToolPlus'

type PushPakBody = {
  projectRoot?: string
  targetPakName?: string
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
  const body = await readBody<PushPakBody>(event)
  const projectRoot = typeof body.projectRoot === 'string' && body.projectRoot.trim()
    ? body.projectRoot
    : undefined
  const targetPakName = typeof body.targetPakName === 'string' ? body.targetPakName : ''
  const packageName = typeof body.packageName === 'string' && body.packageName.trim()
    ? body.packageName.trim()
    : DEFAULT_PACKAGE_NAME
  const gameName = typeof body.gameName === 'string' && body.gameName.trim()
    ? body.gameName.trim()
    : DEFAULT_GAME_NAME
  const deviceSerial = typeof body.deviceSerial === 'string' ? body.deviceSerial.trim() : ''
  const paths = buildPakToolPathsFromProjectRoot(projectRoot)

  let plan
  try {
    plan = createPakPushPlan({
      tempPaksDir: paths.tempPaksDir,
      targetPakName,
      packageName,
      gameName,
      deviceSerial,
    })
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : '创建 pak 推送计划失败',
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
