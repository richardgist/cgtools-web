// GET /api/focus/settings - 获取设置
import { getDb } from '../../utils/focusDb'

export default defineEventHandler(() => {
    const db = getDb()
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    const settings: Record<string, any> = {}
    for (const row of rows) {
        try { settings[row.key] = JSON.parse(row.value) } catch { settings[row.key] = row.value }
    }
    return settings
})
