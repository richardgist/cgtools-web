// DELETE /api/knowledge/:id - 删除单张卡片
import { CARD_ID_PATTERN, deleteKnowledgeCard, buildKnowledgeIndex } from '../../utils/knowledgeCards'

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id')

    if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'Missing card id' })
    }

    if (!CARD_ID_PATTERN.test(id)) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid card id format' })
    }

    const deleted = deleteKnowledgeCard(id)
    if (!deleted) {
        throw createError({ statusCode: 404, statusMessage: 'Card not found' })
    }

    const index = buildKnowledgeIndex()
    return {
        ok: true,
        id,
        cardsCount: index.cards.length,
    }
})
