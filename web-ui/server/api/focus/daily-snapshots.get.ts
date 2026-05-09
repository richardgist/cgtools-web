// GET /api/focus/daily-snapshots - 获取手动保存的日报快照
import { getDb, rowToDailySnapshot } from '../../utils/focusDb'

export default defineEventHandler(() => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM daily_snapshots ORDER BY date DESC').all()
    return rows.map(rowToDailySnapshot)
})
