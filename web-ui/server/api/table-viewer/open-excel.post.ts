import { existsSync, readdirSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { createError, defineEventHandler, readBody } from 'h3'

const TABLE_VIEWER_HTML_PATH = 'E:/CJGame/trunk/xls/table_viewer/table_viewer.html'
const XLS_ROOT = path.resolve(path.dirname(TABLE_VIEWER_HTML_PATH), '..')
const EXCEL_EXTENSIONS = new Set(['.xls', '.xlsx', '.xlsm', '.xlsb'])

type OpenExcelBody = {
  excelFile?: string
}

const escapeSingleQuotedPowerShell = (input: string) => input.replace(/'/g, "''")

const isPathInside = (root: string, targetPath: string) => {
  const relative = path.relative(root, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

const isExcelFile = (targetPath: string) => EXCEL_EXTENSIONS.has(path.extname(targetPath).toLowerCase())

const stripExcelName = (input: string) => input
  .trim()
  .replace(/^[`'"\s]+/, '')
  .replace(/[`'"\]\},\s]+$/, '')

const getCandidateNames = (rawName: string) => {
  const normalized = rawName.replace(/\\/g, '/')
  const ext = path.extname(normalized).toLowerCase()
  if (EXCEL_EXTENSIONS.has(ext)) return [normalized]
  if (ext) return []
  return Array.from(EXCEL_EXTENSIONS, (candidateExt) => `${normalized}${candidateExt}`)
}

const resolveRelativeCandidate = (rawName: string) => {
  for (const candidate of getCandidateNames(rawName)) {
    const targetPath = path.resolve(XLS_ROOT, candidate)
    if (!isPathInside(XLS_ROOT, targetPath) || !isExcelFile(targetPath)) continue
    if (existsSync(targetPath) && statSync(targetPath).isFile()) return targetPath
  }
  return ''
}

const findByFileName = (rawName: string) => {
  const targetNames = new Set(
    getCandidateNames(path.basename(rawName))
      .map((name) => name.toLowerCase()),
  )
  if (targetNames.size === 0) return ''

  const pending = [XLS_ROOT]
  while (pending.length > 0) {
    const current = pending.shift()
    if (!current) continue

    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.name === '.svn' || entry.name === 'Back_Csv') continue

      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(fullPath)
        continue
      }

      if (entry.isFile() && targetNames.has(entry.name.toLowerCase()) && isExcelFile(fullPath)) {
        return fullPath
      }
    }
  }

  return ''
}

const resolveExcelPath = (rawInput: string) => {
  const excelFile = stripExcelName(rawInput)
  if (!excelFile) {
    throw new Error('缺少 Excel 文件名')
  }
  if (excelFile.includes('\0')) {
    throw new Error('Excel 文件名不合法')
  }

  const relativeMatch = resolveRelativeCandidate(excelFile)
  if (relativeMatch) return relativeMatch

  const fileNameMatch = findByFileName(excelFile)
  if (fileNameMatch) return fileNameMatch

  throw new Error(`未在 xls 目录中找到原始 Excel：${excelFile}`)
}

export default defineEventHandler(async (event) => {
  if (process.platform !== 'win32') {
    return { success: false, error: '打开原始 Excel 目前仅支持 Windows 系统' }
  }

  const body = await readBody<OpenExcelBody>(event)
  const rawExcelFile = typeof body.excelFile === 'string' ? body.excelFile : ''

  let targetPath = ''
  try {
    targetPath = resolveExcelPath(rawExcelFile)
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error instanceof Error ? error.message : 'Excel 文件不存在',
    })
  }

  const script = `Invoke-Item -LiteralPath '${escapeSingleQuotedPowerShell(targetPath)}'`

  return await new Promise<{ success: boolean; path?: string; error?: string }>((resolve) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    let stderr = ''
    child.stderr.on('data', (buf: Buffer) => {
      stderr += buf.toString('utf-8')
    })

    child.on('close', (code: number) => {
      if (code === 0) {
        resolve({ success: true, path: targetPath })
        return
      }

      resolve({ success: false, error: stderr.trim() || '默认程序打开失败' })
    })

    child.on('error', (error: Error) => {
      resolve({ success: false, error: error.message })
    })
  })
})
