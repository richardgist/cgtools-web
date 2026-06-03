import { defineEventHandler, getRouterParam, createError } from 'h3'
import { getPromptDb } from '../../utils/promptDb'

export default defineEventHandler(async (event) => {
    try {
        const id = getRouterParam(event, 'id')
        if (!id) {
            throw createError({ statusCode: 400, statusMessage: 'Prompt ID is required' })
        }

        const db = getPromptDb()

        // 检查该提示词是否存在
        const checkStmt = db.prepare('SELECT id FROM prompts WHERE id = ?')
        const existing = checkStmt.get(id)
        if (!existing) {
            throw createError({ statusCode: 404, statusMessage: 'Prompt not found' })
        }

        // 执行删除
        const deleteStmt = db.prepare('DELETE FROM prompts WHERE id = ?')
        deleteStmt.run(id)

        return {
            id,
            message: 'Prompt deleted successfully'
        }
    } catch (error: any) {
        console.error('Error deleting prompt:', error)
        throw createError({
            statusCode: error.statusCode || 500,
            statusMessage: error.statusMessage || 'Failed to delete prompt',
        })
    }
})
