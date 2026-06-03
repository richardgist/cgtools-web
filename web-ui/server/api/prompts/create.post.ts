import { defineEventHandler, readBody, createError } from 'h3'
import { getPromptDb } from '../../utils/promptDb'
import { randomUUID } from 'crypto'

interface CreatePromptBody {
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
        const body = await readBody<CreatePromptBody>(event)

        const folderId = body?.folderId?.trim() || null
        const name = body?.name?.trim() || ''
        const prompt = body?.prompt?.trim() || ''
        const negativePrompt = body?.negativePrompt?.trim() || null
        const notes = body?.notes?.trim() || null
        const favorite = body?.favorite === 1 ? 1 : 0
        const locked = body?.locked === 1 ? 1 : 0
        const tags = body?.tags?.trim() || null

        // 校验必填
        if (!name) {
            throw createError({ statusCode: 400, statusMessage: 'Title is required' })
        }
        if (!prompt) {
            throw createError({ statusCode: 400, statusMessage: 'Prompt content is required' })
        }

        const db = getPromptDb()

        // 如果传了 folderId，校验 folder 是否存在
        if (folderId) {
            const checkFolder = db.prepare('SELECT id FROM folders WHERE id = ?').get(folderId)
            if (!checkFolder) {
                throw createError({ statusCode: 400, statusMessage: 'Invalid folder ID' })
            }
        }

        // 获取最大的 order
        const maxOrderRow = db.prepare('SELECT MAX("order") as maxOrder FROM prompts').get() as any
        const nextOrder = (maxOrderRow?.maxOrder || 0) + 1

        const id = randomUUID()
        const createdAt = Date.now()

        const insertStmt = db.prepare(`
            INSERT INTO prompts (id, folderId, name, prompt, negativePrompt, notes, favorite, locked, tags, createdAt, "order")
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        insertStmt.run(id, folderId, name, prompt, negativePrompt, notes, favorite, locked, tags, createdAt, nextOrder)

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
            createdAt,
            order: nextOrder
        }
    } catch (error: any) {
        console.error('Error creating prompt:', error)
        throw createError({
            statusCode: error.statusCode || 500,
            statusMessage: error.statusMessage || 'Failed to create prompt',
        })
    }
})
