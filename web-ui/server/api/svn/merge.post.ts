import { defineEventHandler, readBody } from 'h3'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface MergeResult {
    updated: string[]
    conflicts: string[]
    skipped: string[]
}

function parseSvnMergeOutput(stdout: string): MergeResult {
    const updated: string[] = []
    const conflicts: string[] = []
    const skipped: string[] = []

    for (const line of stdout.split('\n')) {
        const trimmed = line.trimEnd()
        if (!trimmed) continue

        // U/G/A/D + spaces + path = successfully merged
        if (/^[UGAD]\s{1,4}/.test(trimmed)) {
            updated.push(trimmed.replace(/^[UGAD]\s+/, '').trim())
        }
        // C + spaces = conflict (conflict markers written into file)
        else if (/^C\s{1,4}/.test(trimmed)) {
            conflicts.push(trimmed.replace(/^C\s+/, '').trim())
        }
        // Skipped
        else if (/^Skipped/i.test(trimmed)) {
            skipped.push(trimmed)
        }
        // Summary line like "Summary of conflicts:" — ignore
    }

    return { updated, conflicts, skipped }
}

async function getSvnUrl(localPath: string): Promise<string> {
    // If already a URL, return directly
    if (/^(svn|https?):\/\//i.test(localPath)) {
        return localPath
    }

    const { stdout } = await execAsync(`chcp 65001 >nul && svn info "${localPath}"`, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024
    })

    // Extract "URL: ..." line
    const match = stdout.match(/^URL:\s*(.+)$/m)
    if (!match) {
        throw new Error(`无法从 svn info 获取 URL。路径: ${localPath}`)
    }
    return match[1].trim()
}

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { revision, sourcePath, targetDir } = body

    if (!revision || !sourcePath || !targetDir) {
        return { success: false, message: '缺少参数: revision, sourcePath, targetDir' }
    }

    try {
        // Step 1: Get SVN URL from sourcePath
        const sourceUrl = await getSvnUrl(sourcePath)

        // Step 2: Execute svn merge
        const cmd = `chcp 65001 >nul && svn merge -c ${revision} "${sourceUrl}" "${targetDir}" --non-interactive --accept postpone`

        const { stdout, stderr } = await execAsync(cmd, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024
        })

        const output = stdout || ''
        const parsed = parseSvnMergeOutput(output)

        if (parsed.conflicts.length > 0) {
            return {
                success: true,
                partial: true,
                conflicts: parsed.conflicts,
                updated: parsed.updated,
                skipped: parsed.skipped,
                sourceUrl,
                message: output.trim() || stderr?.trim() || ''
            }
        } else if (parsed.updated.length > 0) {
            return {
                success: true,
                updated: parsed.updated,
                skipped: parsed.skipped,
                sourceUrl,
                message: output.trim()
            }
        } else {
            return {
                success: true,
                updated: [],
                skipped: parsed.skipped,
                sourceUrl,
                message: output.trim() || stderr?.trim() || 'svn merge 无输出（可能已合并过或无变更）'
            }
        }
    } catch (error: any) {
        // svn merge may output useful info in both stdout and stderr on error
        const errMsg = error.message || ''
        const stdout = error.stdout || ''
        const stderr = error.stderr || ''

        // If there's stdout with merge results, it might be a partial success with conflicts
        if (stdout) {
            const parsed = parseSvnMergeOutput(stdout)
            if (parsed.updated.length > 0 || parsed.conflicts.length > 0) {
                return {
                    success: true,
                    partial: parsed.conflicts.length > 0,
                    conflicts: parsed.conflicts,
                    updated: parsed.updated,
                    skipped: parsed.skipped,
                    message: stdout.trim() + (stderr ? '\n' + stderr.trim() : '')
                }
            }
        }

        return {
            success: false,
            message: stderr?.trim() || stdout?.trim() || errMsg || 'svn merge 执行失败'
        }
    }
})
