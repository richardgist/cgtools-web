// POST /api/focus/daily-snapshots - 保存或更新某天的日报快照
import { getDb } from '../../utils/focusDb'

export default defineEventHandler(async (event) => {
    const db = getDb()
    const body = await readBody(event)
    const { snapshot } = body
    const now = Date.now()

    if (!snapshot?.date) {
        return { ok: false, error: 'Missing snapshot date' }
    }

    const existing = db.prepare('SELECT createdAt FROM daily_snapshots WHERE date = ?').get(snapshot.date) as { createdAt: number } | undefined

    db.prepare(`
        INSERT INTO daily_snapshots (date, plannedJson, completedJson, carriedJson, reportText, createdAt, updatedAt)
        VALUES (@date, @plannedJson, @completedJson, @carriedJson, @reportText, @createdAt, @updatedAt)
        ON CONFLICT(date) DO UPDATE SET
            plannedJson = excluded.plannedJson,
            completedJson = excluded.completedJson,
            carriedJson = excluded.carriedJson,
            reportText = excluded.reportText,
            updatedAt = excluded.updatedAt
    `).run({
        date: snapshot.date,
        plannedJson: JSON.stringify(snapshot.planned ?? []),
        completedJson: JSON.stringify(snapshot.completed ?? []),
        carriedJson: JSON.stringify(snapshot.carried ?? []),
        reportText: snapshot.reportText ?? '',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    })

    return { ok: true }
})
