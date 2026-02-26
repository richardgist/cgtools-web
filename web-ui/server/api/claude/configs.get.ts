import { defineEventHandler } from 'h3'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const CONFIG_DIR = path.join(os.homedir(), '.cgtools')
const CONFIG_FILE = path.join(CONFIG_DIR, 'claude_configs.json')
const ACTIVE_FILE = path.join(CONFIG_DIR, 'active_claude_config')

// Initialize config directory
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
}

export default defineEventHandler(async (event) => {
    let configs = []
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            configs = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
        }
    } catch (e) {
        console.error('Error reading configs:', e)
    }

    let activeName = ''
    try {
        if (fs.existsSync(ACTIVE_FILE)) {
            activeName = fs.readFileSync(ACTIVE_FILE, 'utf-8').trim()
        }
    } catch (e) {
        console.error('Error reading active config:', e)
    }

    // Format response
    const response = configs.map(c => ({
        name: c.name,
        config: c.config,
        isCurrent: c.name === activeName
    }))

    return response
})
