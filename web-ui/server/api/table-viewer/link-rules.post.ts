import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { defineEventHandler, readBody } from 'h3'

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
const keyOf = (value: string) => value.trim().toLowerCase()

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

  return { fromTable, fromFields: [...new Set(fromFields)], toTable, toKey, label, skipValues }
}

const readConfig = async () => {
  if (!existsSync(LINK_RULES_PATH)) return { version: 1, rules: [] as LinkRule[] }
  const raw = await readFile(LINK_RULES_PATH, 'utf-8')
  const parsed = JSON.parse(raw) as { version?: unknown; rules?: unknown }
  return {
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    rules: Array.isArray(parsed.rules)
      ? parsed.rules.map((rule) => normalizeRule(rule as RawLinkRule)).filter((rule): rule is LinkRule => !!rule)
      : [],
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    fromTable?: unknown
    fromField?: unknown
    toTable?: unknown
    toKey?: unknown
    label?: unknown
    skipValues?: unknown
  }>(event)

  const fromTable = asCleanString(body?.fromTable)
  const fromField = asCleanString(body?.fromField)
  const toTable = asCleanString(body?.toTable)
  const toKey = asCleanString(body?.toKey)
  const label = asCleanString(body?.label) || toTable
  const skipValues = Array.isArray(body?.skipValues)
    ? body.skipValues.map((value) => String(value).trim()).filter(Boolean)
    : ['0']

  if (!fromTable || !fromField || !toTable || !toKey) {
    return {
      success: false,
      error: '缺少 fromTable/fromField/toTable/toKey',
      path: LINK_RULES_PATH,
      rules: [],
    }
  }

  const config = await readConfig()
  const fromTableKey = keyOf(fromTable)
  const fromFieldKey = keyOf(fromField)

  const cleanedRules = config.rules
    .map((rule) => {
      if (keyOf(rule.fromTable) !== fromTableKey) return rule
      return {
        ...rule,
        fromFields: rule.fromFields.filter((field) => keyOf(field) !== fromFieldKey),
      }
    })
    .filter((rule) => rule.fromFields.length > 0)

  const targetRule = cleanedRules.find(
    (rule) =>
      keyOf(rule.fromTable) === fromTableKey &&
      keyOf(rule.toTable) === keyOf(toTable) &&
      keyOf(rule.toKey) === keyOf(toKey) &&
      keyOf(rule.label || '') === keyOf(label || '')
  )

  if (targetRule) {
    targetRule.fromFields.push(fromField)
    targetRule.fromFields = [...new Set(targetRule.fromFields)]
    targetRule.skipValues = [...new Set([...(targetRule.skipValues || []), ...skipValues])]
  } else {
    cleanedRules.push({ fromTable, fromFields: [fromField], toTable, toKey, label, skipValues })
  }

  const nextConfig = { version: config.version || 1, rules: cleanedRules }
  await writeFile(LINK_RULES_PATH, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf-8')

  return {
    success: true,
    version: nextConfig.version,
    path: LINK_RULES_PATH,
    rules: nextConfig.rules,
  }
})
