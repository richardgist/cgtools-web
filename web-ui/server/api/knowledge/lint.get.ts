// GET /api/knowledge/lint - 维基知识库健康体检接口
import { scanKnowledgeNodes, buildKnowledgeGraph } from '../../utils/knowledgeCards'

export default defineEventHandler(async () => {
  try {
    const nodes = scanKnowledgeNodes()
    const cards = nodes.filter(n => n.type === 'card')
    const graph = buildKnowledgeGraph()

    // 1. 查找 Broken Links (断链)
    const brokenLinks: { sourceId: string; sourceTitle: string; targetId: string }[] = []
    for (const edge of graph.edges) {
      if (edge.missing) {
        const sourceNode = cards.find(c => c.id === edge.source)
        brokenLinks.push({
          sourceId: edge.source,
          sourceTitle: sourceNode ? sourceNode.title : edge.source,
          targetId: edge.target,
        })
      }
    }

    // 2. 查找 Orphan Cards (孤立卡片)
    const referencedIds = new Set<string>()
    const referencingIds = new Set<string>()

    for (const edge of graph.edges) {
      referencingIds.add(edge.source)
      if (!edge.missing) {
        referencedIds.add(edge.target)
      }
    }

    const orphans = cards
      .filter(card => !referencedIds.has(card.id) && !referencingIds.has(card.id))
      .map(card => ({
        id: card.id,
        title: card.title,
        summary: card.summary,
      }))

    return {
      ok: true,
      stats: {
        totalCards: cards.length,
        brokenLinksCount: brokenLinks.length,
        orphansCount: orphans.length,
      },
      brokenLinks,
      orphans,
    }
  } catch (e: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to run Wiki Lint: ${e.message}`,
    })
  }
})
