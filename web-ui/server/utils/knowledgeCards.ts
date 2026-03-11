import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

export interface KnowledgeCardRecord {
  id: string
  title: string
  domain: string
  difficulty: number
  date: string
  tags: string[]
  summary: string
  file: string
  source?: string
}

export interface KnowledgeIndex {
  version: number
  updated_at: string
  cards: KnowledgeCardRecord[]
}

export const CARDS_DIR = String.raw`C:\Users\jesephjiang\Documents\Obsidian Vault\TechDebriefs\knowledge-cards`

const INDEX_PATH = resolve(CARDS_DIR, '_index.json')
const CARD_FILE_PATTERN = /^KC-\d{4}-\d{2}-\d{2}-\d{3}\.md$/

type FrontmatterValue = string | number | string[]

const pad2 = (value: number) => String(value).padStart(2, '0')

const formatTimestamp = (date: Date) => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

const parseFrontmatter = (content: string) => {
  const normalized = content.replace(/^\ufeff/, '')
  const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)
  if (!match) {
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

  return { meta, body: match[2] }
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

const readCard = (filename: string): KnowledgeCardRecord => {
  const filePath = resolve(CARDS_DIR, filename)
  const fileId = filename.replace(/\.md$/i, '')
  const content = readFileSync(filePath, 'utf-8')
  const { meta, body } = parseFrontmatter(content)

  return {
    id: fileId,
    title: typeof meta.title === 'string' && meta.title.trim() ? meta.title : fileId,
    domain: typeof meta.domain === 'string' && meta.domain.trim() ? meta.domain : '未分类',
    difficulty: typeof meta.difficulty === 'number' ? meta.difficulty : 1,
    date: typeof meta.date === 'string' ? meta.date : '',
    tags: Array.isArray(meta.tags) ? meta.tags.map(tag => String(tag)) : [],
    summary: typeof meta.summary === 'string' && meta.summary.trim() ? meta.summary : extractSummary(body),
    file: filename,
    source: typeof meta.source === 'string' ? meta.source : '',
  }
}

export const buildKnowledgeIndex = (): KnowledgeIndex => {
  const cards = readdirSync(CARDS_DIR)
    .filter(filename => CARD_FILE_PATTERN.test(filename))
    .sort((left, right) => left.localeCompare(right))
    .map(readCard)

  const index: KnowledgeIndex = {
    version: 1,
    updated_at: formatTimestamp(new Date()),
    cards,
  }

  try {
    writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, 'utf-8')
  } catch (error) {
    console.warn('Failed to sync knowledge index cache:', error)
  }

  return index
}
