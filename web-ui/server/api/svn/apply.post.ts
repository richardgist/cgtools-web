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
}

function parseSvnPatchOutput(stdout: string): PatchResult {
    const applied: string[] = []
    const conflicts: string[] = []
    const skipped: string[] = []

    for (const line of stdout.split('\n')) {
        const trimmed = line.trimEnd()
        if (!trimmed) continue

        // U/G/A/D + two spaces + path = successfully applied
        if (/^[UGAD]\s{2}/.test(trimmed)) {
            applied.push(trimmed.substring(3).trim())
        }
        // C + two spaces = conflict at file level
        else if (/^C\s{2}/.test(trimmed)) {
            conflicts.push(trimmed.substring(3).trim())
        }
        // >         rejected hunk ...
        else if (/^>.*rejected/i.test(trimmed)) {
            if (conflicts.length === 0 || !conflicts.includes('(hunk)')) {
                conflicts.push(trimmed.trim())
            }
        }
        // Skipped missing target
        else if (/^Skipped/i.test(trimmed)) {
            skipped.push(trimmed)
        }
    }

    return { applied, conflicts, skipped }
}

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { patchContent, targetDir, sourcePath, revision } = body

    if (!patchContent || !targetDir) {
        return { success: false, message: 'Missing patchContent or targetDir' }
    }

    const tempDir = os.tmpdir()
    const patchFileName = `svn_patch_${Date.now()}_r${revision || 'unk'}.patch`
    const patchFilePath = path.join(tempDir, patchFileName)

    try {
        // svn diff -c 对本地工作副本产生的 patch 中路径是相对于 sourcePath 的绝对/相对路径
        // 需要把 sourcePath（路径 A）替换为 targetDir（路径 B）使路径能对上
        let processedContent = patchContent
        if (sourcePath) {
            const normalizedSource = sourcePath.replace(/\\/g, '/').replace(/\/$/, '')
            const normalizedTarget = targetDir.replace(/\\/g, '/').replace(/\/$/, '')
            const sourceBackSlash = sourcePath.replace(/\//g, '\\').replace(/\\$/, '')
            const targetBackSlash = targetDir.replace(/\//g, '\\').replace(/\\$/, '')

            processedContent = processedContent
                .replaceAll(normalizedSource, normalizedTarget)
                .replaceAll(sourceBackSlash, targetBackSlash)
        }
        fs.writeFileSync(patchFilePath, processedContent, 'utf-8')

        const cmd = `chcp 65001 >nul && svn patch "${patchFilePath}" "${targetDir}"`
        const { stdout, stderr } = await execAsync(cmd, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
        })

        // Clean up temp file
        try { fs.unlinkSync(patchFilePath) } catch (e) { }

        const parsed = parseSvnPatchOutput(stdout || '')

        if (parsed.applied.length > 0 && parsed.conflicts.length === 0) {
            return {
                success: true,
                message: stdout.trim()
            }
        } else if (parsed.applied.length > 0 && parsed.conflicts.length > 0) {
            return {
                success: true,
                partial: true,
                conflicts: parsed.conflicts,
                message: stdout.trim()
            }
        } else {
            return {
                success: false,
                message: stdout.trim() || stderr?.trim() || 'svn patch 未能应用任何内容'
            }
        }
    } catch (error: any) {
        try {
            if (fs.existsSync(patchFilePath)) fs.unlinkSync(patchFilePath)
        } catch (e) { }

        return { success: false, message: error.message || error.stderr || 'Failed to apply patch' }
    }
})
