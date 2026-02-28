// POST /api/focus/tasks - 任务 CRUD 操作
import { getDb, rowToTask } from '../../utils/focusDb'

export default defineEventHandler(async (event) => {
    const db = getDb()
    const body = await readBody(event)
    const { action } = body

    switch (action) {
        case 'create': {
            const { task } = body
            db.prepare(`
                INSERT INTO tasks (id, name, completed, completedAt, listId, pomodoroEstimate, pomodoroCompleted, priority, dueDate, notes, createdAt, "order")
                VALUES (@id, @name, @completed, @completedAt, @listId, @pomodoroEstimate, @pomodoroCompleted, @priority, @dueDate, @notes, @createdAt, @order)
            `).run({
                ...task,
                completed: task.completed ? 1 : 0,
                completedAt: task.completedAt ?? null,
                dueDate: task.dueDate ?? null,
            })
            return { ok: true, task }
        }

        case 'update': {
            const { id, updates } = body
            const setClauses: string[] = []
            const params: any = { id }
            for (const [key, value] of Object.entries(updates)) {
                const col = key === 'order' ? '"order"' : key
                const paramKey = key
                setClauses.push(`${col} = @${paramKey}`)
                if (key === 'completed') {
                    params[paramKey] = value ? 1 : 0
                } else {
                    params[paramKey] = value ?? null
                }
            }
            if (setClauses.length > 0) {
                db.prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = @id`).run(params)
            }
            return { ok: true }
        }

        case 'toggle': {
            const { id } = body
            const row = db.prepare('SELECT completed FROM tasks WHERE id = ?').get(id) as any
            if (row) {
                const newCompleted = row.completed ? 0 : 1
                const completedAt = newCompleted ? Date.now() : null
                db.prepare('UPDATE tasks SET completed = ?, completedAt = ? WHERE id = ?')
                    .run(newCompleted, completedAt, id)
            }
            return { ok: true }
        }

        case 'delete': {
            const { id } = body
            db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
            return { ok: true }
        }

        default:
            return { ok: false, error: 'Unknown action' }
    }
})
