import { defineEventHandler, readBody } from 'h3'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const CONFIG_DIR = path.join(os.homedir(), '.cgtools')
const CONFIG_FILE = path.join(CONFIG_DIR, 'claude_configs.json')

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { name, config } = body

    if (!name || !config) {
        throw createError({ statusCode: 400, statusMessage: 'Missing name or config' })
    }

    let configs = []
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            configs = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
        } catch (e) {
            // ignore
        }
    }

    const existingConfig = configs.find(c => c.name === name)
    if (existingConfig) {
        existingConfig.config = config
    } else {
        configs.push({ name, config })
    }

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 4))
    return { success: true }
})
