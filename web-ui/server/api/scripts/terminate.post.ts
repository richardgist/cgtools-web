import { defineEventHandler } from 'h3'
import { activeProcesses } from '../../utils/processManager'

export default defineEventHandler(async (event) => {
    if (activeProcesses && activeProcesses.size > 0) {
        for (const [id, proc] of activeProcesses.entries()) {
            try {
                proc.kill()
            } catch (e) {
                console.error('Failed to kill process', e)
            }
            activeProcesses.delete(id)
        }
    }

    return { success: true }
})
