import { defineEventHandler } from 'h3'
import * as fs from 'fs'
import * as path from 'path'

const ICONS = {
    '.py': '🐍',
    '.bat': '⚙️',
    '.ps1': '🟦'
}

export default defineEventHandler(async (event) => {
    // In Nuxt, we assume scripts are located in a folder parallel to server
    // Actually, we should map it to the old absolute path to stay safe
    const scriptsDir = path.resolve(process.cwd(), '../scripts')

    const scripts = []

    try {
        if (fs.existsSync(scriptsDir)) {
            const files = fs.readdirSync(scriptsDir)

            for (const file of files) {
                const fullPath = path.join(scriptsDir, file)
                const stat = fs.statSync(fullPath)

                if (stat.isFile()) {
                    const ext = path.extname(file).toLowerCase()
                    if (ICONS[ext] && !file.toLowerCase().includes('toolbox')) {
                        scripts.push({
                            name: file,
                            path: fullPath,
                            icon: ICONS[ext],
                            type: ext.substring(1)
                        })
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error listing scripts:', error)
    }

    return scripts.sort((a, b) => a.name.localeCompare(b.name))
})
