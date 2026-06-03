import { defineEventHandler, getRouterParam, createError } from 'h3'
import { getPromptDb } from '../../utils/promptDb'

export default defineEventHandler(async (event) => {
    try {
        const id = getRouterParam(event, 'id')
        if (!id) {
            throw createError({ statusCode: 400, statusMessage: 'Folder ID is required' })
        }

        const db = getPromptDb()

        // 检查文件夹是否存在
        const checkStmt = db.prepare('SELECT id FROM folders WHERE id = ?')
        const existing = checkStmt.get(id)
        if (!existing) {
            throw createError({ statusCode: 404, statusMessage: 'Folder not found' })
        }

        // 开启事务：1. 更新该文件夹下的所有提示词的 folderId 为 null； 2. 删除文件夹
        const updatePromptsStmt = db.prepare('UPDATE prompts SET folderId = NULL WHERE folderId = ?')
        const deleteFolderStmt = db.prepare('DELETE FROM folders WHERE id = ?')

        const transaction = db.transaction((folderId: string) => {
            updatePromptsStmt.run(folderId)
            deleteFolderStmt.run(folderId)
        })

        transaction(id)

        return {
            id,
            message: 'Folder deleted successfully and inner prompts unclassified.'
        }
    } catch (error: any) {
        console.error('Error deleting folder:', error)
        throw createError({
            statusCode: error.statusCode || 500,
            statusMessage: error.statusMessage || 'Failed to delete folder',
        })
    }
})
