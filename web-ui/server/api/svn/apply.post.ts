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
    raw: string
}

function normalizeSvnOutput(output: string): string {
    return output
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
}

function parseSvnPatchOutput(stdout: string): PatchResult {
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

            currentFile.hunks.push({
                type,
                oldStart: Number(hunkMatch[2]),
                oldLines: Number(hunkMatch[3] || 1),
                newStart: Number(hunkMatch[4]),
                newLines: Number(hunkMatch[5] || 1),
                offset: offsetMatch ? Number(offsetMatch[1]) : null,
                fuzz: fuzzMatch ? Number(fuzzMatch[1]) : null,
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
            }, 0)
        }
    }
}

function buildPatchResponse(stdout: string, stderr = '', fallbackMessage = 'svn patch 未能应用任何内容') {
    const combinedOutput = [stdout, stderr].filter(Boolean).join('\n')
    const normalizedMessage = normalizeSvnOutput(combinedOutput).trim()
    const parsed = parseSvnPatchOutput(combinedOutput)

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

    try {
        // svn diff -c 对本地工作副本产生的 patch 中路径是相对于 sourcePath 的绝对/相对路径
        // 需要把 sourcePath（路径 A）替换为 targetDir（路径 B）使路径能对上
        let processedContent = patchContent
        if (sanitizedSourcePath) {
            const normalizedSource = sanitizedSourcePath.replace(/\\/g, '/').replace(/\/$/, '')
            const normalizedTarget = sanitizedTargetDir.replace(/\\/g, '/').replace(/\/$/, '')
            const sourceBackSlash = sanitizedSourcePath.replace(/\//g, '\\').replace(/\\$/, '')
            const targetBackSlash = sanitizedTargetDir.replace(/\//g, '\\').replace(/\\$/, '')

            processedContent = processedContent
                .replaceAll(normalizedSource, normalizedTarget)
                .replaceAll(sourceBackSlash, targetBackSlash)
        }
        fs.writeFileSync(patchFilePath, processedContent, 'utf-8')

        const cmd = `chcp 65001 >nul && svn patch "${patchFilePath}" "${sanitizedTargetDir}"`
        const { stdout, stderr } = await execAsync(cmd, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
        })

        // Clean up temp file
        try { fs.unlinkSync(patchFilePath) } catch (e) { }

        return buildPatchResponse(stdout || '', stderr || '')
    } catch (error: any) {
        try {
            if (fs.existsSync(patchFilePath)) fs.unlinkSync(patchFilePath)
        } catch (e) { }

        const stdout = error.stdout || ''
        const stderr = error.stderr || ''
        const parsed = parseSvnPatchOutput([stdout, stderr].filter(Boolean).join('\n'))

        if (parsed.files.length > 0 || parsed.conflicts.length > 0 || parsed.skipped.length > 0) {
            return buildPatchResponse(stdout, stderr, error.message || 'svn patch 执行出现冲突')
        }

        return {
            success: false,
            message: normalizeSvnOutput(stderr || stdout || error.message || 'Failed to apply patch').trim()
        }
    }
})
