import { createError, defineEventHandler, readBody } from 'h3'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

type OpenLocalPathBody = {
  path?: string
}

const escapeSingleQuotedPowerShell = (input: string) => input.replace(/'/g, "''")

export default defineEventHandler(async (event) => {
  if (process.platform !== 'win32') {
    return { success: false, error: '打开本地路径目前仅支持 Windows 系统' }
  }

  const body = await readBody<OpenLocalPathBody>(event)
  const rawPath = typeof body.path === 'string' ? body.path.trim() : ''

  if (!rawPath) {
    throw createError({ statusCode: 400, statusMessage: '缺少要打开的本地路径' })
  }

  const targetPath = path.resolve(rawPath)
  if (!path.isAbsolute(targetPath) || !fs.existsSync(targetPath)) {
    throw createError({ statusCode: 400, statusMessage: '本地路径不存在' })
  }

  const psPath = escapeSingleQuotedPowerShell(targetPath)
  const script = `Invoke-Item -LiteralPath '${psPath}'`

  return await new Promise<{ success: boolean; path?: string; error?: string }>((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    let stderr = ''
    child.stderr.on('data', (buf: Buffer) => {
      stderr += buf.toString('utf-8')
    })

    child.on('close', (code: number) => {
      if (code === 0) {
        resolve({ success: true, path: targetPath })
        return
      }

      resolve({ success: false, error: stderr.trim() || '默认程序打开失败' })
    })

    child.on('error', (error: Error) => {
      resolve({ success: false, error: error.message })
    })
  })
})
