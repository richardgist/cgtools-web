import { defineEventHandler, readBody, getQuery } from 'h3'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export default defineEventHandler(async (event) => {
    // Can be GET or POST based on frontend
    const method = event.method
    let revision, url

    if (method === 'POST') {
        const query = getQuery(event)
        revision = query.revision
        url = query.url
    } else {
        const query = getQuery(event)
        revision = query.revision
        url = query.url
    }

    if (!revision || !url) {
        return { success: false, error: 'Missing revision or url' }
    }

    try {
        const { stdout, stderr } = await execAsync(`chcp 65001 >nul && svn log -r ${revision} "${url}" --non-interactive`, { encoding: 'utf-8' })
        if (stderr && !stdout) {
            return { success: false, error: stderr.trim() }
        }
        return { success: true, log: stdout }
    } catch (error) {
        return { success: false, error: error.message || error.stderr || 'SVN log failed' }
    }
})
