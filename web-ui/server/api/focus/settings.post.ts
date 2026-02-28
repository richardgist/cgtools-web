// POST /api/focus/settings - 更新设置
import { getDb } from '../../utils/focusDb'

export default defineEventHandler(async (event) => {
    const db = getDb()
    const body = await readBody(event)
    const { updates } = body

    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    const updateMany = db.transaction((entries: [string, any][]) => {
        for (const [key, value] of entries) {
            stmt.run(key, JSON.stringify(value))
        }
    })
    updateMany(Object.entries(updates))

    return { ok: true }
})
