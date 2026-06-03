import { defineEventHandler, getQuery, createError } from 'h3'
import { getPromptDb } from '../../utils/promptDb'

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event)
        const folderId = query.folderId as string
        const favorite = query.favorite as string
        const locked = query.locked as string
        const tag = query.tag as string

        const db = getPromptDb()

        let sql = 'SELECT * FROM prompts'
        const conditions: string[] = []
        const params: any[] = []

        if (folderId) {
            if (folderId === 'unclassified') {
                conditions.push('folderId IS NULL')
            } else {
                conditions.push('folderId = ?')
                params.push(folderId)
            }
        }

        if (favorite === '1') {
            conditions.push('favorite = 1')
        }

        if (locked === '1') {
            conditions.push('locked = 1')
        }

        if (tag) {
            // 使用 LIKE 匹配逗号分隔的标签列表
            conditions.push('(tags = ? OR tags LIKE ? OR tags LIKE ? OR tags LIKE ?)')
            params.push(tag, `${tag},%`, `%,${tag}`, `%,${tag},%`)
        }

        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ')
        }

        sql += ' ORDER BY favorite DESC, "order" ASC, createdAt DESC'

        const stmt = db.prepare(sql)
        return stmt.all(...params)
    } catch (error: any) {
        console.error('Error fetching prompts:', error)
        throw createError({
            statusCode: 500,
            statusMessage: error?.message || 'Failed to fetch prompts',
        })
    }
})
