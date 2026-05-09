import { createError, defineEventHandler, getQuery } from 'h3'
import * as fs from 'fs'
import * as path from 'path'
import { resolveManagedScriptPath } from '../../utils/scriptRegistry'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  try {
    const scriptPath = resolveManagedScriptPath(query.path)
    const content = fs.readFileSync(scriptPath, 'utf-8')
    const stat = fs.statSync(scriptPath)

    return {
      success: true,
      name: path.basename(scriptPath),
      path: scriptPath,
      content,
      updatedAt: stat.mtimeMs,
    }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : '读取脚本失败',
    })
  }
})
