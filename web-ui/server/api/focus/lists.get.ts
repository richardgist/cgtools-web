// GET /api/focus/lists - 获取所有清单
import { getDb } from '../../utils/focusDb'

export default defineEventHandler(() => {
    const db = getDb()
    return db.prepare('SELECT * FROM lists ORDER BY "order" ASC').all()
})
