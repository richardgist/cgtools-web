import { defineWebSocketHandler } from 'h3'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import {
  buildAndroidSoJobPlan,
  updateDefaultEngineIniAndroidAbi,
  type AndroidSoJobType,
  type AndroidSoPayload,
  type CommandStep,
} from '../../utils/androidSoCommands'

type Peer = {
  id: string
  send: (message: string) => void
}

type ActiveRun = {
  process: ChildProcessWithoutNullStreams | null
  spawnedPids: Set<number>
  terminating: boolean
  running: boolean
  jobType: AndroidSoJobType | ''
  startedAtMs: number
}

type StepResult = {
  code: number
  stdout: string
  stderr: string
}

type StepLogTarget = {
  path: string
  startedAtMs: number
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
    spawnedPids: new Set<number>(),
    terminating: false,
    running: false,
    jobType: '',
    startedAtMs: 0,
  }
  activeRuns.set(peerId, state)
  return state
}

const sanitizeLogFileName = (value: string) => value
  .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
  .replace(/\s+/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 80) || 'step'

const createRunLogDir = (jobType: AndroidSoJobType) => {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+$/, '')
    .replace('T', '-')
  const dir = path.resolve(process.cwd(), 'logs', 'android-so', `${stamp}-${sanitizeLogFileName(jobType)}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const createStepLogTarget = (runLogDir: string, index: number, name: string): StepLogTarget => {
  const stepNo = String(index + 1).padStart(2, '0')
  const logPath = path.join(runLogDir, `${stepNo}-${sanitizeLogFileName(name)}.log`)
  const startedAtMs = Date.now()
  fs.writeFileSync(logPath, `# ${name}\n# Started: ${new Date().toLocaleString()}\n\n`, 'utf-8')
  return { path: logPath, startedAtMs }
}

const appendStepLog = (target: StepLogTarget | null | undefined, text: string) => {
  if (!target) return
  fs.appendFileSync(target.path, text, 'utf-8')
}

const getStepDurationMs = (target: StepLogTarget) => Math.max(0, Date.now() - target.startedAtMs)

const resolveBuiltSoPath = (candidates: Array<string | undefined>) => {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || ''
}

const runProcessForExit = async (command: string, args: string[]) => {
  return await new Promise<{ code: number, stdout: string, stderr: string }>((resolve) => {
    const proc = spawn(command, args, {
      windowsHide: true,
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })
    proc.on('error', (error: Error) => {
      resolve({ code: 1, stdout, stderr: error.message })
    })
    proc.on('close', (code: number | null) => {
      resolve({ code: typeof code === 'number' ? code : 1, stdout, stderr })
    })
  })
}

const killBuildProcessesStartedAfter = async (peer: Peer | null, startedAtMs: number) => {
  if (process.platform !== 'win32' || !startedAtMs) {
    return
  }

  const cutoffMs = Math.max(0, startedAtMs - 60_000)
  const script = [
    `$cutoff = [DateTimeOffset]::FromUnixTimeMilliseconds(${cutoffMs}).LocalDateTime`,
    "$names = @('UnrealBuildTool','clang++')",
    "$targets = Get-Process -ErrorAction SilentlyContinue | Where-Object {",
    "  $names -contains $_.ProcessName -and $_.StartTime -and $_.StartTime -ge $cutoff",
    '}',
    "if ($targets) {",
    "  $ids = ($targets | Select-Object -ExpandProperty Id) -join ','",
    "  Write-Output \"[terminated] Force killing build leftovers: $ids\"",
    "  $targets | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }",
    '} else {',
    "  Write-Output '[terminated] No build leftovers found.'",
    '}',
  ].join('; ')

  const result = await runProcessForExit('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ])
  const text = `${result.stdout || ''}${result.stderr || ''}`
  if (text.trim()) {
    peer && send(peer, { type: 'stderr', data: `${text.trim()}\n` })
  }
}

const terminateActiveProcessTree = async (peer: Peer | null, runState: ActiveRun) => {
  runState.terminating = true
  const pids = new Set<number>(runState.spawnedPids)
  if (runState.process?.pid) {
    pids.add(runState.process.pid)
  }

  let requestedKill = false
  for (const pid of pids) {
    try {
      if (process.platform === 'win32') {
        requestedKill = true
        const result = await runProcessForExit('taskkill', ['/PID', String(pid), '/T', '/F'])
        const text = `${result.stdout || ''}${result.stderr || ''}`.trim()
        if (text) {
          peer && send(peer, { type: 'stderr', data: `${text}\n` })
        }
      } else {
        requestedKill = true
        process.kill(pid, 'SIGTERM')
      }
    } catch (error) {
      console.error('[ws/android-so] terminate failed', error)
    }
  }

  if (runState.jobType === 'buildSo' || runState.jobType === 'rebuildSo') {
    await killBuildProcessesStartedAfter(peer, runState.startedAtMs)
  }

  peer && send(peer, { type: 'stderr', data: '[terminated] Stop requested. Build process cleanup completed.\n' })
  return requestedKill
}

const runStep = async (
  peer: Peer,
  runState: ActiveRun,
  step: CommandStep,
  logTarget?: StepLogTarget,
): Promise<StepResult> => {
  if (step.internalAction?.type === 'updateDefaultEngineIni') {
    try {
      const result = updateDefaultEngineIniAndroidAbi(
        step.internalAction.defaultEngineIniPath,
        step.internalAction.arch,
      )
      const settingsText = Object.entries(result.settings)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ')
      const changedText = result.changed ? 'updated' : 'already current'
      const stdout = `[info] DefaultEngine.ini ${changedText}: ${result.defaultEngineIniPath} (${settingsText})\n`
      appendStepLog(logTarget, stdout)
      appendStepLog(logTarget, `\n# Finished: ${new Date().toLocaleString()}\n# DurationMs: ${logTarget ? getStepDurationMs(logTarget) : 0}\n# ExitCode: 0\n`)
      send(peer, { type: 'stdout', data: stdout })
      return { code: 0, stdout, stderr: '' }
    } catch (error: any) {
      const stderr = `[error] Failed to update DefaultEngine.ini: ${error?.message || error}\n`
      appendStepLog(logTarget, stderr)
      appendStepLog(logTarget, `\n# Finished: ${new Date().toLocaleString()}\n# DurationMs: ${logTarget ? getStepDurationMs(logTarget) : 0}\n# ExitCode: 1\n`)
      send(peer, { type: 'stderr', data: stderr })
      return { code: 1, stdout: '', stderr }
    }
  }

  return await new Promise<StepResult>((resolve) => {
    const isBatch = /\.bat$|\.cmd$/i.test(step.cmd)
    const command = isBatch ? 'cmd' : step.cmd
    const args = isBatch ? ['/c', step.cmd, ...step.args] : step.args

    const proc = spawn(command, args, {
      cwd: step.cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env, ...(step.env || {}), PYTHONIOENCODING: 'utf-8' },
    })

    runState.process = proc
    if (proc.pid) {
      runState.spawnedPids.add(proc.pid)
    }

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      stdout += text
      appendStepLog(logTarget, text)
      send(peer, { type: 'stdout', data: text })
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      stderr += text
      appendStepLog(logTarget, text)
      send(peer, { type: 'stderr', data: text })
    })

    proc.on('error', (error: Error) => {
      const text = `[spawn error] ${error.message}\n`
      stderr += text
      appendStepLog(logTarget, text)
      send(peer, { type: 'stderr', data: text })
      runState.process = null
      resolve({ code: 1, stdout, stderr })
    })

    proc.on('close', (code: number | null) => {
      runState.process = null
      appendStepLog(logTarget, `\n# Finished: ${new Date().toLocaleString()}\n# DurationMs: ${logTarget ? getStepDurationMs(logTarget) : 0}\n# ExitCode: ${typeof code === 'number' ? code : 1}\n`)
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
  runState.jobType = ''
  runState.startedAtMs = 0
  runState.spawnedPids.clear()
  send(peer, { type: 'end', exitCode, outputs })
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
        if (runState.running || runState.process) {
          const killed = await terminateActiveProcessTree(typedPeer, runState)
          if (!killed) {
            send(typedPeer, { type: 'stderr', data: '[terminated] Stop requested. No active child process at this instant.\n' })
          }
        } else {
          send(typedPeer, { type: 'stderr', data: '[terminated] No active run.\n' })
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
      runState.jobType = jobType
      runState.startedAtMs = Date.now()
      runState.spawnedPids.clear()

      const runLogDir = createRunLogDir(jobType)
      send(typedPeer, { type: 'start', jobType, runLogDir })
      for (const warning of plan.warnings) {
        send(typedPeer, { type: 'stderr', data: `[warning] ${warning}\n` })
      }

      let exitCode = 0
      let builtSoPath = ''
      try {
        for (const [index, step] of plan.steps.entries()) {
          if (runState.terminating) {
            exitCode = -1
            break
          }

          const logTarget = createStepLogTarget(runLogDir, index, step.name)
          send(typedPeer, { type: 'step', name: step.name, logPath: logTarget.path })
          const result = await runStep(typedPeer, runState, step, logTarget)
          send(typedPeer, { type: 'stepEnd', name: step.name, exitCode: runState.terminating ? -1 : result.code, logPath: logTarget.path, durationMs: getStepDurationMs(logTarget) })

          if (runState.terminating) {
            exitCode = -1
            break
          }

          if (result.code !== 0) {
            exitCode = result.code
            break
          }

          if ((jobType === 'buildSo' || jobType === 'rebuildSo') && (step.name === 'Build Android SO with UBT' || step.name === 'Rebuild Android SO with UBT')) {
            builtSoPath = resolveBuiltSoPath(plan.outputSoCandidates || [])
            if (builtSoPath) {
              plan.outputs.soPath = builtSoPath
              send(typedPeer, { type: 'stdout', data: `[info] Resolved built SO: ${builtSoPath}\n` })
            }
          }
        }
      } finally {
        for (const [cleanupIndex, cleanupStep] of (plan.cleanupSteps || []).entries()) {
          const logTarget = createStepLogTarget(runLogDir, plan.steps.length + cleanupIndex, cleanupStep.name)
          send(typedPeer, { type: 'step', name: cleanupStep.name, logPath: logTarget.path })
          const cleanupResult = await runStep(typedPeer, runState, cleanupStep, logTarget)
          send(typedPeer, { type: 'stepEnd', name: cleanupStep.name, exitCode: cleanupResult.code, logPath: logTarget.path, durationMs: getStepDurationMs(logTarget) })
          if (cleanupResult.code !== 0) {
            send(typedPeer, {
              type: 'stderr',
              data: `[cleanup error] ${cleanupStep.name} failed with exitCode=${cleanupResult.code}\n`,
            })
            if (exitCode === 0) {
              exitCode = cleanupResult.code
            }
          }
        }
      }

      if (exitCode === 0 && (jobType === 'buildSo' || jobType === 'rebuildSo')) {
        const soCandidates = (plan.outputSoCandidates && plan.outputSoCandidates.length > 0)
          ? plan.outputSoCandidates
          : [plan.outputs.soPath]
        const soPath = builtSoPath || resolveBuiltSoPath(soCandidates)
        if (!soPath || !fs.existsSync(soPath)) {
          send(typedPeer, {
            type: 'error',
            data: `Build succeeded but expected SO not found. Checked:\n${soCandidates.join('\n')}`,
          })
          finishRun(typedPeer, runState, 1)
          return
        }
        plan.outputs.soPath = soPath
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
    } catch (error: any) {
      runState.process = null
      runState.running = false
      runState.terminating = false
      runState.jobType = ''
      runState.startedAtMs = 0
      runState.spawnedPids.clear()
      send(typedPeer, { type: 'error', data: error?.message || 'Invalid request payload.' })
      send(typedPeer, { type: 'end', exitCode: 1 })
    }
  },

  close(peer) {
    const typedPeer = peer as unknown as Peer
    const runState = activeRuns.get(typedPeer.id)
    if (runState?.process) {
      void terminateActiveProcessTree(null, runState)
    }
    activeRuns.delete(typedPeer.id)
    console.log('[ws/android-so] peer disconnected', typedPeer.id)
  },

  error(peer, error) {
    const typedPeer = peer as unknown as Peer
    console.error('[ws/android-so] peer error', typedPeer.id, error)
  },
})
