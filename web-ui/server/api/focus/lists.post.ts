// POST /api/focus/lists - 清单 CRUD 操作
import { getDb } from '../../utils/focusDb'

export default defineEventHandler(async (event) => {
    const db = getDb()
    const body = await readBody(event)
    const { action } = body

    switch (action) {
        case 'create': {
            const { list } = body
            db.prepare(`
                INSERT INTO lists (id, name, color, folderId, "order", createdAt)
                VALUES (@id, @name, @color, @folderId, @order, @createdAt)
            `).run({
                ...list,
                folderId: list.folderId ?? null,
            })
            return { ok: true, list }
        }

        case 'update': {
            const { id, updates } = body
            const setClauses: string[] = []
            const params: any = { id }
            for (const [key, value] of Object.entries(updates)) {
                const col = key === 'order' ? '"order"' : key
                setClauses.push(`${col} = @${key}`)
                params[key] = value ?? null
            }
            if (setClauses.length > 0) {
                db.prepare(`UPDATE lists SET ${setClauses.join(', ')} WHERE id = @id`).run(params)
            }
            return { ok: true }
        }

        case 'delete': {
            const { id } = body
            db.prepare('DELETE FROM lists WHERE id = ?').run(id)
            // Move tasks to default list
            db.prepare('UPDATE tasks SET listId = ? WHERE listId = ?').run('default', id)
            return { ok: true }
        }

        default:
            return { ok: false, error: 'Unknown action' }
    }
})
