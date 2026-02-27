// 专注清单 - 番茄钟计时器逻辑
import { ref, computed, watch, onUnmounted } from 'vue'
import { useFocusStore } from './useFocusStore'

export type TimerState = 'idle' | 'running' | 'paused' | 'break' | 'longBreak'

export function usePomodoroTimer() {
    const store = useFocusStore()

    const state = ref<TimerState>('idle')
    const remainingSeconds = ref(0)
    const totalSeconds = ref(0)
    const currentTaskId = ref<string | null>(null)
    const pomodoroCount = ref(0) // consecutive pomodoro count
    const sessionStartTime = ref(0)
    const countUp = ref(false) // true = count up mode
    const elapsedSeconds = ref(0) // for count up

    let intervalId: ReturnType<typeof setInterval> | null = null

    const currentTask = computed(() =>
        currentTaskId.value ? store.tasks.value.find(t => t.id === currentTaskId.value) ?? null : null
    )

    const progress = computed(() => {
        if (totalSeconds.value === 0) return 0
        if (countUp.value) return Math.min(elapsedSeconds.value / totalSeconds.value, 1)
        return 1 - (remainingSeconds.value / totalSeconds.value)
    })

    const displayTime = computed(() => {
        const secs = countUp.value ? elapsedSeconds.value : remainingSeconds.value
        const m = Math.floor(secs / 60)
        const s = secs % 60
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    })

    const isBreak = computed(() => state.value === 'break' || state.value === 'longBreak')

    const stateLabel = computed(() => {
        switch (state.value) {
            case 'running': return '专注中'
            case 'paused': return '已暂停'
            case 'break': return '短休息'
            case 'longBreak': return '长休息'
            default: return '准备开始'
        }
    })

    function startTimer(durationMinutes: number) {
        totalSeconds.value = durationMinutes * 60
        remainingSeconds.value = durationMinutes * 60
        elapsedSeconds.value = 0
        sessionStartTime.value = Date.now()

        clearInterval(intervalId!)
        intervalId = setInterval(tick, 1000)
    }

    function tick() {
        if (countUp.value) {
            elapsedSeconds.value++
            if (elapsedSeconds.value >= totalSeconds.value) {
                onTimerComplete()
            }
        } else {
            remainingSeconds.value--
            if (remainingSeconds.value <= 0) {
                onTimerComplete()
            }
        }
    }

    function onTimerComplete() {
        clearInterval(intervalId!)
        intervalId = null

        // Play notification sound
        playNotificationSound()

        if (state.value === 'running') {
            // Pomodoro completed
            const duration = Math.round((Date.now() - sessionStartTime.value) / 1000)
            if (currentTaskId.value && currentTask.value) {
                store.addRecord({
                    taskId: currentTaskId.value,
                    taskName: currentTask.value.name,
                    listId: currentTask.value.listId,
                    startTime: sessionStartTime.value,
                    endTime: Date.now(),
                    duration,
                    completed: true,
                })
                // Increment completed pomodoro count on task
                store.updateTask(currentTaskId.value, {
                    pomodoroCompleted: (currentTask.value.pomodoroCompleted ?? 0) + 1
                })
            }

            pomodoroCount.value++

            if (store.settings.value.disableBreak) {
                if (store.settings.value.autoStartNextPomodoro) {
                    startFocus(currentTaskId.value)
                } else {
                    state.value = 'idle'
                }
            } else {
                // Start break
                if (pomodoroCount.value % store.settings.value.longBreakInterval === 0) {
                    state.value = 'longBreak'
                    if (store.settings.value.autoStartBreak) {
                        startTimer(store.settings.value.longBreakDuration)
                    } else {
                        remainingSeconds.value = store.settings.value.longBreakDuration * 60
                        totalSeconds.value = store.settings.value.longBreakDuration * 60
                    }
                } else {
                    state.value = 'break'
                    if (store.settings.value.autoStartBreak) {
                        startTimer(store.settings.value.shortBreakDuration)
                    } else {
                        remainingSeconds.value = store.settings.value.shortBreakDuration * 60
                        totalSeconds.value = store.settings.value.shortBreakDuration * 60
                    }
                }
            }
        } else if (isBreak.value) {
            // Break completed
            if (store.settings.value.autoStartNextPomodoro) {
                startFocus(currentTaskId.value)
            } else {
                state.value = 'idle'
            }
        }
    }

    function startFocus(taskId: string | null) {
        currentTaskId.value = taskId
        state.value = 'running'
        startTimer(store.settings.value.pomodoroDuration)
    }

    function pause() {
        if (state.value === 'running' || isBreak.value) {
            state.value = 'paused'
            clearInterval(intervalId!)
            intervalId = null
        }
    }

    function resume() {
        if (state.value === 'paused') {
            // Determine what we were doing
            state.value = 'running' // simplified - resume as running
            intervalId = setInterval(tick, 1000)
        }
    }

    function stop() {
        // Record partial session if running
        if (state.value === 'running' || state.value === 'paused') {
            const duration = Math.round((Date.now() - sessionStartTime.value) / 1000)
            if (currentTaskId.value && currentTask.value && duration > 60) {
                store.addRecord({
                    taskId: currentTaskId.value,
                    taskName: currentTask.value.name,
                    listId: currentTask.value.listId,
                    startTime: sessionStartTime.value,
                    endTime: Date.now(),
                    duration,
                    completed: false,
                })
            }
        }

        clearInterval(intervalId!)
        intervalId = null
        state.value = 'idle'
        remainingSeconds.value = 0
        totalSeconds.value = 0
        elapsedSeconds.value = 0
        currentTaskId.value = null
    }

    function switchTask(taskId: string) {
        currentTaskId.value = taskId
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

            // Second beep
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

    // Cleanup on unmount
    if (typeof window !== 'undefined') {
        // not calling onUnmounted in composable - interval cleans up on stop()
    }

    return {
        state, remainingSeconds, totalSeconds, currentTaskId,
        pomodoroCount, countUp, elapsedSeconds,
        currentTask, progress, displayTime, isBreak, stateLabel,
        startFocus, pause, resume, stop, switchTask,
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
            // Add occasional louder drops
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
            // Modulate with slow wave for gusts
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
        const dur = 10 // buffer duration in seconds

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
                buffer = generateTick(audioCtx,)
                break
            default:
                // Generate a filtered white noise as fallback for other sounds
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

    // Watch volume changes
    watch(volume, (v) => {
        if (gainNode) gainNode.gain.value = v / 100
    })

    return {
        currentNoise, volume, NOISE_OPTIONS,
        playNoise, stopNoise, setVolume,
    }
}
