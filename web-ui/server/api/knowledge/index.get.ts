// GET /api/knowledge - 获取全部卡片索引
import { buildKnowledgeIndex } from '../../utils/knowledgeCards'

export default defineEventHandler(async () => {
  try {
    return buildKnowledgeIndex()
  } catch (e: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to load knowledge cards: ${e.message}`,
    })
  }
})
