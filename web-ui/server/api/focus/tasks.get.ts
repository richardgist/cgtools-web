// GET /api/focus/tasks - 获取所有任务
import { getDb, rowToTask } from '../../utils/focusDb'

export default defineEventHandler(() => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM tasks ORDER BY "order" ASC').all()
    return rows.map(rowToTask)
})
