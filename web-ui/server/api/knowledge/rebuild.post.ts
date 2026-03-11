import { buildKnowledgeIndex } from '../../utils/knowledgeCards'

export default defineEventHandler(async () => {
  try {
    const index = buildKnowledgeIndex()
    return {
      ok: true,
      updated_at: index.updated_at,
      cards_count: index.cards.length,
    }
  } catch (e: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to rebuild knowledge index: ${e.message}`,
    })
  }
})
