import { createError, defineEventHandler, readBody } from 'h3'
import { spawn } from 'node:child_process'
import {
  DEFAULT_PAK_TOOL_EXE,
  createPakToolLaunchPlan,
  validatePakToolLaunch,
} from '../../utils/pakToolPlus'

type LaunchPakToolBody = {
  exePath?: string
  projectRoot?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LaunchPakToolBody>(event)
  const exePath = typeof body.exePath === 'string' && body.exePath.trim()
    ? body.exePath
    : DEFAULT_PAK_TOOL_EXE
  const projectRoot = typeof body.projectRoot === 'string' && body.projectRoot.trim()
    ? body.projectRoot
    : undefined
  const { status, errors } = validatePakToolLaunch(exePath, projectRoot)

  if (errors.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: errors.join('\n'),
    })
  }

  const plan = createPakToolLaunchPlan(status.exePath, status.projectRoot)

  return await new Promise<{ success: boolean; pid?: number; projectRoot: string; exePath: string; toolDir: string; error?: string }>((resolve) => {
    const child = spawn(plan.cmd, plan.args, {
      cwd: plan.cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })

    child.once('error', (error: Error) => {
      resolve({
        success: false,
        projectRoot: status.projectRoot,
        exePath: status.exePath,
        toolDir: status.toolDir,
        error: error.message,
      })
    })

    child.once('spawn', () => {
      child.unref()
      resolve({
        success: true,
        pid: child.pid,
        projectRoot: status.projectRoot,
        exePath: status.exePath,
        toolDir: status.toolDir,
      })
    })
  })
})
