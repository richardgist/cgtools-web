// DELETE /api/knowledge/:id - 删除单张卡片
import { existsSync, unlinkSync } from 'fs'
import { resolve } from 'path'
import { CARD_ID_PATTERN, CARDS_DIR, buildKnowledgeIndex } from '../../utils/knowledgeCards'

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id')

    if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'Missing card id' })
    }

    if (!CARD_ID_PATTERN.test(id)) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid card id format' })
    }

    const filePath = resolve(CARDS_DIR, `${id}.md`)

    if (!existsSync(filePath)) {
        throw createError({ statusCode: 404, statusMessage: 'Card not found' })
    }

    try {
        unlinkSync(filePath)
        const index = buildKnowledgeIndex()

        return {
            ok: true,
            id,
            cardsCount: index.cards.length,
        }
    } catch (e: any) {
        throw createError({
            statusCode: 500,
            statusMessage: `Failed to delete card: ${e.message}`,
        })
    }
})
