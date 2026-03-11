// GET /api/knowledge/:id - 获取单张卡片的 Markdown 内容
import { CARD_ID_PATTERN, getCardMarkdownBody, parseFrontmatter } from '../../utils/knowledgeCards'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing card id' })
  }

  if (!CARD_ID_PATTERN.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid card id format' })
  }

  const content = getCardMarkdownBody(id)
  if (content === null) {
    throw createError({ statusCode: 404, statusMessage: 'Card not found' })
  }

  // Strip YAML frontmatter, return body only
  const { body } = parseFrontmatter(content)
  return { id, markdown: body }
})
