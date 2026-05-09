import { defineEventHandler } from 'h3'
import { listManagedScripts } from '../utils/scriptRegistry'

export default defineEventHandler(async (event) => {
    try {
        return listManagedScripts()
    } catch (error) {
        console.error('Error listing scripts:', error)
        return []
    }
})
