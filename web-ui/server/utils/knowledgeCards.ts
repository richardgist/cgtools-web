// 知识卡片 - 直接以 Obsidian knowledge-cards 目录作为唯一数据源
import { basename, extname, join, normalize, resolve } from 'path'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs'

export const KNOWLEDGE_CARDS_DIR =
  process.env.KNOWLEDGE_CARDS_DIR ||
  'C:\\Users\\jesephjiang\\Documents\\Obsidian Vault\\TechDebriefs\\knowledge-cards'

export const KNOWLEDGE_MAP_ENTRY_ID = '00-知识体系总图'
export const CARD_ID_PATTERN = /^KC-\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{3}$/

export type KnowledgeNodeType = 'map' | 'moc' | 'hub' | 'card' | 'note' | 'missing'
type FrontmatterValue = string | number | string[]

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
  path?: string
}

export interface KnowledgeNodeRecord extends Omit<KnowledgeCardRecord, 'difficulty'> {
  type: KnowledgeNodeType
  difficulty?: number
}

export interface KnowledgeGraphEdge {
  source: string
  target: string
  label?: string
  missing?: boolean
}

export interface KnowledgeIndex {
  version: number
  updated_at: string
  vaultPath: string
  stats: {
    total: number
    cards: number
    mocs: number
    hubs: number
    maps: number
  }
  cards: Omit<KnowledgeCardRecord, 'content'>[]
}

const pad2 = (value: number) => String(value).padStart(2, '0')

const formatTimestamp = (date: Date) => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

export const createKnowledgeError = (statusCode: number, message: string) => {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode
  return error
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

const extractTitleFromBody = (body: string, fallback: string) => {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading || fallback
}

const normalizeCardId = (id: string) => id.trim().replace(/_/g, '-')

function ensureVaultDir() {
  if (!existsSync(KNOWLEDGE_CARDS_DIR)) {
    mkdirSync(KNOWLEDGE_CARDS_DIR, { recursive: true })
  }
}

function markdownFiles() {
  ensureVaultDir()
  return readdirSync(KNOWLEDGE_CARDS_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === '.md')
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function getNodeType(id: string, metaType?: string): KnowledgeNodeType {
  const normalizedMetaType = String(metaType || '').toLowerCase()
  if (id === KNOWLEDGE_MAP_ENTRY_ID || normalizedMetaType === 'knowledge-map') return 'map'
  if (id.startsWith('MOC-') || normalizedMetaType === 'moc') return 'moc'
  if (id.startsWith('HUB-') || normalizedMetaType === 'hub') return 'hub'
  if (CARD_ID_PATTERN.test(id)) return 'card'
  return 'note'
}

function filePathForId(id: string) {
  return join(KNOWLEDGE_CARDS_DIR, `${id}.md`)
}

function resolveExistingFilePath(id: string) {
  const normalizedId = normalizeCardId(id)
  const direct = filePathForId(normalizedId)
  if (existsSync(direct)) return direct

  // 旧卡片可能使用下划线日期分隔，读取时兼容定位，但写入统一回到短横线 ID。
  const underscoreId = normalizedId.replace(/^KC-(\d{4})-(\d{2})-(\d{2})-(\d{3})$/, 'KC-$1_$2_$3_$4')
  const underscorePath = filePathForId(underscoreId)
  if (existsSync(underscorePath)) return underscorePath

  return null
}

function readNodeFromFile(filename: string): KnowledgeNodeRecord {
  const filePath = join(KNOWLEDGE_CARDS_DIR, filename)
  const raw = readFileSync(filePath, 'utf8')
  const idFromFile = basename(filename, '.md')
  const { meta, body } = parseFrontmatter(raw)
  const idFromMeta = typeof meta.id === 'string' && CARD_ID_PATTERN.test(meta.id.trim()) ? normalizeCardId(meta.id) : ''
  const id = idFromMeta || idFromFile
  const type = getNodeType(id, typeof meta.type === 'string' ? meta.type : '')
  const title = typeof meta.title === 'string' && meta.title.trim()
    ? meta.title.trim()
    : extractTitleFromBody(body, id)
  const tags = Array.isArray(meta.tags) ? meta.tags.map(tag => String(tag)) : []
  const domain = typeof meta.domain === 'string' && meta.domain.trim()
    ? meta.domain.trim()
    : type === 'card' ? '未分类' : type.toUpperCase()
  const difficulty = typeof meta.difficulty === 'number' ? meta.difficulty : type === 'card' ? 1 : undefined

  return {
    id,
    title,
    type,
    domain,
    difficulty,
    date: typeof meta.date === 'string' ? meta.date : '',
    tags,
    summary: typeof meta.summary === 'string' && meta.summary.trim() ? meta.summary.trim() : extractSummary(body),
    content: raw,
    source: typeof meta.source === 'string' ? meta.source : '',
    path: filePath,
  }
}

function scanKnowledgeNodes() {
  return markdownFiles().map(readNodeFromFile)
}

function toCardRecord(node: KnowledgeNodeRecord): KnowledgeCardRecord {
  return {
    id: node.id,
    title: node.title,
    domain: node.domain,
    difficulty: Number(node.difficulty) || 1,
    date: node.date,
    tags: node.tags,
    summary: node.summary,
    content: node.content,
    source: node.source,
    path: node.path,
  }
}

function statsForNodes(nodes: KnowledgeNodeRecord[]) {
  return {
    total: nodes.length,
    cards: nodes.filter(node => node.type === 'card').length,
    mocs: nodes.filter(node => node.type === 'moc').length,
    hubs: nodes.filter(node => node.type === 'hub').length,
    maps: nodes.filter(node => node.type === 'map').length,
  }
}

function stringifyFrontmatterValue(value: FrontmatterValue) {
  if (Array.isArray(value)) {
    const escaped = value.map(item => `'${String(item).replace(/'/g, "\\'")}'`).join(', ')
    return `[${escaped}]`
  }
  return String(value)
}

function buildMarkdownWithFrontmatter(meta: Record<string, FrontmatterValue>, body: string) {
  const lines = Object.entries(meta)
    .filter(([key]) => Boolean(key))
    .map(([key, value]) => `${key}: ${stringifyFrontmatterValue(value)}`)
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`
}

function upsertFrontmatter(content: string, patch: Record<string, FrontmatterValue>, fallbackBody?: string) {
  const { meta, body } = parseFrontmatter(content)
  const merged = { ...meta, ...patch }
  return buildMarkdownWithFrontmatter(merged, fallbackBody ?? body)
}

function nextCardIdForDate(date: Date) {
  const prefix = `KC-${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-`
  let maxSeq = 0
  for (const node of scanKnowledgeNodes()) {
    if (!node.id.startsWith(prefix)) continue
    const seq = Number(node.id.slice(prefix.length))
    if (Number.isInteger(seq) && seq > maxSeq) maxSeq = seq
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`
}

function normalizeCreatedMarkdown(markdown: string, id: string) {
  const normalized = markdown.replace(/^\ufeff/, '').trim()
  const { meta, body } = parseFrontmatter(normalized)
  const today = new Date()
  const summary = typeof meta.summary === 'string' && meta.summary.trim() ? meta.summary : extractSummary(body)
  const title = typeof meta.title === 'string' && meta.title.trim()
    ? meta.title
    : extractTitleFromBody(body, id)

  // 新建卡片时补齐 Obsidian 目录需要的关键 frontmatter，保证 Web 与 Obsidian 看到同一份结构化数据。
  return buildMarkdownWithFrontmatter({
    id,
    title,
    domain: typeof meta.domain === 'string' && meta.domain.trim() ? meta.domain : '未分类',
    difficulty: typeof meta.difficulty === 'number' ? meta.difficulty : 1,
    date: typeof meta.date === 'string' && meta.date.trim()
      ? meta.date
      : `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    ...(typeof meta.source === 'string' && meta.source.trim() ? { source: meta.source } : {}),
    summary,
  }, body || normalized)
}

export function buildKnowledgeIndex(): KnowledgeIndex {
  const nodes = scanKnowledgeNodes()
  const cards = nodes
    .filter(node => node.type === 'card')
    .map(toCardRecord)
    .map(({ content: _content, ...card }) => card)
    .sort((a, b) => b.id.localeCompare(a.id))

  return {
    version: 2,
    updated_at: formatTimestamp(new Date()),
    vaultPath: KNOWLEDGE_CARDS_DIR,
    stats: statsForNodes(nodes),
    cards,
  }
}

export function getKnowledgeCard(id: string): KnowledgeCardRecord | null {
  const filePath = resolveExistingFilePath(id)
  if (!filePath) return null
  return toCardRecord(readNodeFromFile(basename(filePath)))
}

export function getCardMarkdownBody(id: string): string | null {
  const card = getKnowledgeCard(id)
  return card?.content ?? null
}

export function updateKnowledgeCardBody(id: string, markdownBody: string): KnowledgeCardRecord | null {
  const normalizedId = normalizeCardId(id)
  const normalizedBody = markdownBody.replace(/^\ufeff/, '').trim()
  if (!normalizedBody) {
    throw createKnowledgeError(400, 'Card markdown body is empty')
  }

  const filePath = resolveExistingFilePath(normalizedId)
  if (!filePath) return null

  const existing = readFileSync(filePath, 'utf8')
  const summary = extractSummary(normalizedBody).replace(/\r?\n+/g, ' ').trim()

  // 编辑框只编辑正文，这里保留原 frontmatter，并同步 summary，避免 Web 保存破坏 Obsidian 元数据。
  const contentToSave = upsertFrontmatter(existing, { id: normalizedId, summary }, normalizedBody)
  writeFileSync(filePath, contentToSave, 'utf8')

  return getKnowledgeCard(normalizedId)
}

export function createKnowledgeCardFromMarkdown(markdown: string, overwrite = false) {
  const normalized = markdown.replace(/^\ufeff/, '').trim()
  if (!normalized) {
    throw createKnowledgeError(400, 'Card markdown is empty')
  }

  const { meta } = parseFrontmatter(normalized)
  const rawId = typeof meta.id === 'string' ? meta.id.trim() : ''
  const id = rawId ? normalizeCardId(rawId) : nextCardIdForDate(new Date())
  if (!CARD_ID_PATTERN.test(id)) {
    throw createKnowledgeError(400, 'Card id must match KC-YYYY-MM-DD-NNN or KC-YYYY_MM_DD_NNN')
  }

  ensureVaultDir()
  const filePath = filePathForId(id)
  const existingPath = resolveExistingFilePath(id)
  if (existingPath && !overwrite) {
    throw createKnowledgeError(409, `Card already exists: ${id}`)
  }

  writeFileSync(existingPath || filePath, normalizeCreatedMarkdown(normalized, id), 'utf8')
  const index = buildKnowledgeIndex()

  return {
    id,
    created: !existingPath,
    index,
  }
}

export function deleteKnowledgeCard(id: string): boolean {
  const filePath = resolveExistingFilePath(id)
  if (!filePath) return false
  unlinkSync(filePath)
  return true
}

export function batchDeleteCards(ids: string[]): { deleted: number; notFound: string[] } {
  let deleted = 0
  const notFound: string[] = []

  for (const id of ids) {
    if (deleteKnowledgeCard(id)) {
      deleted++
    } else {
      notFound.push(id)
    }
  }

  return { deleted, notFound }
}

export function findDuplicateCards(): {
  groups: { title: string; keep: Omit<KnowledgeCardRecord, 'content'>; duplicates: Omit<KnowledgeCardRecord, 'content'>[] }[]
  totalDuplicates: number
} {
  const cards = scanKnowledgeNodes()
    .filter(node => node.type === 'card')
    .map(toCardRecord)
    .sort((a, b) => a.id.localeCompare(b.id))

  const groupMap = new Map<string, KnowledgeCardRecord[]>()
  for (const card of cards) {
    const titleKey = card.title.trim()
    if (!titleKey) continue
    if (!groupMap.has(titleKey)) groupMap.set(titleKey, [])
    groupMap.get(titleKey)!.push(card)
  }

  const groups: { title: string; keep: any; duplicates: any[] }[] = []
  let totalDuplicates = 0

  for (const [title, groupedCards] of groupMap) {
    if (groupedCards.length < 2) continue
    const [keep, ...duplicates] = groupedCards.map(({ content: _content, ...card }) => card)
    groups.push({ title, keep, duplicates })
    totalDuplicates += duplicates.length
  }

  return { groups, totalDuplicates }
}

export function batchImportCards(
  items: { id: string; markdown: string }[],
  overwrite = false
): { imported: number; skipped: number; errors: number; results: { id: string; status: string; message?: string }[] } {
  let imported = 0
  let skipped = 0
  let errors = 0
  const results: { id: string; status: string; message?: string }[] = []

  for (const item of items) {
    try {
      const id = normalizeCardId(item.id)
      const existingPath = resolveExistingFilePath(id)
      if (existingPath && !overwrite) {
        results.push({ id, status: 'skipped', message: `卡片已存在: ${id}` })
        skipped++
        continue
      }

      writeFileSync(existingPath || filePathForId(id), normalizeCreatedMarkdown(item.markdown, id), 'utf8')
      results.push({ id, status: existingPath ? 'overwritten' : 'imported' })
      imported++
    } catch (e: any) {
      results.push({ id: item.id, status: 'error', message: e?.message || '导入失败' })
      errors++
    }
  }

  return { imported, skipped, errors, results }
}

function normalizeWikiTarget(rawTarget: string) {
  const target = rawTarget.split('|')[0] || ''
  return target
    .split('#')[0]!
    .trim()
    .replace(/\.md$/i, '')
}

function extractWikiLinks(content: string) {
  const links: { target: string; label?: string }[] = []
  const regex = /\[\[([^\]]+)\]\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const raw = (match[1] || '').trim()
    const target = normalizeWikiTarget(raw)
    if (!target) continue
    const label = raw.includes('|') ? raw.split('|').slice(1).join('|').trim() : undefined
    links.push({ target, label })
  }
  return links
}

export function buildKnowledgeGraph() {
  const nodes = scanKnowledgeNodes()
  const nodeIds = new Set(nodes.map(node => node.id))
  const edges: KnowledgeGraphEdge[] = []
  const seenEdges = new Set<string>()

  for (const node of nodes) {
    for (const link of extractWikiLinks(node.content)) {
      const target = nodeIds.has(link.target) ? link.target : link.target.replace(/_/g, '-')
      const exists = nodeIds.has(target)
      const edgeKey = `${node.id}->${target}`
      if (seenEdges.has(edgeKey)) continue
      seenEdges.add(edgeKey)
      edges.push({
        source: node.id,
        target,
        label: link.label,
        missing: !exists,
      })
    }
  }

  return {
    entryId: KNOWLEDGE_MAP_ENTRY_ID,
    updated_at: formatTimestamp(new Date()),
    vaultPath: KNOWLEDGE_CARDS_DIR,
    stats: statsForNodes(nodes),
    nodes: nodes.map(({ content: _content, ...node }) => node),
    edges,
  }
}

export function resolveKnowledgeAssetPath(rawPath: string) {
  const decoded = decodeURIComponent(rawPath)
  const safePath = normalize(decoded).replace(/^(\.\.[\\/])+/, '')
  const resolved = resolve(KNOWLEDGE_CARDS_DIR, safePath)
  const vaultRoot = resolve(KNOWLEDGE_CARDS_DIR)

  if (!resolved.startsWith(vaultRoot)) {
    throw createKnowledgeError(400, 'Invalid asset path')
  }
  if (!existsSync(resolved)) {
    throw createKnowledgeError(404, 'Asset not found')
  }
  return resolved
}
