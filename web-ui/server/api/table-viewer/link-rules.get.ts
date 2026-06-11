import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import { defineEventHandler } from 'h3'

const TABLE_VIEWER_HTML_PATH = 'E:/CJGame/trunk/xls/table_viewer/table_viewer.html'
const LINK_RULES_PATH = path.resolve(path.dirname(TABLE_VIEWER_HTML_PATH), 'table_links.json')

type RawLinkRule = {
  fromTable?: unknown
  fromFields?: unknown
  toTable?: unknown
  toKey?: unknown
  label?: unknown
  skipValues?: unknown
}

type LinkRule = {
  fromTable: string
  fromFields: string[]
  toTable: string
  toKey: string
  label: string
  skipValues: string[]
}

const asCleanString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const normalizeRule = (rule: RawLinkRule): LinkRule | null => {
  const fromTable = asCleanString(rule.fromTable)
  const toTable = asCleanString(rule.toTable)
  const toKey = asCleanString(rule.toKey)
  const fromFields = Array.isArray(rule.fromFields)
    ? rule.fromFields.map(asCleanString).filter(Boolean)
    : []

  if (!fromTable || fromFields.length === 0 || !toTable || !toKey) return null

  const label = asCleanString(rule.label) || toTable
  const skipValues = Array.isArray(rule.skipValues)
    ? rule.skipValues.map((value) => String(value).trim()).filter(Boolean)
    : []

  return { fromTable, fromFields, toTable, toKey, label, skipValues }
}

export default defineEventHandler(async () => {
  if (!existsSync(LINK_RULES_PATH)) {
    return {
      success: false,
      error: '链接规则文件不存在',
      path: LINK_RULES_PATH,
      rules: [],
    }
  }

  try {
    const raw = await readFile(LINK_RULES_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as { version?: unknown; rules?: unknown }
    const rules = Array.isArray(parsed.rules)
      ? parsed.rules.map((rule) => normalizeRule(rule as RawLinkRule)).filter((rule): rule is LinkRule => !!rule)
      : []

    return {
      success: true,
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      path: LINK_RULES_PATH,
      rules,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '链接规则解析失败',
      path: LINK_RULES_PATH,
      rules: [],
    }
  }
})
