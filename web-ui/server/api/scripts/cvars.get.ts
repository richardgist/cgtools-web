import { createError, defineEventHandler, getQuery } from 'h3'
import {
  loadCVarSnapshotFromPath,
  loadLatestCVarSnapshot,
} from '../../utils/ueConsoleCommands'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const localPath = typeof query.path === 'string' ? query.path.trim() : ''

  try {
    return {
      success: true,
      ...(localPath ? loadCVarSnapshotFromPath(localPath) : loadLatestCVarSnapshot()),
    }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : '读取 CVar 列表失败',
    })
  }
})
