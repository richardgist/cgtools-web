import { defineWebSocketHandler } from 'h3'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { activeProcesses } from '../../utils/processManager'
import { getScriptsDir, resolveManagedScriptPath } from '../../utils/scriptRegistry'

const resolveConsoleCwd = (cwd: unknown) => {
    if (typeof cwd !== 'string' || !cwd.trim()) {
        return process.cwd()
    }

    const resolvedCwd = path.resolve(cwd)
    const stat = fs.statSync(resolvedCwd)
    if (!stat.isDirectory()) {
        throw new Error('工作目录不是有效文件夹')
    }

    return resolvedCwd
}

const resolveConsoleCommand = (data: Record<string, unknown>) => {
    const command = typeof data.command === 'string' ? data.command.trim() : ''
    if (!command) {
        throw new Error('缺少要执行的 Console 命令')
    }

    const shell = data.shell === 'cmd' ? 'cmd' : 'powershell'
    if (shell === 'cmd') {
        return {
            cmd: 'cmd',
            args: ['/d', '/s', '/c', command],
            name: 'CMD Console',
        }
    }

    return {
        cmd: 'powershell',
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        name: 'PowerShell Console',
    }
}

const resolveUeConsoleCommand = (data: Record<string, unknown>) => {
    const command = typeof data.command === 'string' ? data.command.trim() : ''
    if (!command) {
        throw new Error('缺少要发送的 UE Console 命令')
    }

    const packageName = typeof data.packageName === 'string' && data.packageName.trim()
        ? data.packageName.trim()
        : 'com.tencent.tmgp.pubgmhd'
    const deviceSerial = typeof data.deviceSerial === 'string' ? data.deviceSerial.trim() : ''
    const requireProcess = data.requireProcess === false || data.requireProcess === 0 || data.requireProcess === '0'
        ? '0'
        : '1'
    const scriptPath = path.join(getScriptsDir(), 'send_renderdoc_opengl_commands.ps1')
    const args = [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-PackageName',
        packageName,
        '-Commands',
        command,
        '-RequireProcess',
        requireProcess,
    ]

    if (deviceSerial) {
        args.push('-DeviceSerial', deviceSerial)
    }

    if (data.dryRun === true) {
        args.push('-DryRun', '1')
    }

    return {
        cmd: 'powershell',
        args,
        cwd: path.dirname(scriptPath),
        name: 'UE Console',
    }
}

export default defineWebSocketHandler({
    open(peer) {
        console.log('[ws] peer connected', peer.id)
    },

    message(peer, message) {
        console.log('[ws] message', message.text())

        try {
            const data = JSON.parse(message.text())

            if (data.action === 'run') {
                if (activeProcesses.has(peer.id)) {
                    peer.send(JSON.stringify({ type: 'error', data: '当前连接已有命令在运行' }))
                    return
                }

                if (data.mode === 'console' || data.mode === 'ue-console') {
                    const { cmd, args, cwd, name } = resolveUeConsoleCommand(data)
                    const proc = spawn(cmd, args, {
                        cwd,
                        env: { ...process.env, PYTHONIOENCODING: 'utf-8', CGTOOLS_WEB_RUNNER: '1' }
                    })

                    activeProcesses.set(peer.id, proc)

                    peer.send(JSON.stringify({ type: 'start', script: name }))

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
                    return
                }

                if (data.mode === 'system-shell') {
                    const cwd = resolveConsoleCwd(data.cwd)
                    const { cmd, args, name } = resolveConsoleCommand(data)
                    const proc = spawn(cmd, args, {
                        cwd,
                        env: { ...process.env, PYTHONIOENCODING: 'utf-8', CGTOOLS_WEB_RUNNER: '1' }
                    })

                    activeProcesses.set(peer.id, proc)

                    peer.send(JSON.stringify({ type: 'start', script: name }))

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
                    return
                }

                if (!data.script) {
                    peer.send(JSON.stringify({ type: 'error', data: '缺少脚本路径' }))
                    return
                }

                const scriptPath = resolveManagedScriptPath(data.script)
                const ext = path.extname(scriptPath).toLowerCase()
                let cmd = ''
                let args: string[] = []
                const scriptArgs = Array.isArray(data.args)
                    ? data.args
                        .filter((arg: unknown) => typeof arg === 'string' && arg.length > 0)
                        .map((arg: string) => arg)
                    : []

                if (ext === '.py') {
                    cmd = 'python'
                    args = ['-u', scriptPath, ...scriptArgs]
                } else if (ext === '.bat') {
                    cmd = 'cmd'
                    args = ['/c', scriptPath, ...scriptArgs]
                } else if (ext === '.ps1') {
                    cmd = 'powershell'
                    args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...scriptArgs]
                } else {
                    peer.send(JSON.stringify({ type: 'error', data: `不支持的脚本类型: ${ext}` }))
                    return
                }

                const proc = spawn(cmd, args, {
                    cwd: path.dirname(scriptPath),
                    env: { ...process.env, PYTHONIOENCODING: 'utf-8', CGTOOLS_WEB_RUNNER: '1' }
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
            peer.send(JSON.stringify({ type: 'error', data: e instanceof Error ? e.message : 'Invalid message' }))
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
