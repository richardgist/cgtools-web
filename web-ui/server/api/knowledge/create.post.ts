import { createKnowledgeCardFromMarkdown } from '../../utils/knowledgeCards'

interface CreateKnowledgeCardBody {
  markdown?: string
  overwrite?: boolean
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateKnowledgeCardBody>(event)
  const markdown = typeof body?.markdown === 'string' ? body.markdown : ''
  const overwrite = Boolean(body?.overwrite)

  try {
    const result = createKnowledgeCardFromMarkdown(markdown, overwrite)
    return {
      ok: true,
      id: result.id,
      created: result.created,
      cardsCount: result.index.cards.length,
    }
  } catch (e: any) {
    throw createError({
      statusCode: Number(e?.statusCode) || 500,
      statusMessage: e?.message || 'Failed to create knowledge card',
    })
  }
})
