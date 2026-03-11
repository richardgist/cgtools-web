import { findDuplicateCards } from '../../utils/knowledgeCards'

export default defineEventHandler(async () => {
  const result = findDuplicateCards()
  return {
    ok: true,
    ...result,
  }
})
