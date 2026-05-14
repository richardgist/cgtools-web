export type ScriptParameterInfo = {
  key: string
  name: string
  label: string
  type: 'text' | 'folder' | 'number' | 'switch'
  defaultValue: string | boolean
  placeholder: string
  argName: string
  required: boolean
  aliases: string[]
}

const PARAM_BLOCK_RE = /\bparam\s*\(/i

const toCamelKey = (name: string) => name.charAt(0).toLowerCase() + name.slice(1)

const toLabel = (name: string) => name
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/^./, (char) => char.toUpperCase())

const readBalancedParentheses = (source: string, openParenIndex: number) => {
  let depth = 0
  let quote: string | null = null
  let escaped = false

  for (let index = openParenIndex; index < source.length; index += 1) {
    const char = source[index]

    if (quote) {
      if (char === '`' && !escaped) {
        escaped = true
        continue
      }
      if (char === quote && !escaped) {
        quote = null
      }
      escaped = false
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '(') {
      depth += 1
      continue
    }
    if (char === ')') {
      depth -= 1
      if (depth === 0) {
        return source.slice(openParenIndex + 1, index)
      }
    }
  }

  return ''
}

const splitParameterEntries = (body: string) => {
  const entries: string[] = []
  let start = 0
  let parenDepth = 0
  let bracketDepth = 0
  let quote: string | null = null
  let escaped = false

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]

    if (quote) {
      if (char === '`' && !escaped) {
        escaped = true
        continue
      }
      if (char === quote && !escaped) {
        quote = null
      }
      escaped = false
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '(') parenDepth += 1
    if (char === ')') parenDepth -= 1
    if (char === '[') bracketDepth += 1
    if (char === ']') bracketDepth -= 1

    if (char === ',' && parenDepth === 0 && bracketDepth === 0) {
      entries.push(body.slice(start, index).trim())
      start = index + 1
    }
  }

  const tail = body.slice(start).trim()
  if (tail) entries.push(tail)
  return entries
}

const parseDefaultValue = (raw: string, parameterType: ScriptParameterInfo['type']) => {
  const value = raw.trim()
  const stringMatch = value.match(/^(['"])([\s\S]*)\1$/)
  if (stringMatch) return stringMatch[2] || ''
  if (parameterType === 'switch') return false
  if (/^\$true$/i.test(value)) return true
  if (/^\$false$/i.test(value)) return false
  return value
}

const inferParameterType = (powerShellType: string, name: string): ScriptParameterInfo['type'] => {
  const normalizedType = powerShellType.toLowerCase()
  if (normalizedType.includes('switch')) return 'switch'
  if (/^(int|int32|int64|long|double|float|decimal)$/.test(normalizedType)) return 'number'
  if (/(path|dir|folder|root)$/i.test(name) || /(path|dir|folder|root)/i.test(name)) return 'folder'
  return 'text'
}

const parseAliases = (entry: string) => {
  const aliases: string[] = []
  const aliasRe = /\[\s*Alias\s*\(([^)]*)\)\s*\]/gi
  for (const match of entry.matchAll(aliasRe)) {
    const rawAliases = match[1] || ''
    for (const aliasMatch of rawAliases.matchAll(/['"]([^'"]+)['"]/g)) {
      aliases.push(aliasMatch[1] || '')
    }
  }
  return aliases.filter(Boolean)
}

export const parsePowerShellParameters = (source: string): ScriptParameterInfo[] => {
  const paramMatch = PARAM_BLOCK_RE.exec(source)
  if (!paramMatch || paramMatch.index === undefined) return []

  const openParenIndex = source.indexOf('(', paramMatch.index)
  const body = readBalancedParentheses(source, openParenIndex)
  if (!body) return []

  return splitParameterEntries(body)
    .map((entry) => {
      const variableMatch = entry.match(/\$([A-Za-z_][A-Za-z0-9_]*)/)
      if (!variableMatch) return null

      const name = variableMatch[1] || ''
      const beforeVariable = entry.slice(0, variableMatch.index)
      const typeMatches = [...beforeVariable.matchAll(/\[\s*([A-Za-z0-9_.]+)(?:\s*\([^)]*\))?\s*\]/g)]
        .map((match) => match[1] || '')
        .filter((typeName) => !/^Alias$/i.test(typeName) && !/^Parameter$/i.test(typeName))
      const powerShellType = typeMatches[typeMatches.length - 1] || 'string'
      const type = inferParameterType(powerShellType, name)
      const defaultMatch = entry.slice((variableMatch.index || 0) + variableMatch[0].length).match(/^\s*=\s*([\s\S]+)$/)
      const defaultValue = defaultMatch ? parseDefaultValue(defaultMatch[1] || '', type) : (type === 'switch' ? false : '')

      return {
        key: toCamelKey(name),
        name,
        label: toLabel(name),
        type,
        defaultValue,
        placeholder: '',
        argName: `-${name}`,
        required: type !== 'switch' && !defaultMatch && /\[\s*Parameter\s*\([^)]*Mandatory\s*=\s*\$true/i.test(entry),
        aliases: parseAliases(entry),
      }
    })
    .filter((param): param is ScriptParameterInfo => Boolean(param))
}
