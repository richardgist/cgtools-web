import { defineEventHandler, createError } from 'h3'
import { getPromptDb } from '../../utils/promptDb'

export default defineEventHandler(async (event) => {
    try {
        const db = getPromptDb()
        // 查询文件夹列表，并统计各个文件夹下的提示词个数
        const stmt = db.prepare(`
            SELECT f.id, f.name, f.createdAt, COUNT(p.id) as count
            FROM folders f
            LEFT JOIN prompts p ON f.id = p.folderId
            GROUP BY f.id
            ORDER BY f.createdAt ASC
        `)
        return stmt.all()
    } catch (error: any) {
        console.error('Error fetching folders:', error)
        throw createError({
            statusCode: 500,
            statusMessage: error?.message || 'Failed to fetch folders',
        })
    }
})
