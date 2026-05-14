// GET /api/knowledge/asset - 代理 Obsidian 卡片目录下的本地图片/附件
import { createReadStream } from 'fs'
import { extname } from 'path'
import { resolveKnowledgeAssetPath } from '../../utils/knowledgeCards'

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const file = typeof query.file === 'string' ? query.file : ''
  if (!file) {
    throw createError({ statusCode: 400, statusMessage: 'Missing asset file' })
  }

  try {
    const assetPath = resolveKnowledgeAssetPath(file)
    setHeader(event, 'content-type', MIME_TYPES[extname(assetPath).toLowerCase()] || 'application/octet-stream')
    return sendStream(event, createReadStream(assetPath))
  } catch (e: any) {
    throw createError({
      statusCode: Number(e?.statusCode) || 500,
      statusMessage: e?.message || 'Failed to load asset',
    })
  }
})
