// 专注清单 - 番茄钟计时器逻辑 (多任务并行)
import { ref, computed, reactive, watch } from 'vue'
import { useFocusStore } from './useFocusStore'

export type TimerState = 'idle' | 'running' | 'paused' | 'break' | 'longBreak'

export interface TimerInstance {
    taskId: string
    state: TimerState
    remainingSeconds: number
    totalSeconds: number
    pomodoroCount: number
    sessionStartTime: number
    intervalId: ReturnType<typeof setInterval> | null
}

// Singleton state - shared across all usePomodoroTimer() calls
const activeTimers = reactive<Map<string, TimerInstance>>(new Map())
const focusedTaskId = ref<string | null>(null) // which task the fullscreen is viewing

export function usePomodoroTimer() {
    const store = useFocusStore()

    // --- Per-timer helpers ---
    function getTimer(taskId: string): TimerInstance | undefined {
        return activeTimers.get(taskId)
    }

    function getTimerState(taskId: string): TimerState {
        return activeTimers.get(taskId)?.state ?? 'idle'
    }

    function isTaskActive(taskId: string): boolean {
        const t = activeTimers.get(taskId)
        return !!t && (t.state === 'running' || t.state === 'paused')
    }

    function getDisplayTime(taskId: string): string {
        const t = activeTimers.get(taskId)
        if (!t) return '00:00'
        const m = Math.floor(t.remainingSeconds / 60)
        const s = t.remainingSeconds % 60
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }

    function getProgress(taskId: string): number {
        const t = activeTimers.get(taskId)
        if (!t || t.totalSeconds === 0) return 0
        return 1 - (t.remainingSeconds / t.totalSeconds)
    }

    function getStateLabel(taskId: string): string {
        const s = getTimerState(taskId)
        switch (s) {
            case 'running': return '专注中'
            case 'paused': return '已暂停'
            case 'break': return '短休息'
            case 'longBreak': return '长休息'
            default: return '准备开始'
        }
    }

    // --- Focused task (for fullscreen view) ---
    const currentTaskId = focusedTaskId

    const currentTask = computed(() =>
        currentTaskId.value ? store.tasks.value.find(t => t.id === currentTaskId.value) ?? null : null
    )

    // Focused timer's computed values (for fullscreen)
    const state = computed(() => getTimerState(currentTaskId.value ?? ''))
    const remainingSeconds = computed(() => activeTimers.get(currentTaskId.value ?? '')?.remainingSeconds ?? 0)
    const totalSeconds = computed(() => activeTimers.get(currentTaskId.value ?? '')?.totalSeconds ?? 0)
    const pomodoroCount = computed(() => activeTimers.get(currentTaskId.value ?? '')?.pomodoroCount ?? 0)
    const progress = computed(() => getProgress(currentTaskId.value ?? ''))
    const displayTime = computed(() => getDisplayTime(currentTaskId.value ?? ''))
    const isBreak = computed(() => state.value === 'break' || state.value === 'longBreak')
    const stateLabel = computed(() => getStateLabel(currentTaskId.value ?? ''))

    // All running timers
    const runningTimers = computed(() => {
        const result: { taskId: string; taskName: string; displayTime: string; stateLabel: string }[] = []
        for (const [taskId, t] of activeTimers) {
            if (t.state === 'running' || t.state === 'paused') {
                const task = store.tasks.value.find(tk => tk.id === taskId)
                result.push({
                    taskId,
                    taskName: task?.name ?? '未知任务',
                    displayTime: getDisplayTime(taskId),
                    stateLabel: getStateLabel(taskId),
                })
            }
        }
        return result
    })

    // --- Timer tick ---
    function tick(taskId: string) {
        const t = activeTimers.get(taskId)
        if (!t) return
        t.remainingSeconds--
        if (t.remainingSeconds <= 0) {
            onTimerComplete(taskId)
        }
    }

    function onTimerComplete(taskId: string) {
        const t = activeTimers.get(taskId)
        if (!t) return

        clearInterval(t.intervalId!)
        t.intervalId = null

        playNotificationSound()

        if (t.state === 'running') {
            // Pomodoro completed - record it
            const duration = Math.round((Date.now() - t.sessionStartTime) / 1000)
            const task = store.tasks.value.find(tk => tk.id === taskId)
            if (task) {
                store.addRecord({
                    taskId,
                    taskName: task.name,
                    listId: task.listId,
                    startTime: t.sessionStartTime,
                    endTime: Date.now(),
                    duration,
                    completed: true,
                })
                store.updateTask(taskId, {
                    pomodoroCompleted: (task.pomodoroCompleted ?? 0) + 1
                })
            }

            t.pomodoroCount++

            if (store.settings.value.disableBreak) {
                if (store.settings.value.autoStartNextPomodoro) {
                    startTimerInternal(taskId, store.settings.value.pomodoroDuration, 'running')
                } else {
                    t.state = 'idle'
                }
            } else {
                // Start break
                if (t.pomodoroCount % store.settings.value.longBreakInterval === 0) {
                    t.state = 'longBreak'
                    if (store.settings.value.autoStartBreak) {
                        startTimerInternal(taskId, store.settings.value.longBreakDuration, 'longBreak')
                    } else {
                        t.remainingSeconds = store.settings.value.longBreakDuration * 60
                        t.totalSeconds = store.settings.value.longBreakDuration * 60
                    }
                } else {
                    t.state = 'break'
                    if (store.settings.value.autoStartBreak) {
                        startTimerInternal(taskId, store.settings.value.shortBreakDuration, 'break')
                    } else {
                        t.remainingSeconds = store.settings.value.shortBreakDuration * 60
                        t.totalSeconds = store.settings.value.shortBreakDuration * 60
                    }
                }
            }
        } else if (t.state === 'break' || t.state === 'longBreak') {
            // Break completed
            if (store.settings.value.autoStartNextPomodoro) {
                startTimerInternal(taskId, store.settings.value.pomodoroDuration, 'running')
            } else {
                t.state = 'idle'
            }
        }
    }

    function startTimerInternal(taskId: string, durationMinutes: number, newState: TimerState) {
        let t = activeTimers.get(taskId)
        if (!t) {
            t = reactive<TimerInstance>({
                taskId,
                state: 'idle',
                remainingSeconds: 0,
                totalSeconds: 0,
                pomodoroCount: 0,
                sessionStartTime: 0,
                intervalId: null,
            })
            activeTimers.set(taskId, t)
        }

        clearInterval(t.intervalId!)
        t.state = newState
        t.totalSeconds = durationMinutes * 60
        t.remainingSeconds = durationMinutes * 60
        t.sessionStartTime = Date.now()
        t.intervalId = setInterval(() => tick(taskId), 1000)
    }

    // --- Public API ---
    function startFocus(taskId: string | null) {
        if (!taskId) return
        focusedTaskId.value = taskId
        startTimerInternal(taskId, store.settings.value.pomodoroDuration, 'running')
    }

    function pause(taskId?: string) {
        const id = taskId ?? currentTaskId.value
        if (!id) return
        const t = activeTimers.get(id)
        if (!t) return
        if (t.state === 'running' || t.state === 'break' || t.state === 'longBreak') {
            t.state = 'paused'
            clearInterval(t.intervalId!)
            t.intervalId = null
        }
    }

    function resume(taskId?: string) {
        const id = taskId ?? currentTaskId.value
        if (!id) return
        const t = activeTimers.get(id)
        if (!t || t.state !== 'paused') return
        t.state = 'running'
        t.intervalId = setInterval(() => tick(id), 1000)
    }

    function stop(taskId?: string) {
        const id = taskId ?? currentTaskId.value
        if (!id) return
        const t = activeTimers.get(id)
        if (!t) return

        // Record partial session
        if (t.state === 'running' || t.state === 'paused') {
            const duration = Math.round((Date.now() - t.sessionStartTime) / 1000)
            const task = store.tasks.value.find(tk => tk.id === id)
            if (task && duration > 60) {
                store.addRecord({
                    taskId: id,
                    taskName: task.name,
                    listId: task.listId,
                    startTime: t.sessionStartTime,
                    endTime: Date.now(),
                    duration,
                    completed: false,
                })
            }
        }

        clearInterval(t.intervalId!)
        activeTimers.delete(id)
    }

    function switchTask(taskId: string) {
        focusedTaskId.value = taskId
    }

    function stopAll() {
        for (const [id] of activeTimers) {
            stop(id)
        }
    }

    function playNotificationSound() {
        try {
            const ctx = new AudioContext()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.frequency.value = 800
            gain.gain.value = 0.3
            osc.start()
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
            osc.stop(ctx.currentTime + 0.8)

            setTimeout(() => {
                const osc2 = ctx.createOscillator()
                const gain2 = ctx.createGain()
                osc2.connect(gain2)
                gain2.connect(ctx.destination)
                osc2.frequency.value = 1000
                gain2.gain.value = 0.3
                osc2.start()
                gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
                osc2.stop(ctx.currentTime + 0.8)
            }, 300)
        } catch { }
    }

    return {
        // Focused timer (for fullscreen view compatibility)
        state, remainingSeconds, totalSeconds, currentTaskId,
        pomodoroCount, currentTask, progress, displayTime, isBreak, stateLabel,
        // Multi-timer API
        activeTimers,
        runningTimers,
        isTaskActive,
        getTimer,
        getTimerState,
        getDisplayTime,
        getProgress,
        getStateLabel,
        // Actions
        startFocus, pause, resume, stop, switchTask, stopAll,
        // Legacy compat
        countUp: ref(false),
        elapsedSeconds: ref(0),
    }
}

// ==================== White Noise ====================
export interface NoiseOption {
    id: string
    name: string
    icon: string
    premium: boolean
}

export const NOISE_OPTIONS: NoiseOption[] = [
    { id: 'none', name: '无', icon: '🔇', premium: false },
    { id: 'tick', name: '嘀嗒声', icon: '🕐', premium: false },
    { id: 'countdown', name: '倒计时', icon: '⏱️', premium: false },
    { id: 'cricket', name: '蟋蟀声', icon: '🦗', premium: false },
    { id: 'classroom', name: '教室', icon: '🏫', premium: false },
    { id: 'creek', name: '小溪', icon: '🏞️', premium: false },
    { id: 'coast', name: '海岸', icon: '🏖️', premium: false },
    { id: 'rain', name: '雨天', icon: '🌧️', premium: false },
    { id: 'campfire', name: '篝火', icon: '🔥', premium: false },
    { id: 'wind', name: '风', icon: '🌬️', premium: false },
    { id: 'library', name: '图书馆', icon: '📚', premium: false },
    { id: 'frog', name: '夜晚青蛙', icon: '🐸', premium: false },
    { id: 'brown', name: '布朗噪声', icon: '🔊', premium: false },
    { id: 'metronome', name: '节拍器', icon: '🎵', premium: false },
]

export function useWhiteNoise() {
    const currentNoise = ref('none')
    const volume = ref(50) // 0-100
    let audioCtx: AudioContext | null = null
    let noiseSource: AudioBufferSourceNode | OscillatorNode | null = null
    let gainNode: GainNode | null = null

    function generateBrownNoise(ctx: AudioContext, duration: number) {
        const bufferSize = ctx.sampleRate * duration
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        let lastOut = 0
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1
            data[i] = (lastOut + 0.02 * white) / 1.02
            lastOut = data[i]
            data[i] *= 3.5
        }
        return buffer
    }

    function generateTick(ctx: AudioContext) {
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        const tickInterval = ctx.sampleRate // 1 second between ticks
        for (let t = 0; t < 2; t++) {
            const start = t * tickInterval
            for (let i = 0; i < 200; i++) {
                data[start + i] = (Math.random() * 2 - 1) * Math.exp(-i / 30)
            }
        }
        return buffer
    }

    function generateRain(ctx: AudioContext, duration: number) {
        const bufferSize = ctx.sampleRate * duration
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.3
            if (Math.random() < 0.001) {
                for (let j = 0; j < 100 && i + j < bufferSize; j++) {
                    data[i + j] += (Math.random() * 2 - 1) * 0.5 * Math.exp(-j / 20)
                }
            }
        }
        return buffer
    }

    function generateWind(ctx: AudioContext, duration: number) {
        const bufferSize = ctx.sampleRate * duration
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        let lastOut = 0
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1
            data[i] = (lastOut + 0.05 * white) / 1.05
            lastOut = data[i]
            data[i] *= (1 + 0.4 * Math.sin(i / (ctx.sampleRate * 3)))
            data[i] *= 2
        }
        return buffer
    }

    function generateCreek(ctx: AudioContext, duration: number) {
        const bufferSize = ctx.sampleRate * duration
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < bufferSize; i++) {
            const t = i / ctx.sampleRate
            data[i] = Math.sin(t * 400 + Math.sin(t * 50) * 3) * 0.1
            data[i] += (Math.random() * 2 - 1) * 0.05
            data[i] *= (0.5 + 0.5 * Math.sin(t * 0.8))
        }
        return buffer
    }

    function playNoise(noiseId: string) {
        stopNoise()
        if (noiseId === 'none') {
            currentNoise.value = 'none'
            return
        }

        audioCtx = new AudioContext()
        gainNode = audioCtx.createGain()
        gainNode.gain.value = volume.value / 100
        gainNode.connect(audioCtx.destination)

        let buffer: AudioBuffer | null = null
        const dur = 10

        switch (noiseId) {
            case 'brown':
                buffer = generateBrownNoise(audioCtx, dur)
                break
            case 'rain':
                buffer = generateRain(audioCtx, dur)
                break
            case 'wind':
                buffer = generateWind(audioCtx, dur)
                break
            case 'creek':
            case 'coast':
                buffer = generateCreek(audioCtx, dur)
                break
            case 'tick':
            case 'countdown':
            case 'metronome':
                buffer = generateTick(audioCtx)
                break
            default:
                buffer = generateRain(audioCtx, dur)
                break
        }

        if (buffer) {
            const source = audioCtx.createBufferSource()
            source.buffer = buffer
            source.loop = true
            source.connect(gainNode)
            source.start()
            noiseSource = source
        }

        currentNoise.value = noiseId
    }

    function stopNoise() {
        try {
            noiseSource?.stop()
            noiseSource?.disconnect()
            audioCtx?.close()
        } catch { }
        noiseSource = null
        audioCtx = null
        gainNode = null
    }

    function setVolume(v: number) {
        volume.value = v
        if (gainNode) {
            gainNode.gain.value = v / 100
        }
    }

    watch(volume, (v) => {
        if (gainNode) gainNode.gain.value = v / 100
    })

    return {
        currentNoise, volume, NOISE_OPTIONS,
        playNoise, stopNoise, setVolume,
    }
}
