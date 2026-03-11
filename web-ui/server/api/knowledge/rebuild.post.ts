// POST /api/knowledge/rebuild - 重建索引（现在其实就是重新查库）
import { buildKnowledgeIndex } from '../../utils/knowledgeCards'

export default defineEventHandler(async () => {
  try {
    const index = buildKnowledgeIndex()
    return {
      ok: true,
      cardsCount: index.cards.length,
    }
  } catch (e: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to rebuild knowledge index: ${e.message}`,
    })
  }
})
