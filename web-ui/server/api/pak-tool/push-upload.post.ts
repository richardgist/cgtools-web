import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createError, defineEventHandler, readMultipartFormData } from 'h3'
import { spawn } from 'node:child_process'
import {
  DEFAULT_GAME_NAME,
  DEFAULT_PACKAGE_NAME,
  createPakPushFilesPlan,
  type PakCommandStep,
} from '../../utils/pakToolPlus'

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
  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    throw createError({ statusCode: 400, statusMessage: '没有收到拖拽的 Pak 文件' })
  }

  const fields = new Map<string, string>()
  for (const part of parts) {
    if (!part.filename && part.name) {
      fields.set(part.name, part.data.toString('utf-8'))
    }
  }

  const packageName = fields.get('packageName')?.trim() || DEFAULT_PACKAGE_NAME
  const gameName = fields.get('gameName')?.trim() || DEFAULT_GAME_NAME
  const deviceSerial = fields.get('deviceSerial')?.trim() || ''
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgtools-pak-upload-'))

  try {
    const writtenNames = new Set<string>()
    const pakPaths: string[] = []

    for (const part of parts) {
      if (!part.filename) continue

      const fileName = path.basename(part.filename)
      if (!/\.(pak|sig)$/i.test(fileName)) continue
      if (/[<>:"|?*]/.test(fileName) || fileName.includes('..')) {
        throw new Error(`文件名非法：${fileName}`)
      }
      if (writtenNames.has(fileName.toLowerCase())) {
        throw new Error(`拖拽文件名重复：${fileName}`)
      }

      writtenNames.add(fileName.toLowerCase())
      const targetPath = path.join(tempDir, fileName)
      fs.writeFileSync(targetPath, part.data)
      if (fileName.toLowerCase().endsWith('.pak')) {
        pakPaths.push(targetPath)
      }
    }

    if (!pakPaths.length) {
      throw new Error('拖拽内容里没有 .pak 文件')
    }

    const plan = createPakPushFilesPlan({
      sources: pakPaths.map((pakPath) => ({ pakPath })),
      packageName,
      gameName,
      deviceSerial,
    })

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
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : '拖拽 Pak 推送失败',
    })
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})
