// POST /api/knowledge/import-folder - 从文件夹导入 Markdown 卡片
import { existsSync, readdirSync, readFileSync, copyFileSync } from 'fs'
import { resolve, basename, extname } from 'path'
import { CARDS_DIR, CARD_ID_PATTERN, buildKnowledgeIndex } from '../../utils/knowledgeCards'

interface ImportFolderBody {
    folderPath?: string
    overwrite?: boolean
}

interface ImportResult {
    filename: string
    id: string
    status: 'imported' | 'skipped' | 'overwritten' | 'error'
    message?: string
}

/**
 * 从 markdown 内容中提取 frontmatter 中 id 字段
 */
function extractIdFromContent(content: string): string {
    const normalized = content.replace(/^\ufeff/, '')
    const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
    if (!match?.[1]) return ''

    for (const rawLine of match[1].split(/\r?\n/)) {
        const line = rawLine.trim()
        const separatorIndex = line.indexOf(':')
        if (separatorIndex < 0) continue

        const key = line.slice(0, separatorIndex).trim()
        const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
        if (key === 'id') return value
    }

    return ''
}

export default defineEventHandler(async (event) => {
    const body = await readBody<ImportFolderBody>(event)
    const folderPath = typeof body?.folderPath === 'string' ? body.folderPath.trim() : ''
    const overwrite = Boolean(body?.overwrite)

    if (!folderPath) {
        throw createError({ statusCode: 400, statusMessage: '请提供文件夹路径' })
    }

    if (!existsSync(folderPath)) {
        throw createError({ statusCode: 400, statusMessage: `文件夹不存在: ${folderPath}` })
    }

    try {
        const files = readdirSync(folderPath).filter(f => extname(f).toLowerCase() === '.md')

        if (files.length === 0) {
            return {
                ok: true,
                imported: 0,
                skipped: 0,
                errors: 0,
                results: [] as ImportResult[],
                message: '该文件夹中没有找到 .md 文件',
            }
        }

        const results: ImportResult[] = []
        let imported = 0
        let skipped = 0
        let errors = 0

        for (const filename of files) {
            const sourcePath = resolve(folderPath, filename)

            try {
                const content = readFileSync(sourcePath, 'utf-8')
                const id = extractIdFromContent(content)

                // 如果文件名本身符合 KC-YYYY-MM-DD-NNN.md 格式，直接用文件名作为 id
                const fileBaseName = basename(filename, '.md')
                const effectiveId = id && CARD_ID_PATTERN.test(id) ? id : (CARD_ID_PATTERN.test(fileBaseName) ? fileBaseName : '')

                if (!effectiveId) {
                    results.push({
                        filename,
                        id: '',
                        status: 'skipped',
                        message: '无有效 id（frontmatter 中没有 id 字段，且文件名不符合 KC-YYYY-MM-DD-NNN 格式）',
                    })
                    skipped++
                    continue
                }

                const targetFilename = `${effectiveId}.md`
                const targetPath = resolve(CARDS_DIR, targetFilename)
                const alreadyExists = existsSync(targetPath)

                if (alreadyExists && !overwrite) {
                    results.push({
                        filename,
                        id: effectiveId,
                        status: 'skipped',
                        message: `卡片已存在: ${effectiveId}`,
                    })
                    skipped++
                    continue
                }

                copyFileSync(sourcePath, targetPath)
                results.push({
                    filename,
                    id: effectiveId,
                    status: alreadyExists ? 'overwritten' : 'imported',
                })
                imported++
            } catch (e: any) {
                results.push({
                    filename,
                    id: '',
                    status: 'error',
                    message: e?.message || '读取文件失败',
                })
                errors++
            }
        }

        // 重建索引
        const index = buildKnowledgeIndex()

        return {
            ok: true,
            imported,
            skipped,
            errors,
            totalFiles: files.length,
            cardsCount: index.cards.length,
            results,
        }
    } catch (e: any) {
        throw createError({
            statusCode: 500,
            statusMessage: `导入失败: ${e.message}`,
        })
    }
})
