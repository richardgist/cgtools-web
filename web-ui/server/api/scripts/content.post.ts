import { createError, defineEventHandler, readBody } from 'h3'
import * as fs from 'fs'
import * as path from 'path'
import { resolveManagedScriptPath } from '../../utils/scriptRegistry'

type SaveScriptBody = {
  path?: string
  content?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SaveScriptBody>(event)

  if (typeof body.content !== 'string') {
    throw createError({ statusCode: 400, statusMessage: '脚本内容必须是文本' })
  }

  try {
    const scriptPath = resolveManagedScriptPath(body.path)
    fs.writeFileSync(scriptPath, body.content, 'utf-8')
    const stat = fs.statSync(scriptPath)

    return {
      success: true,
      name: path.basename(scriptPath),
      path: scriptPath,
      updatedAt: stat.mtimeMs,
    }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : '保存脚本失败',
    })
  }
})
