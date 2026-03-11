import { defineEventHandler, readBody } from 'h3'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { revision, url, fromRepoRoot, parentLevels } = body

    if (!revision || !url) {
        throw createError({ statusCode: 400, statusMessage: 'Missing revision or url' })
    }

    // Sanitize URL for Windows: remove trailing backslash which escapes the closing quote
    const sanitizedUrl = url.replace(/\\$/, '')
    let cmd = ''

    try {
        if (fromRepoRoot) {
            const revNum = parseInt(revision)
            if (isNaN(revNum)) {
                return { success: false, error: 'Invalid revision number' }
            }
            const prevRev = revNum - 1

            const isUrl = /^(svn|https?):\/\//i.test(sanitizedUrl)
            let root = ''

            if (!isUrl) {
                // For local paths, try to get the Working Copy root first (safer for permissions)
                try {
                    const { stdout: wcRoot } = await execAsync(`chcp 65001 >nul && svn info --show-item wc-root "${sanitizedUrl}"`, { encoding: 'utf-8' })
                    root = wcRoot.trim()
                } catch (e) {
                    // Fallback to repos-root-url if not in a working copy
                }
            }

            if (!root) {
                // Get the server-side repository root URL
                const { stdout: repoRoot } = await execAsync(`chcp 65001 >nul && svn info --show-item repos-root-url "${sanitizedUrl}"`, { encoding: 'utf-8' })
                root = repoRoot.trim()
            }

            if (!root) {
                return { success: false, error: '无法获取 SVN 根路径，请检查路径是否正确' }
            }

            cmd = `chcp 65001 >nul && svn diff -r ${prevRev}:${revision} "${root}" --non-interactive`
        } else if (parentLevels && parentLevels > 0) {
            let parentUrl = sanitizedUrl
            for (let i = 0; i < parentLevels; i++) {
                parentUrl += '/..'
            }
            const revNum = parseInt(revision)
            if (isNaN(revNum)) {
                return { success: false, error: 'Invalid revision number' }
            }
            const prevRev = revNum - 1
            cmd = `chcp 65001 >nul && svn diff -r ${prevRev}:${revision} "${parentUrl}" --non-interactive`
        } else {
            cmd = `chcp 65001 >nul && svn diff -c ${revision} "${sanitizedUrl}" --non-interactive`
        }

        const { stdout, stderr } = await execAsync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
        if (stderr && !stdout) {
            // Check for specific permission error
            if (stderr.includes('E175013')) {
                return { success: false, error: 'SVN 权限被拒绝 (E175013)。原因：你可能没有仓库根目录的访问权限。建议取消勾选“从仓库根目录”再试，或者确保已在 CMD 中保存了 SVN 凭据。' }
            }
            return { success: false, error: stderr.trim() }
        }
        return { success: true, content: stdout }
    } catch (error: any) {
        let msg = error.stderr || error.message || 'SVN diff 失败'
        if (msg.includes('E175013')) {
            msg = 'SVN 权限被拒绝 (E175013)。建议取消勾选“从仓库根目录”再试。若必须从根目录 diff，请先在终端运行一次 svn 命令并保存密码。'
        }
        return { success: false, error: msg }
    }
})
