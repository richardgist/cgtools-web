import { defineEventHandler } from 'h3'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const CONFIG_DIR = path.join(os.homedir(), '.cgtools')
const CONFIG_FILE = path.join(CONFIG_DIR, 'claude_configs.json')
const ACTIVE_FILE = path.join(CONFIG_DIR, 'active_claude_config')

export default defineEventHandler(async (event) => {
    const name = event.context.params.name

    if (!name) {
        throw createError({ statusCode: 400, statusMessage: 'Missing config name' })
    }

    // Delete from configs list
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            let configs = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
            configs = configs.filter(c => c.name !== name)
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 4))
        } catch (e) {
            // ignore
        }
    }

    // If active config is deleted, clear active file
    if (fs.existsSync(ACTIVE_FILE)) {
        const activeName = fs.readFileSync(ACTIVE_FILE, 'utf-8').trim()
        if (activeName === name) {
            fs.unlinkSync(ACTIVE_FILE)
        }
    }

    return { success: true }
})
