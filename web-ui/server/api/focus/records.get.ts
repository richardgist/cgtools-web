// GET /api/focus/records - 获取专注记录
import { getDb, rowToRecord } from '../../utils/focusDb'

export default defineEventHandler(() => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM records ORDER BY startTime DESC').all()
    return rows.map(rowToRecord)
})
