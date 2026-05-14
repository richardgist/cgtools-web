// GET /api/knowledge/:id - 获取 Vault 中任意知识节点的 Markdown 正文
import { getCardMarkdownBody, parseFrontmatter } from '../../utils/knowledgeCards'

export default defineEventHandler(async (event) => {
  const rawId = getRouterParam(event, 'id')
  const id = rawId ? decodeURIComponent(rawId) : ''

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing card id' })
  }

  const content = getCardMarkdownBody(id)
  if (content === null) {
    throw createError({ statusCode: 404, statusMessage: 'Card not found' })
  }

  // Strip YAML frontmatter, return body only
  const { body } = parseFrontmatter(content)
  return { id, markdown: body }
})
