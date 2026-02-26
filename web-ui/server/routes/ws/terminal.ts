import { defineWebSocketHandler } from 'h3'
import { spawn } from 'child_process'
import * as path from 'path'
import { activeProcesses } from '../../utils/processManager'

export default defineWebSocketHandler({
    open(peer) {
        console.log('[ws] peer connected', peer.id)
    },

    message(peer, message) {
        console.log('[ws] message', message.text())

        try {
            const data = JSON.parse(message.text())

            if (data.action === 'run' && data.script) {
                const scriptPath = data.script
                const ext = path.extname(scriptPath).toLowerCase()
                let cmd = ''
                let args = []

                if (ext === '.py') {
                    cmd = 'python'
                    args = ['-u', scriptPath]
                } else if (ext === '.bat') {
                    cmd = 'cmd'
                    args = ['/c', scriptPath]
                } else if (ext === '.ps1') {
                    cmd = 'powershell'
                    args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath]
                } else {
                    peer.send(JSON.stringify({ type: 'error', data: `不支持的脚本类型: ${ext}` }))
                    return
                }

                const proc = spawn(cmd, args, {
                    cwd: path.dirname(scriptPath),
                    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
                })

                activeProcesses.set(peer.id, proc)

                peer.send(JSON.stringify({ type: 'start', script: path.basename(scriptPath) }))

                proc.stdout.on('data', (chunk) => {
                    peer.send(JSON.stringify({ type: 'stdout', data: chunk.toString('utf-8') }))
                })

                proc.stderr.on('data', (chunk) => {
                    peer.send(JSON.stringify({ type: 'stderr', data: chunk.toString('utf-8') }))
                })

                proc.on('close', (code) => {
                    peer.send(JSON.stringify({ type: 'end', exitCode: code }))
                    activeProcesses.delete(peer.id)
                })

                proc.on('error', (err) => {
                    peer.send(JSON.stringify({ type: 'error', data: err.message }))
                    activeProcesses.delete(peer.id)
                })

            } else if (data.action === 'terminate') {
                const proc = activeProcesses.get(peer.id)
                if (proc) {
                    try {
                        proc.kill()
                    } catch (e) {
                        console.error('kill error', e)
                    }
                    activeProcesses.delete(peer.id)
                }
            }
        } catch (e) {
            peer.send(JSON.stringify({ type: 'error', data: 'Invalid message' }))
        }
    },

    close(peer) {
        console.log('[ws] peer disconnected', peer.id)
        const proc = activeProcesses.get(peer.id)
        if (proc) {
            proc.kill()
            activeProcesses.delete(peer.id)
        }
    },

    error(peer, error) {
        console.error('[ws] error', peer.id, error)
    }
})
