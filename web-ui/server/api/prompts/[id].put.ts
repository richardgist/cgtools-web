import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { getPromptDb } from '../../utils/promptDb'

interface UpdatePromptBody {
    folderId?: string
    name: string
    prompt: string
    negativePrompt?: string
    notes?: string
    favorite?: number
    locked?: number
    tags?: string
}

export default defineEventHandler(async (event) => {
    try {
        const id = getRouterParam(event, 'id')
        if (!id) {
            throw createError({ statusCode: 400, statusMessage: 'Prompt ID is required' })
        }

        const body = await readBody<UpdatePromptBody>(event)

        const folderId = body?.folderId?.trim() || null
        const name = body?.name?.trim() || ''
        const prompt = body?.prompt?.trim() || ''
        const negativePrompt = body?.negativePrompt?.trim() || null
        const notes = body?.notes?.trim() || null
        const favorite = body?.favorite === 1 ? 1 : 0
        const locked = body?.locked === 1 ? 1 : 0
        const tags = body?.tags?.trim() || null

        // 校验必选
        if (!name) {
            throw createError({ statusCode: 400, statusMessage: 'Title is required' })
        }
        if (!prompt) {
            throw createError({ statusCode: 400, statusMessage: 'Prompt content is required' })
        }

        const db = getPromptDb()

        // 检查该提示词是否存在
        const checkStmt = db.prepare('SELECT id FROM prompts WHERE id = ?')
        const existing = checkStmt.get(id)
        if (!existing) {
            throw createError({ statusCode: 404, statusMessage: 'Prompt not found' })
        }

        // 如果传了 folderId，校验 folder 是否存在
        if (folderId) {
            const checkFolder = db.prepare('SELECT id FROM folders WHERE id = ?').get(folderId)
            if (!checkFolder) {
                throw createError({ statusCode: 400, statusMessage: 'Invalid folder ID' })
            }
        }

        // 执行更新
        const updateStmt = db.prepare(`
            UPDATE prompts
            SET folderId = ?, name = ?, prompt = ?, negativePrompt = ?, notes = ?, favorite = ?, locked = ?, tags = ?
            WHERE id = ?
        `)

        updateStmt.run(folderId, name, prompt, negativePrompt, notes, favorite, locked, tags, id)

        return {
            id,
            folderId,
            name,
            prompt,
            negativePrompt,
            notes,
            favorite,
            locked,
            tags,
            message: 'Prompt updated successfully'
        }
    } catch (error: any) {
        console.error('Error updating prompt:', error)
        throw createError({
            statusCode: error.statusCode || 500,
            statusMessage: error.statusMessage || 'Failed to update prompt',
        })
    }
})
