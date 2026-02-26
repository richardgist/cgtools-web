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

    let cmd = ''

    if (fromRepoRoot) {
        const revNum = parseInt(revision)
        if (isNaN(revNum)) {
            return { success: false, error: 'Invalid revision number' }
        }
        const prevRev = revNum - 1
        cmd = `svn diff -r ${prevRev}:${revision} \`svn info --show-item repos-root-url "${url}"\` --non-interactive`
    } else if (parentLevels && parentLevels > 0) {
        let parentUrl = url
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
        cmd = `chcp 65001 >nul && svn diff -c ${revision} "${url}" --non-interactive`
    }

    try {
        const { stdout, stderr } = await execAsync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 })
        if (stderr && !stdout) {
            return { success: false, error: stderr.trim() }
        }
        return { success: true, content: stdout }
    } catch (error) {
        return { success: false, error: error.message || error.stderr || 'SVN diff failed' }
    }
})
