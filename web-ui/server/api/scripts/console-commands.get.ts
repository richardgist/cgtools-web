import { createError, defineEventHandler, getQuery } from 'h3'
import {
  loadConsoleCommandSnapshotFromPath,
  loadLatestConsoleCommandSnapshot,
} from '../../utils/ueConsoleCommands'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const localPath = typeof query.path === 'string' ? query.path.trim() : ''

  try {
    return {
      success: true,
      ...(localPath ? loadConsoleCommandSnapshotFromPath(localPath) : loadLatestConsoleCommandSnapshot()),
    }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : '读取 UE Console 命令库失败',
    })
  }
})
