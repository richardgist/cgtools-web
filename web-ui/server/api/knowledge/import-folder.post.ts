// POST /api/knowledge/import-folder - 从文件夹导入 Markdown 卡片
import { existsSync, readdirSync, readFileSync } from 'fs'
import { resolve, basename, extname } from 'path'
import { CARD_ID_PATTERN, parseFrontmatter, batchImportCards, buildKnowledgeIndex } from '../../utils/knowledgeCards'

interface ImportFolderBody {
    folderPath?: string
    overwrite?: boolean
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
                totalFiles: 0,
                cardsCount: buildKnowledgeIndex().cards.length,
                results: [],
                message: '该文件夹中没有找到 .md 文件',
            }
        }

        // 读取每个文件，解析 id
        const items: { id: string; markdown: string; filename: string }[] = []
        const skippedFiles: { filename: string; message: string }[] = []

        for (const filename of files) {
            const sourcePath = resolve(folderPath, filename)
            try {
                const content = readFileSync(sourcePath, 'utf-8')
                const { meta } = parseFrontmatter(content)

                const idFromMeta = typeof meta.id === 'string' ? meta.id.trim() : ''
                const fileBaseName = basename(filename, '.md')
                const effectiveId = idFromMeta && CARD_ID_PATTERN.test(idFromMeta)
                    ? idFromMeta
                    : CARD_ID_PATTERN.test(fileBaseName) ? fileBaseName : ''

                if (!effectiveId) {
                    skippedFiles.push({
                        filename,
                        message: '无有效 id（frontmatter 中没有 id 字段，且文件名不符合 KC-YYYY-MM-DD-NNN 格式）',
                    })
                    continue
                }

                items.push({ id: effectiveId, markdown: content, filename })
            } catch (e: any) {
                skippedFiles.push({ filename, message: e?.message || '读取文件失败' })
            }
        }

        // 批量导入到数据库
        const importResult = batchImportCards(
            items.map(i => ({ id: i.id, markdown: i.markdown })),
            overwrite
        )

        // 合并结果：把 filename 加回去
        const results = importResult.results.map((r, idx) => ({
            ...r,
            filename: items[idx]?.filename || r.id,
        }))

        // 加入跳过的文件
        for (const sf of skippedFiles) {
            results.push({ id: '', status: 'skipped', filename: sf.filename, message: sf.message })
        }

        const index = buildKnowledgeIndex()

        return {
            ok: true,
            imported: importResult.imported,
            skipped: importResult.skipped + skippedFiles.length,
            errors: importResult.errors,
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
