import { defineEventHandler, readBody } from 'h3'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const execAsync = promisify(exec)

interface PatchResult {
    applied: string[]
    conflicts: string[]
    skipped: string[]
    files: PatchFileDetail[]
    summary: {
        textConflicts: number
        rejectedHunks: number
        formatOnlyRejectedHunks: number
        semanticRejectedHunks: number
    }
}

interface PatchFileDetail {
    path: string
    status: 'applied' | 'conflict'
    hunks: PatchHunkDetail[]
    rawLines: string[]
}

interface PatchHunkDetail {
    type: 'applied' | 'rejected'
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
    offset: number | null
    fuzz: number | null
    classification: 'format-only' | 'semantic' | 'unknown'
    classificationLabel: string
    classificationHint: string
    raw: string
}

interface PatchHunkClassification {
    classification: 'format-only' | 'semantic' | 'unknown'
    classificationLabel: string
    classificationHint: string
}

interface PatchHunkSourceDetail extends PatchHunkClassification {
    oldStart: number
    oldLines: number
    newStart: number
    newLines: number
}

type PatchFileHunkIndex = Map<string, PatchHunkSourceDetail>
type PatchClassificationIndex = Map<string, PatchFileHunkIndex>

function normalizeSvnOutput(output: string): string {
    return output
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
}

function normalizePatchPath(input: string): string {
    return input.trim().replace(/\\/g, '/')
}

function buildHunkKey(oldStart: number, oldLines: number, newStart: number, newLines: number): string {
    return `${oldStart},${oldLines},${newStart},${newLines}`
}

function collapseWhitespace(value: string): string {
    return value.trim().replace(/\s+/g, ' ')
}

function areLineArraysEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false
    return left.every((line, index) => line === right[index])
}

function classifyPatchHunk(removedLines: string[], addedLines: string[]): PatchHunkClassification {
    if (removedLines.length === 0 && addedLines.length === 0) {
        return {
            classification: 'unknown',
            classificationLabel: '未识别',
            classificationHint: '未能从 patch 内容提取到 +/- 变更行'
        }
    }

    if (areLineArraysEqual(removedLines, addedLines)) {
        return {
            classification: 'format-only',
            classificationLabel: '格式差异',
            classificationHint: '增删文本完全一致，通常是不可见字符或文本元数据差异'
        }
    }

    const removedNonEmpty = removedLines.filter(line => line.trim() !== '')
    const addedNonEmpty = addedLines.filter(line => line.trim() !== '')
    if (areLineArraysEqual(removedNonEmpty, addedNonEmpty)) {
        return {
            classification: 'format-only',
            classificationLabel: '格式差异',
            classificationHint: '忽略空行后内容一致，更像是空行或块边界调整'
        }
    }

    const removedCollapsed = removedNonEmpty.map(collapseWhitespace)
    const addedCollapsed = addedNonEmpty.map(collapseWhitespace)
    if (areLineArraysEqual(removedCollapsed, addedCollapsed)) {
        return {
            classification: 'format-only',
            classificationLabel: '格式差异',
            classificationHint: '忽略空白和缩进后内容一致，更像是格式整理'
        }
    }

    return {
        classification: 'semantic',
        classificationLabel: '业务改动',
        classificationHint: 'hunk 内存在实际增删行，需人工核对是否需要手工合并'
    }
}

function buildPatchClassificationIndex(patchContent: string): PatchClassificationIndex {
    const index: PatchClassificationIndex = new Map()
    const normalized = normalizeSvnOutput(patchContent)
    const lines = normalized.split('\n')

    let currentFilePath = ''
    let currentHunk: {
        oldStart: number
        oldLines: number
        newStart: number
        newLines: number
        removedLines: string[]
        addedLines: string[]
    } | null = null

    const flushCurrentHunk = () => {
        if (!currentFilePath || !currentHunk) return

        const classification = classifyPatchHunk(currentHunk.removedLines, currentHunk.addedLines)
        const filePath = normalizePatchPath(currentFilePath)
        const fileIndex = index.get(filePath) ?? new Map<string, PatchHunkSourceDetail>()
        fileIndex.set(
            buildHunkKey(currentHunk.oldStart, currentHunk.oldLines, currentHunk.newStart, currentHunk.newLines),
            {
                oldStart: currentHunk.oldStart,
                oldLines: currentHunk.oldLines,
                newStart: currentHunk.newStart,
                newLines: currentHunk.newLines,
                ...classification
            }
        )
        index.set(filePath, fileIndex)
        currentHunk = null
    }

    for (const line of lines) {
        if (line.startsWith('Index: ')) {
            flushCurrentHunk()
            currentFilePath = line.slice('Index: '.length).trim()
            continue
        }

        const hunkHeader = line.match(/^@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/)
        if (hunkHeader) {
            flushCurrentHunk()
            currentHunk = {
                oldStart: Number(hunkHeader[1]),
                oldLines: Number(hunkHeader[2] || 1),
                newStart: Number(hunkHeader[3]),
                newLines: Number(hunkHeader[4] || 1),
                removedLines: [],
                addedLines: []
            }
            continue
        }

        if (!currentHunk) continue
        if (line.startsWith('--- ') || line.startsWith('+++ ')) continue
        if (line.startsWith('-')) {
            currentHunk.removedLines.push(line.slice(1))
        } else if (line.startsWith('+')) {
            currentHunk.addedLines.push(line.slice(1))
        }
    }

    flushCurrentHunk()
    return index
}

function findPatchHunkClassification(
    classificationIndex: PatchClassificationIndex,
    filePath: string,
    oldStart: number,
    oldLines: number,
    newStart: number,
    newLines: number
): PatchHunkClassification {
    const normalizedPath = normalizePatchPath(filePath)
    const hunkKey = buildHunkKey(oldStart, oldLines, newStart, newLines)
    const fileIndex = classificationIndex.get(normalizedPath)
    const classified = fileIndex?.get(hunkKey)
    if (classified) {
        return classified
    }

    return {
        classification: 'unknown',
        classificationLabel: '未识别',
        classificationHint: '当前无法从原始 patch 中定位这个 hunk 的文本类型'
    }
}

function parseSvnPatchOutput(stdout: string, classificationIndex: PatchClassificationIndex = new Map()): PatchResult {
    const applied: string[] = []
    const conflicts: string[] = []
    const skipped: string[] = []
    const files: PatchFileDetail[] = []
    let currentFile: PatchFileDetail | null = null
    let textConflicts = 0

    const normalized = normalizeSvnOutput(stdout)

    for (const rawLine of normalized.split('\n')) {
        const trimmed = rawLine.trim()
        if (!trimmed) continue

        const fileMatch = trimmed.match(/^([UGADC])\s{1,4}(.+)$/)
        if (fileMatch) {
            const status = fileMatch[1]
            const filePath = fileMatch[2].trim()
            currentFile = {
                path: filePath,
                status: status === 'C' ? 'conflict' : 'applied',
                hunks: [],
                rawLines: [trimmed]
            }
            files.push(currentFile)

            if (status === 'C') {
                conflicts.push(filePath)
            } else {
                applied.push(filePath)
            }
            continue
        }

        if (/^>\s*/.test(trimmed)) {
            if (currentFile) {
                currentFile.rawLines.push(trimmed)
            }

            const hunkMatch = trimmed.match(/^>\s*(applied|rejected)\s+hunk\s+@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/i)
            if (!hunkMatch || !currentFile) {
                continue
            }

            const type = hunkMatch[1].toLowerCase() as 'applied' | 'rejected'
            const offsetMatch = trimmed.match(/\bwith offset\s+(-?\d+)/i)
            const fuzzMatch = trimmed.match(/\band fuzz\s+(\d+)/i)
            const oldStart = Number(hunkMatch[2])
            const oldLines = Number(hunkMatch[3] || 1)
            const newStart = Number(hunkMatch[4])
            const newLines = Number(hunkMatch[5] || 1)
            const classification = findPatchHunkClassification(
                classificationIndex,
                currentFile.path,
                oldStart,
                oldLines,
                newStart,
                newLines
            )

            currentFile.hunks.push({
                type,
                oldStart,
                oldLines,
                newStart,
                newLines,
                offset: offsetMatch ? Number(offsetMatch[1]) : null,
                fuzz: fuzzMatch ? Number(fuzzMatch[1]) : null,
                classification: classification.classification,
                classificationLabel: classification.classificationLabel,
                classificationHint: classification.classificationHint,
                raw: trimmed
            })

            if (type === 'rejected') {
                currentFile.status = 'conflict'
                if (!conflicts.includes(currentFile.path)) {
                    conflicts.push(currentFile.path)
                }

                const appliedIndex = applied.indexOf(currentFile.path)
                if (appliedIndex >= 0) {
                    applied.splice(appliedIndex, 1)
                }
            }
            continue
        }

        if (/^Skipped/i.test(trimmed)) {
            skipped.push(trimmed)
            currentFile = null
            continue
        }

        const textConflictMatch = trimmed.match(/^Text conflicts:\s*(\d+)/i)
        if (textConflictMatch) {
            textConflicts = Number(textConflictMatch[1])
        }
    }

    return {
        applied,
        conflicts,
        skipped,
        files,
        summary: {
            textConflicts,
            rejectedHunks: files.reduce((total, file) => {
                return total + file.hunks.filter((hunk) => hunk.type === 'rejected').length
            }, 0),
            formatOnlyRejectedHunks: files.reduce((total, file) => {
                return total + file.hunks.filter((hunk) => hunk.type === 'rejected' && hunk.classification === 'format-only').length
            }, 0),
            semanticRejectedHunks: files.reduce((total, file) => {
                return total + file.hunks.filter((hunk) => hunk.type === 'rejected' && hunk.classification === 'semantic').length
            }, 0)
        }
    }
}

function buildPatchResponse(
    stdout: string,
    stderr = '',
    fallbackMessage = 'svn patch 未能应用任何内容',
    classificationIndex: PatchClassificationIndex = new Map()
) {
    const combinedOutput = [stdout, stderr].filter(Boolean).join('\n')
    const normalizedMessage = normalizeSvnOutput(combinedOutput).trim()
    const parsed = parseSvnPatchOutput(combinedOutput, classificationIndex)

    if (parsed.conflicts.length > 0) {
        return {
            success: parsed.applied.length > 0,
            partial: true,
            applied: parsed.applied,
            conflicts: parsed.conflicts,
            skipped: parsed.skipped,
            files: parsed.files,
            summary: parsed.summary,
            message: normalizedMessage || fallbackMessage
        }
    }

    if (parsed.files.length > 0 || parsed.skipped.length > 0) {
        return {
            success: true,
            applied: parsed.applied,
            skipped: parsed.skipped,
            files: parsed.files,
            summary: parsed.summary,
            message: normalizedMessage || fallbackMessage
        }
    }

    return {
        success: false,
        message: normalizedMessage || fallbackMessage
    }
}

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { patchContent, targetDir, sourcePath, revision } = body

    if (!patchContent || !targetDir) {
        return { success: false, message: 'Missing patchContent or targetDir' }
    }

    // Sanitize paths for Windows: remove trailing backslash to prevent quote escaping issues
    const sanitizedTargetDir = targetDir.replace(/\\$/, '')
    const sanitizedSourcePath = sourcePath ? sourcePath.replace(/\\$/, '') : ''

    const tempDir = os.tmpdir()
    const patchFileName = `svn_patch_${Date.now()}_r${revision || 'unk'}.patch`
    const patchFilePath = path.join(tempDir, patchFileName)
    let processedContent = patchContent

    try {
        // svn diff -c 对本地工作副本产生的 patch 中路径是相对于 sourcePath 的绝对/相对路径
        // 需要把 sourcePath（路径 A）替换为 targetDir（路径 B）使路径能对上
        if (sanitizedSourcePath) {
            const normalizedSource = sanitizedSourcePath.replace(/\\/g, '/').replace(/\/$/, '')
            const normalizedTarget = sanitizedTargetDir.replace(/\\/g, '/').replace(/\/$/, '')
            const sourceBackSlash = sanitizedSourcePath.replace(/\//g, '\\').replace(/\\$/, '')
            const targetBackSlash = sanitizedTargetDir.replace(/\//g, '\\').replace(/\\$/, '')

            processedContent = processedContent
                .replaceAll(normalizedSource, normalizedTarget)
                .replaceAll(sourceBackSlash, targetBackSlash)
        }
        const classificationIndex = buildPatchClassificationIndex(processedContent)
        fs.writeFileSync(patchFilePath, processedContent, 'utf-8')

        const cmd = `chcp 65001 >nul && svn patch "${patchFilePath}" "${sanitizedTargetDir}"`
        const { stdout, stderr } = await execAsync(cmd, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
        })

        // Clean up temp file
        try { fs.unlinkSync(patchFilePath) } catch (e) { }

        return buildPatchResponse(stdout || '', stderr || '', 'svn patch 未能应用任何内容', classificationIndex)
    } catch (error: any) {
        try {
            if (fs.existsSync(patchFilePath)) fs.unlinkSync(patchFilePath)
        } catch (e) { }

        const stdout = error.stdout || ''
        const stderr = error.stderr || ''
        const classificationIndex = buildPatchClassificationIndex(processedContent)
        const parsed = parseSvnPatchOutput([stdout, stderr].filter(Boolean).join('\n'), classificationIndex)

        if (parsed.files.length > 0 || parsed.conflicts.length > 0 || parsed.skipped.length > 0) {
            return buildPatchResponse(stdout, stderr, error.message || 'svn patch 执行出现冲突', classificationIndex)
        }

        return {
            success: false,
            message: normalizeSvnOutput(stderr || stdout || error.message || 'Failed to apply patch').trim()
        }
    }
})
