import { defineEventHandler } from 'h3'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const CONFIG_DIR = path.join(os.homedir(), '.cgtools')
const CONFIG_FILE = path.join(CONFIG_DIR, 'claude_configs.json')
const ACTIVE_FILE = path.join(CONFIG_DIR, 'active_claude_config')

export default defineEventHandler(async (event) => {
    const name = event.context.params.name

    if (!name) {
        throw createError({ statusCode: 400, statusMessage: 'Missing config name' })
    }

    let configs = []
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            configs = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
        } catch (e) {
            // ignore
        }
    }

    const targetConfig = configs.find(c => c.name === name)
    if (!targetConfig) {
        throw createError({ statusCode: 404, statusMessage: 'Config not found' })
    }

    try {
        // 写入活跃标识文件
        fs.writeFileSync(ACTIVE_FILE, name)

        // Windows: Set User Environment Variables
        if (process.platform === 'win32') {
            const { baseApi, authToken } = targetConfig.config;
            await execAsync(`setx ANTHROPIC_BASE_URL "${baseApi}"`);
            await execAsync(`setx ANTHROPIC_AUTH_TOKEN "${authToken}"`);

            return {
                success: true,
                message: `已切换至 "${name}"\n环境变量已写入系统。如果您正在运行 Claude Code，请重启命令行容器使其生效。`
            }
        } else {
            return {
                success: true,
                message: `已切换至 "${name}" (非 Windows 系统，未自动设置环境变量)`
            }
        }
    } catch (err) {
        throw createError({ statusCode: 500, statusMessage: `Failed to set env vars: ${err.message}` })
    }
})
