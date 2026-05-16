import * as fs from 'fs'
import * as path from 'path'
import {
  PROJECT_BUILT_IN_CONSOLE_COMMANDS,
  PROJECT_BUILT_IN_CONSOLE_COMMAND_SOURCE,
} from './builtInConsoleCommands'
import { getScriptsDir } from './scriptRegistry'

export type UeConsoleCommand = {
  name: string
  description: string
  insertText?: string
  category?: string
  source?: string
  aliases?: string[]
}

export type UeConsoleCommandSnapshot = {
  commands: UeConsoleCommand[]
  sourcePath: string
  updatedAt: number
}

export type UeCVarEntry = {
  index: string
  name: string
  value: string
}

export type UeCVarSnapshot = {
  rows: UeCVarEntry[]
  sourcePath: string
  updatedAt: number
}

const COMMAND_NAME_PATTERN = /^[A-Za-z0-9_.:-]+(?:\s+[A-Za-z0-9_.:-]+)*$/

const parseCsvLine = (line: string) => {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

const isCommandName = (value: string) => {
  if (!value || value.length > 160) return false
  const lower = value.toLowerCase()
  if (lower === 'name' || lower === 'command' || lower === 'cvar') return false
  return COMMAND_NAME_PATTERN.test(value)
}

export const parseConsoleCommandCsv = (content: string): UeConsoleCommand[] => {
  const result: UeConsoleCommand[] = []
  const seen = new Set<string>()
  let nameColumnIndex = 0
  let descriptionColumnIndex = 1
  let hasDetectedHeader = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const cells = parseCsvLine(line)
    if (!hasDetectedHeader) {
      const lowerCells = cells.map((cell) => cell.trim().toLowerCase())
      const detectedNameIndex = lowerCells.indexOf('name')
      if (detectedNameIndex >= 0) {
        nameColumnIndex = detectedNameIndex
        const helpIndex = lowerCells.findIndex((cell) => ['help', 'description', 'desc'].includes(cell))
        const valueIndex = lowerCells.indexOf('value')
        descriptionColumnIndex = helpIndex >= 0 ? helpIndex : valueIndex
        hasDetectedHeader = true
        continue
      }

      hasDetectedHeader = true
    }

    const name = (cells[nameColumnIndex] || '').trim()
    if (!isCommandName(name)) continue

    const key = name.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    result.push({
      name,
      description: descriptionColumnIndex >= 0 ? (cells[descriptionColumnIndex] || '').trim() : '',
    })
  }

  return result
}

export const parseCVarCsv = (content: string): UeCVarEntry[] => {
  const result: UeCVarEntry[] = []
  let indexColumnIndex = 0
  let nameColumnIndex = 1
  let valueColumnIndex = 2
  let hasDetectedHeader = false

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const cells = parseCsvLine(line)
    const lowerCells = cells.map((cell) => cell.trim().toLowerCase())
    const detectedNameIndex = lowerCells.indexOf('name')
    if (!hasDetectedHeader && detectedNameIndex >= 0) {
      indexColumnIndex = lowerCells.indexOf('index')
      nameColumnIndex = detectedNameIndex
      valueColumnIndex = lowerCells.indexOf('value')
      hasDetectedHeader = true
      continue
    }

    if (lowerCells[nameColumnIndex] === 'name') {
      continue
    }

    hasDetectedHeader = true
    const name = (cells[nameColumnIndex] || '').trim()
    if (!name) continue

    result.push({
      index: indexColumnIndex >= 0 ? (cells[indexColumnIndex] || '').trim() : String(result.length),
      name,
      value: valueColumnIndex >= 0 ? (cells[valueColumnIndex] || '').trim() : '',
    })
  }

  return result
}

export const mergeBuiltInConsoleCommands = (commands: UeConsoleCommand[]) => {
  const result: UeConsoleCommand[] = []
  const seen = new Set<string>()

  for (const command of [...PROJECT_BUILT_IN_CONSOLE_COMMANDS, ...commands]) {
    const name = command.name.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue

    seen.add(key)
    result.push({
      ...command,
      name,
      description: command.description.trim(),
      insertText: command.insertText,
      aliases: command.aliases?.map((alias) => alias.trim()).filter(Boolean),
    })
  }

  return result
}

const getSuggestionSearchFields = (command: UeConsoleCommand) => [
  command.name,
  command.insertText || '',
  command.description,
  command.category || '',
  command.source || '',
  ...(command.aliases || []),
].map((field) => field.toLowerCase())

export const filterConsoleCommandSuggestions = (
  commands: UeConsoleCommand[],
  prefix: string,
  limit = 16,
) => {
  const normalizedPrefix = prefix.trim().toLowerCase()
  if (!normalizedPrefix) return []

  const startsWith: UeConsoleCommand[] = []
  const contains: UeConsoleCommand[] = []

  for (const command of commands) {
    const fields = getSuggestionSearchFields(command)
    if (fields.some((field) => field.startsWith(normalizedPrefix))) {
      startsWith.push(command)
    } else if (fields.some((field) => field.includes(normalizedPrefix))) {
      contains.push(command)
    }
  }

  return [...startsWith, ...contains].slice(0, limit)
}

export const getConsoleCommandLogsDir = () => path.resolve(getScriptsDir(), '..', 'PerformanceData', 'Logs')

export const getLatestConsoleCommandCsvPath = () => {
  const logsDir = getConsoleCommandLogsDir()
  if (!fs.existsSync(logsDir)) return ''

  const candidates = fs.readdirSync(logsDir)
    .filter((file) => /^CVar_.*\.csv$/i.test(file))
    .map((file) => {
      const fullPath = path.join(logsDir, file)
      const stat = fs.statSync(fullPath)
      return { fullPath, updatedAt: stat.mtimeMs }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)

  return candidates[0]?.fullPath || ''
}

export const loadLatestConsoleCommandSnapshot = (): UeConsoleCommandSnapshot => {
  const sourcePath = getLatestConsoleCommandCsvPath()
  if (!sourcePath) {
    return { commands: mergeBuiltInConsoleCommands([]), sourcePath: PROJECT_BUILT_IN_CONSOLE_COMMAND_SOURCE, updatedAt: 0 }
  }

  return loadConsoleCommandSnapshotFromPath(sourcePath)
}

export const loadConsoleCommandSnapshotFromPath = (sourcePath: string): UeConsoleCommandSnapshot => {
  const resolvedPath = path.resolve(sourcePath)
  const stat = fs.statSync(resolvedPath)
  if (!stat.isFile()) {
    throw new Error(`命令库路径不是文件：${resolvedPath}`)
  }

  const content = fs.readFileSync(sourcePath, 'utf-8')
  return {
    commands: mergeBuiltInConsoleCommands(parseConsoleCommandCsv(content)),
    sourcePath: resolvedPath,
    updatedAt: stat.mtimeMs,
  }
}

export const loadLatestCVarSnapshot = (): UeCVarSnapshot => {
  const sourcePath = getLatestConsoleCommandCsvPath()
  if (!sourcePath) {
    return { rows: [], sourcePath: '', updatedAt: 0 }
  }

  return loadCVarSnapshotFromPath(sourcePath)
}

export const loadCVarSnapshotFromPath = (sourcePath: string): UeCVarSnapshot => {
  const resolvedPath = path.resolve(sourcePath)
  const stat = fs.statSync(resolvedPath)
  if (!stat.isFile()) {
    throw new Error(`CVar 路径不是文件：${resolvedPath}`)
  }

  const content = fs.readFileSync(sourcePath, 'utf-8')
  return {
    rows: parseCVarCsv(content),
    sourcePath: resolvedPath,
    updatedAt: stat.mtimeMs,
  }
}
