// 知识卡片 - SQLite 数据库初始化和工具函数
import Database from 'better-sqlite3'
import { resolve } from 'path'
import { mkdirSync } from 'fs'

// 与 focusDb.ts 使用同一个目录
const DB_DIR = resolve(process.cwd(), 'server/db')
const DB_PATH = resolve(DB_DIR, 'knowledge.db')

let _db: Database.Database | null = null

export interface KnowledgeCardRecord {
  id: string
  title: string
  domain: string
  difficulty: number
  date: string
  tags: string[]
  summary: string
  content: string
  source?: string
}

export interface KnowledgeIndex {
  version: number
  updated_at: string
  cards: Omit<KnowledgeCardRecord, 'content'>[]
}

export const CARD_ID_PATTERN = /^KC-\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{3}$/

type FrontmatterValue = string | number | string[]

const pad2 = (value: number) => String(value).padStart(2, '0')

const formatTimestamp = (date: Date) => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

export const parseFrontmatter = (content: string) => {
  const normalized = content.replace(/^\ufeff/, '')
  const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)
  if (!match?.[1]) {
    return { meta: {} as Record<string, FrontmatterValue>, body: normalized }
  }

  const meta: Record<string, FrontmatterValue> = {}
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf(':')
    if (separatorIndex < 0) continue

    const key = line.slice(0, separatorIndex).trim()
    const rawValue = line.slice(separatorIndex + 1).trim()
    if (!key) continue

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      meta[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
      continue
    }

    if (/^\d+$/.test(rawValue)) {
      meta[key] = Number(rawValue)
      continue
    }

    meta[key] = rawValue.replace(/^['"]|['"]$/g, '')
  }

  return { meta, body: match[2] ?? '' }
}

export const createKnowledgeError = (statusCode: number, message: string) => {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode
  return error
}

const extractSummary = (body: string) => {
  const sectionMatch = body.match(/##\s*一句话总结\s*\r?\n+([\s\S]*?)(?:\r?\n\r?\n|\r?\n##|\Z)/)
  if (sectionMatch?.[1]) {
    return sectionMatch[1].trim()
  }

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    return line
  }

  return ''
}

// ==================== 数据库操作 ====================

function getDb(): Database.Database {
  if (_db) return _db

  mkdirSync(DB_DIR, { recursive: true })

  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')

  _db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_cards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      domain TEXT NOT NULL DEFAULT '未分类',
      difficulty INTEGER NOT NULL DEFAULT 1,
      date TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `)

  return _db
}

/** 从数据库行转换为 KnowledgeCardRecord */
function rowToCard(row: any): KnowledgeCardRecord {
  return {
    id: row.id,
    title: row.title,
    domain: row.domain,
    difficulty: row.difficulty,
    date: row.date,
    tags: JSON.parse(row.tags || '[]'),
    summary: row.summary,
    content: row.content,
    source: row.source || '',
  }
}

/** 获取所有卡片的索引（不含 content） */
export function buildKnowledgeIndex(): KnowledgeIndex {
  const db = getDb()
  const rows = db.prepare(
    'SELECT id, title, domain, difficulty, date, tags, summary, source FROM knowledge_cards ORDER BY id ASC'
  ).all()

  const cards = rows.map((row: any) => ({
    id: row.id,
    title: row.title,
    domain: row.domain,
    difficulty: row.difficulty,
    date: row.date,
    tags: JSON.parse(row.tags || '[]'),
    summary: row.summary,
    source: row.source || '',
  }))

  return {
    version: 1,
    updated_at: formatTimestamp(new Date()),
    cards,
  }
}

/** 获取单张卡片的完整内容 */
export function getKnowledgeCard(id: string): KnowledgeCardRecord | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM knowledge_cards WHERE id = ?').get(id) as any
  if (!row) return null
  return rowToCard(row)
}

/** 获取卡片的原始 Markdown 内容 */
export function getCardMarkdownBody(id: string): string | null {
  const db = getDb()
  const row = db.prepare('SELECT content FROM knowledge_cards WHERE id = ?').get(id) as any
  if (!row) return null
  return row.content
}

export function updateKnowledgeCardBody(id: string, markdownBody: string): KnowledgeCardRecord | null {
  const normalizedBody = markdownBody.replace(/^\ufeff/, '').trim()
  if (!normalizedBody) {
    throw createKnowledgeError(400, 'Card markdown body is empty')
  }

  const db = getDb()
  const existing = db.prepare('SELECT * FROM knowledge_cards WHERE id = ?').get(id) as any
  if (!existing) {
    return null
  }

  const summary = extractSummary(normalizedBody).replace(/\r?\n+/g, ' ').trim()
  const now = formatTimestamp(new Date())
  const rawContent = String(existing.content || '').replace(/^\ufeff/, '')
  const frontmatterMatch = rawContent.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/)

  let contentToSave = ''
  if (frontmatterMatch?.[1]) {
    let frontmatter = frontmatterMatch[1]

    if (/^id\s*:/m.test(frontmatter)) {
      frontmatter = frontmatter.replace(/^id\s*:.*$/m, `id: ${id}`)
    } else {
      frontmatter = `id: ${id}\n${frontmatter}`
    }

    if (/^summary\s*:/m.test(frontmatter)) {
      frontmatter = frontmatter.replace(/^summary\s*:.*$/m, `summary: ${summary}`)
    } else {
      frontmatter = `${frontmatter}\nsummary: ${summary}`
    }

    contentToSave = `---\n${frontmatter}\n---\n\n${normalizedBody}\n`
  } else {
    let parsedTags: any[] = []
    try {
      const candidate = JSON.parse(existing.tags || '[]')
      parsedTags = Array.isArray(candidate) ? candidate : []
    } catch {
      parsedTags = []
    }
    const tags = parsedTags
    const escapedTags = tags.map((tag: any) => `'${String(tag).replace(/'/g, "\\'")}'`).join(', ')
    const sourceLine = existing.source ? `\nsource: ${String(existing.source)}` : ''

    contentToSave =
      `---\n` +
      `id: ${id}\n` +
      `title: ${existing.title || id}\n` +
      `domain: ${existing.domain || '未分类'}\n` +
      `difficulty: ${Number(existing.difficulty) || 1}\n` +
      `date: ${existing.date || ''}\n` +
      `tags: [${escapedTags}]\n` +
      `summary: ${summary}${sourceLine}\n` +
      `---\n\n` +
      `${normalizedBody}\n`
  }

  db.prepare('UPDATE knowledge_cards SET summary=?, content=?, updated_at=? WHERE id=?')
    .run(summary, contentToSave, now, id)

  return getKnowledgeCard(id)
}

/** 创建或更新一张卡片（从完整 Markdown 内容） */
export function createKnowledgeCardFromMarkdown(markdown: string, overwrite = false) {
  const normalized = markdown.replace(/^\ufeff/, '').trim()
  if (!normalized) {
    throw createKnowledgeError(400, 'Card markdown is empty')
  }

  const { meta, body } = parseFrontmatter(normalized)
  const id = typeof meta.id === 'string' ? meta.id.trim() : ''
  if (!id) {
    throw createKnowledgeError(400, 'Card frontmatter must include id')
  }

  if (!CARD_ID_PATTERN.test(id)) {
    throw createKnowledgeError(400, 'Card id must match KC-YYYY-MM-DD-NNN or KC-YYYY_MM_DD_NNN')
  }

  const db = getDb()
  const existing = db.prepare('SELECT id FROM knowledge_cards WHERE id = ?').get(id) as any

  if (existing && !overwrite) {
    throw createKnowledgeError(409, `Card already exists: ${id}`)
  }

  const now = formatTimestamp(new Date())
  const title = typeof meta.title === 'string' && meta.title.trim() ? meta.title : id
  const domain = typeof meta.domain === 'string' && meta.domain.trim() ? meta.domain : '未分类'
  const difficulty = typeof meta.difficulty === 'number' ? meta.difficulty : 1
  const date = typeof meta.date === 'string' ? meta.date : ''
  const tags = Array.isArray(meta.tags) ? meta.tags.map(tag => String(tag)) : []
  const summary = typeof meta.summary === 'string' && meta.summary.trim() ? meta.summary : extractSummary(body ?? '')
  const source = typeof meta.source === 'string' ? meta.source : ''

  if (existing) {
    db.prepare(`
      UPDATE knowledge_cards SET title=?, domain=?, difficulty=?, date=?, tags=?, summary=?, content=?, source=?, updated_at=?
      WHERE id=?
    `).run(title, domain, difficulty, date, JSON.stringify(tags), summary, normalized, source, now, id)
  } else {
    db.prepare(`
      INSERT INTO knowledge_cards (id, title, domain, difficulty, date, tags, summary, content, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, domain, difficulty, date, JSON.stringify(tags), summary, normalized, source, now, now)
  }

  const index = buildKnowledgeIndex()

  return {
    id,
    created: !existing,
    index,
  }
}

/** 删除一张卡片 */
export function deleteKnowledgeCard(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM knowledge_cards WHERE id = ?').run(id)
  return result.changes > 0
}

/** 查找重复卡片（按 title 分组，同标题多张即为重复） */
export function findDuplicateCards(): {
  groups: { title: string; keep: Omit<KnowledgeCardRecord, 'content'>; duplicates: Omit<KnowledgeCardRecord, 'content'>[] }[]
  totalDuplicates: number
} {
  const db = getDb()
  // 找出有重复 title 的所有卡片（按 id 升序，最小 id 的保留）
  const rows = db.prepare(`
    SELECT id, title, domain, difficulty, date, tags, summary, source, created_at
    FROM knowledge_cards
    WHERE title IN (
      SELECT title FROM knowledge_cards GROUP BY title HAVING COUNT(*) > 1
    )
    ORDER BY title ASC, id ASC
  `).all() as any[]

  const groupMap = new Map<string, any[]>()
  for (const row of rows) {
    const card = {
      id: row.id,
      title: row.title,
      domain: row.domain,
      difficulty: row.difficulty,
      date: row.date,
      tags: JSON.parse(row.tags || '[]'),
      summary: row.summary,
      source: row.source || '',
    }
    if (!groupMap.has(row.title)) {
      groupMap.set(row.title, [])
    }
    groupMap.get(row.title)!.push(card)
  }

  const groups: { title: string; keep: any; duplicates: any[] }[] = []
  let totalDuplicates = 0

  for (const [title, cards] of groupMap) {
    const [keep, ...duplicates] = cards
    groups.push({ title, keep, duplicates })
    totalDuplicates += duplicates.length
  }

  return { groups, totalDuplicates }
}

/** 批量删除卡片 */
export function batchDeleteCards(ids: string[]): { deleted: number; notFound: string[] } {
  const db = getDb()
  let deleted = 0
  const notFound: string[] = []

  const deleteTransaction = db.transaction(() => {
    for (const id of ids) {
      const result = db.prepare('DELETE FROM knowledge_cards WHERE id = ?').run(id)
      if (result.changes > 0) {
        deleted++
      } else {
        notFound.push(id)
      }
    }
  })

  deleteTransaction()
  return { deleted, notFound }
}

/** 批量导入卡片（从 markdown 数组） */
export function batchImportCards(
  items: { id: string; markdown: string }[],
  overwrite = false
): { imported: number; skipped: number; errors: number; results: { id: string; status: string; message?: string }[] } {
  const db = getDb()
  let imported = 0
  let skipped = 0
  let errors = 0
  const results: { id: string; status: string; message?: string }[] = []

  const insertOrUpdate = db.transaction(() => {
    for (const item of items) {
      try {
        const existing = db.prepare('SELECT id FROM knowledge_cards WHERE id = ?').get(item.id) as any

        if (existing && !overwrite) {
          results.push({ id: item.id, status: 'skipped', message: `卡片已存在: ${item.id}` })
          skipped++
          continue
        }

        const { meta, body } = parseFrontmatter(item.markdown)
        const now = formatTimestamp(new Date())
        const title = typeof meta.title === 'string' && meta.title.trim() ? meta.title : item.id
        const domain = typeof meta.domain === 'string' && meta.domain.trim() ? meta.domain : '未分类'
        const difficulty = typeof meta.difficulty === 'number' ? meta.difficulty : 1
        const date = typeof meta.date === 'string' ? meta.date : ''
        const tags = Array.isArray(meta.tags) ? meta.tags.map(tag => String(tag)) : []
        const summary = typeof meta.summary === 'string' && meta.summary.trim() ? meta.summary : extractSummary(body ?? '')
        const source = typeof meta.source === 'string' ? meta.source : ''

        if (existing) {
          db.prepare(`
            UPDATE knowledge_cards SET title=?, domain=?, difficulty=?, date=?, tags=?, summary=?, content=?, source=?, updated_at=?
            WHERE id=?
          `).run(title, domain, difficulty, date, JSON.stringify(tags), summary, item.markdown, source, now, item.id)
          results.push({ id: item.id, status: 'overwritten' })
        } else {
          db.prepare(`
            INSERT INTO knowledge_cards (id, title, domain, difficulty, date, tags, summary, content, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(item.id, title, domain, difficulty, date, JSON.stringify(tags), summary, item.markdown, source, now, now)
          results.push({ id: item.id, status: 'imported' })
        }
        imported++
      } catch (e: any) {
        results.push({ id: item.id, status: 'error', message: e?.message || '导入失败' })
        errors++
      }
    }
  })

  insertOrUpdate()

  return { imported, skipped, errors, results }
}
