// GET /api/knowledge/graph - 从 Obsidian 双链生成知识网络
import { buildKnowledgeGraph } from '../../utils/knowledgeCards'

export default defineEventHandler(async () => {
  try {
    return buildKnowledgeGraph()
  } catch (e: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to load knowledge graph: ${e.message}`,
    })
  }
})
