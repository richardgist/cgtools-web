// POST /api/knowledge/import-files - 从浏览器上传的一批 Markdown 文件内容导入卡片
import { basename } from 'path'
import { CARD_ID_PATTERN, parseFrontmatter, batchImportCards, buildKnowledgeIndex } from '../../utils/knowledgeCards'

interface ImportFileItem {
    filename: string
    content: string
}

interface ImportFilesBody {
    files?: ImportFileItem[]
    overwrite?: boolean
}

export default defineEventHandler(async (event) => {
    const body = await readBody<ImportFilesBody>(event)
    const files = Array.isArray(body?.files) ? body.files : []
    const overwrite = Boolean(body?.overwrite)

    if (files.length === 0) {
        return {
            ok: true,
            imported: 0,
            skipped: 0,
            errors: 0,
            totalFiles: 0,
            cardsCount: buildKnowledgeIndex().cards.length,
            results: [],
            message: '没有收到任何文件',
        }
    }

    try {
        const items: { id: string; markdown: string; filename: string }[] = []
        const skippedFiles: { filename: string; message: string }[] = []

        for (const file of files) {
            const filename = file.filename
            const content = file.content

            if (!filename.toLowerCase().endsWith('.md')) {
                skippedFiles.push({ filename, message: '不是 .md 文件' })
                continue
            }

            try {
                const { meta } = parseFrontmatter(content)

                const idFromMeta = typeof meta.id === 'string' ? meta.id.trim() : ''
                const fileBaseName = basename(filename, '.md')

                // 先看 frontmatter 中是否有 id，没有的话取文件名
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
                skippedFiles.push({ filename, message: e?.message || '读取文件内容失败' })
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
