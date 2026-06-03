import { createError, defineEventHandler, readBody } from 'h3'
import { listLocalPakFiles } from '../../utils/pakToolPlus'

type LocalPaksBody = {
  directory?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LocalPaksBody>(event)
  const directory = typeof body.directory === 'string' ? body.directory.trim() : ''

  if (!directory) {
    throw createError({ statusCode: 400, statusMessage: '缺少 Pak 目录' })
  }

  try {
    return {
      success: true,
      directory,
      files: listLocalPakFiles(directory),
    }
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : '读取 Pak 目录失败',
    })
  }
})
