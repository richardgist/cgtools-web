// GET /api/knowledge/:id - 获取单张卡片的 Markdown 内容
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { CARDS_DIR } from '../../utils/knowledgeCards'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing card id' })
  }

  // Sanitize: only allow KC-YYYY-MM-DD-NNN pattern
  if (!/^KC-\d{4}-\d{2}-\d{2}-\d{3}$/.test(id)) {
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
