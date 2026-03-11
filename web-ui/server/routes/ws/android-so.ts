import { defineWebSocketHandler } from 'h3'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import {
  buildAndroidSoJobPlan,
  type AndroidSoJobType,
  type AndroidSoPayload,
  type BuildSoPayload,
  type CommandStep,
} from '../../utils/androidSoCommands'

type Peer = {
  id: string
  send: (message: string) => void
}

type ActiveRun = {
  process: ChildProcessWithoutNullStreams | null
  terminating: boolean
  running: boolean
}

type StepResult = {
  code: number
  stdout: string
  stderr: string
}

const activeRuns = new Map<string, ActiveRun>()

const send = (peer: Peer, payload: Record<string, unknown>) => {
  peer.send(JSON.stringify(payload))
}

const getOrInitRunState = (peerId: string) => {
  const existing = activeRuns.get(peerId)
  if (existing) {
    return existing
  }
  const state: ActiveRun = {
    process: null,
    terminating: false,
    running: false,
  }
  activeRuns.set(peerId, state)
  return state
}

const runStep = async (peer: Peer, runState: ActiveRun, step: CommandStep): Promise<StepResult> => {
  return await new Promise<StepResult>((resolve) => {
    const isBatch = /\.bat$|\.cmd$/i.test(step.cmd)
    const command = isBatch ? 'cmd' : step.cmd
    const args = isBatch ? ['/c', step.cmd, ...step.args] : step.args

    const proc = spawn(command, args, {
      cwd: step.cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })

    runState.process = proc

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      stdout += text
      send(peer, { type: 'stdout', data: text })
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      stderr += text
      send(peer, { type: 'stderr', data: text })
    })

    proc.on('error', (error: Error) => {
      const text = `[spawn error] ${error.message}\n`
      stderr += text
      send(peer, { type: 'stderr', data: text })
      runState.process = null
      resolve({ code: 1, stdout, stderr })
    })

    proc.on('close', (code: number | null) => {
      runState.process = null
      resolve({
        code: typeof code === 'number' ? code : 1,
        stdout,
        stderr,
      })
    })
  })
}

const finishRun = (peer: Peer, runState: ActiveRun, exitCode: number, outputs?: Record<string, string>) => {
  runState.process = null
  runState.running = false
  runState.terminating = false
  send(peer, { type: 'end', exitCode, outputs })
}

type BkDistToggleState = {
  switchPath: string
  backupPath: string
}

const tryDisableBkDist = (peer: Peer, payload: BuildSoPayload): BkDistToggleState | null => {
  const engineRoot = (payload.engineRoot || '').trim()
  if (!engineRoot) {
    send(peer, { type: 'stderr', data: '[warning] Missing engineRoot, skip bk_dist bypass.\n' })
    return null
  }

  const switchPath = path.join(engineRoot, 'Build', 'BatchFiles', 'bk_dist_tools', 'bk_dist_enable_ubt.json')
  if (!fs.existsSync(switchPath)) {
    send(peer, { type: 'stdout', data: `[info] bk_dist switch file not found, skip bypass: ${switchPath}\n` })
    return null
  }

  const backupPath = `${switchPath}.cgtools_backup_${Date.now()}`
  try {
    fs.renameSync(switchPath, backupPath)
    send(peer, { type: 'stdout', data: `[info] bk_dist bypass enabled for this run: ${switchPath}\n` })
    return { switchPath, backupPath }
  } catch (error: any) {
    send(peer, { type: 'stderr', data: `[warning] Failed to disable bk_dist: ${error?.message || error}\n` })
    return null
  }
}

const tryRestoreBkDist = (peer: Peer, state: BkDistToggleState | null) => {
  if (!state) {
    return
  }
  try {
    if (fs.existsSync(state.backupPath) && !fs.existsSync(state.switchPath)) {
      fs.renameSync(state.backupPath, state.switchPath)
      send(peer, { type: 'stdout', data: `[info] bk_dist switch restored: ${state.switchPath}\n` })
    } else if (fs.existsSync(state.backupPath)) {
      fs.unlinkSync(state.backupPath)
      send(peer, { type: 'stderr', data: '[warning] bk_dist switch already exists, removed backup file.\n' })
    }
  } catch (error: any) {
    send(peer, { type: 'stderr', data: `[warning] Failed to restore bk_dist switch: ${error?.message || error}\n` })
  }
}

export default defineWebSocketHandler({
  open(peer) {
    const typedPeer = peer as unknown as Peer
    getOrInitRunState(typedPeer.id)
    console.log('[ws/android-so] peer connected', typedPeer.id)
  },

  async message(peer, message) {
    const typedPeer = peer as unknown as Peer
    const runState = getOrInitRunState(typedPeer.id)

    try {
      const data = JSON.parse(message.text())

      if (data.action === 'terminate') {
        if (runState.process) {
          runState.terminating = true
          try {
            runState.process.kill()
          } catch (error) {
            console.error('[ws/android-so] terminate failed', error)
          }
          send(typedPeer, { type: 'stderr', data: '[terminated] Process termination requested.\n' })
        } else {
          send(typedPeer, { type: 'stderr', data: '[terminated] No active process.\n' })
        }
        return
      }

      if (data.action !== 'run') {
        send(typedPeer, { type: 'error', data: `Unsupported action: ${data.action}` })
        return
      }

      if (runState.running) {
        send(typedPeer, { type: 'error', data: 'Another task is still running for this session.' })
        return
      }

      const jobType = data.jobType as AndroidSoJobType
      const payload = (data.payload || {}) as AndroidSoPayload
      const plan = buildAndroidSoJobPlan(jobType, payload)

      if (plan.validationErrors.length > 0) {
        send(typedPeer, { type: 'error', data: plan.validationErrors.join('\n') })
        finishRun(typedPeer, runState, 1)
        return
      }

      runState.running = true
      runState.terminating = false

      send(typedPeer, { type: 'start', jobType })
      for (const warning of plan.warnings) {
        send(typedPeer, { type: 'stderr', data: `[warning] ${warning}\n` })
      }

      let bkDistToggleState: BkDistToggleState | null = null
      try {
        if (jobType === 'buildSo') {
          bkDistToggleState = tryDisableBkDist(typedPeer, payload as BuildSoPayload)
        }

        let exitCode = 0
        for (const step of plan.steps) {
          if (runState.terminating) {
            exitCode = -1
            break
          }

          send(typedPeer, { type: 'step', name: step.name })
          const result = await runStep(typedPeer, runState, step)

          if (runState.terminating) {
            exitCode = -1
            break
          }

          if (result.code !== 0) {
            exitCode = result.code
            break
          }
        }

        if (exitCode === 0 && jobType === 'buildSo') {
          const soPath = plan.outputs.soPath
          if (!soPath || !fs.existsSync(soPath)) {
            send(typedPeer, {
              type: 'error',
              data: `Build succeeded but expected SO not found: ${soPath}`,
            })
            finishRun(typedPeer, runState, 1)
            return
          }
        }

        if (exitCode === 0 && jobType === 'replaceA') {
          const outputApk = plan.outputs.outputApk
          if (!outputApk || !fs.existsSync(outputApk)) {
            send(typedPeer, {
              type: 'error',
              data: `replaceSo finished but output APK not found: ${outputApk}`,
            })
            finishRun(typedPeer, runState, 1)
            return
          }
        }

        if (exitCode === 0 && jobType === 'injectB') {
          const localLogPath = plan.outputs.localLogPath
          const marker = plan.outputs.expectedMarker
          if (!localLogPath || !fs.existsSync(localLogPath)) {
            send(typedPeer, {
              type: 'error',
              data: `Injection log pull failed: ${localLogPath}`,
            })
            finishRun(typedPeer, runState, 1)
            return
          }

          const logText = fs.readFileSync(localLogPath, 'utf-8')
          if (!marker || !logText.includes(marker)) {
            send(typedPeer, {
              type: 'error',
              data: `Injection marker not found in log: ${marker}`,
            })
            send(typedPeer, {
              type: 'stderr',
              data: `[inject-log] ${localLogPath}\n${logText}\n`,
            })
            finishRun(typedPeer, runState, 1, plan.outputs)
            return
          }
        }

        finishRun(typedPeer, runState, exitCode, plan.outputs)
      } finally {
        tryRestoreBkDist(typedPeer, bkDistToggleState)
      }
    } catch (error: any) {
      runState.process = null
      runState.running = false
      runState.terminating = false
      send(typedPeer, { type: 'error', data: error?.message || 'Invalid request payload.' })
      send(typedPeer, { type: 'end', exitCode: 1 })
    }
  },

  close(peer) {
    const typedPeer = peer as unknown as Peer
    const runState = activeRuns.get(typedPeer.id)
    if (runState?.process) {
      try {
        runState.process.kill()
      } catch (error) {
        console.error('[ws/android-so] kill on close failed', error)
      }
    }
    activeRuns.delete(typedPeer.id)
    console.log('[ws/android-so] peer disconnected', typedPeer.id)
  },

  error(peer, error) {
    const typedPeer = peer as unknown as Peer
    console.error('[ws/android-so] peer error', typedPeer.id, error)
  },
})
