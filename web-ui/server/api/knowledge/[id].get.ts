// GET /api/knowledge/:id - 获取单张卡片的 Markdown 内容
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { CARD_ID_PATTERN, CARDS_DIR } from '../../utils/knowledgeCards'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing card id' })
  }

  // Sanitize: only allow KC-YYYY-MM-DD-NNN / KC-YYYY_MM_DD_NNN pattern
  if (!CARD_ID_PATTERN.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid card id format' })
  }

  const filePath = resolve(CARDS_DIR, `${id}.md`)

  if (!existsSync(filePath)) {
    throw createError({ statusCode: 404, statusMessage: 'Card not found' })
  }

  try {
    const content = readFileSync(filePath, 'utf-8')

    // Strip YAML frontmatter
    const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/)
    const body = match ? match[1] : content

    return { id, markdown: body }
  } catch (e: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to read card: ${e.message}`,
    })
  }
})
