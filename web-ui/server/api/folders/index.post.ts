import { defineEventHandler, readBody, createError } from 'h3'
import { getPromptDb } from '../../utils/promptDb'
import { randomUUID } from 'crypto'

interface CreateFolderBody {
    name: string
}

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody<CreateFolderBody>(event)
        const name = body?.name?.trim() || ''

        if (!name) {
            throw createError({ statusCode: 400, statusMessage: 'Folder name is required' })
        }

        const db = getPromptDb()

        // 检查重名文件夹
        const checkStmt = db.prepare('SELECT id FROM folders WHERE name = ?')
        const existing = checkStmt.get(name)
        if (existing) {
            throw createError({ statusCode: 400, statusMessage: 'Folder with this name already exists' })
        }

        const id = randomUUID()
        const createdAt = Date.now()

        const insertStmt = db.prepare('INSERT INTO folders (id, name, createdAt) VALUES (?, ?, ?)')
        insertStmt.run(id, name, createdAt)

        return {
            id,
            name,
            createdAt,
            count: 0
        }
    } catch (error: any) {
        console.error('Error creating folder:', error)
        throw createError({
            statusCode: error.statusCode || 500,
            statusMessage: error.statusMessage || 'Failed to create folder',
        })
    }
})
