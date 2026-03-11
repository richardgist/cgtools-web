import { CARD_ID_PATTERN, batchDeleteCards, buildKnowledgeIndex } from '../../utils/knowledgeCards'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const ids: string[] = body?.ids

  if (!Array.isArray(ids) || ids.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Missing or empty ids array' })
  }

  // 验证所有 ID 格式
  for (const id of ids) {
    if (!CARD_ID_PATTERN.test(id)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid card id format: ${id}` })
    }
  }

  const result = batchDeleteCards(ids)
  const index = buildKnowledgeIndex()

  return {
    ok: true,
    deleted: result.deleted,
    notFound: result.notFound,
    cardsCount: index.cards.length,
  }
})
