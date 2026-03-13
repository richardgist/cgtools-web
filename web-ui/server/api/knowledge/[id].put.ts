// PUT /api/knowledge/:id - 更新单张卡片正文内容
import { CARD_ID_PATTERN, parseFrontmatter, updateKnowledgeCardBody } from '../../utils/knowledgeCards'

interface UpdateKnowledgeCardBody {
  markdown?: string
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing card id' })
  }

  if (!CARD_ID_PATTERN.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid card id format' })
  }

  const body = await readBody<UpdateKnowledgeCardBody>(event)
  const markdown = typeof body?.markdown === 'string' ? body.markdown : ''
  if (!markdown.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Card markdown body is empty' })
  }

  try {
    const updated = updateKnowledgeCardBody(id, markdown)
    if (!updated) {
      throw createError({ statusCode: 404, statusMessage: 'Card not found' })
    }

    const parsed = parseFrontmatter(updated.content)
    return {
      ok: true,
      id: updated.id,
      summary: updated.summary,
      markdown: parsed.body,
    }
  } catch (e: any) {
    throw createError({
      statusCode: Number(e?.statusCode) || 500,
      statusMessage: e?.message || 'Failed to update knowledge card',
    })
  }
})
