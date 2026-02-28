// POST /api/focus/records - 添加专注记录
import { getDb } from '../../utils/focusDb'

export default defineEventHandler(async (event) => {
    const db = getDb()
    const body = await readBody(event)
    const { record } = body

    db.prepare(`
        INSERT INTO records (id, taskId, taskName, listId, startTime, endTime, duration, completed)
        VALUES (@id, @taskId, @taskName, @listId, @startTime, @endTime, @duration, @completed)
    `).run({
        ...record,
        completed: record.completed ? 1 : 0,
    })

    return { ok: true }
})
