<template>
  <div class="focus-timer-overlay">
    <div
      class="focus-timer-overlay__bg"
      :style="{ background: bgGradients[currentBg] }"
    ></div>

    <!-- Top bar -->
    <div class="focus-timer__topbar">
      <button class="focus-timer__topbar-btn" @click="$emit('close')" title="返回">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div style="display:flex; gap:8px;">
        <button class="focus-timer__topbar-btn" @click="showNoise = !showNoise" title="白噪音">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        </button>
        <button class="focus-timer__topbar-btn" @click="showTaskPanel = !showTaskPanel" title="任务列表">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </button>
      </div>
    </div>

    <!-- Main content -->
    <div class="focus-timer-overlay__content">
      <!-- Task name -->
      <div class="focus-timer__task-name">
        {{ timer.currentTask.value?.name ?? '自由专注' }}
      </div>

      <!-- Timer circle -->
      <div class="focus-timer__circle">
        <svg class="focus-timer__svg" :viewBox="`0 0 ${size} ${size}`">
          <circle
            class="focus-timer__track"
            :cx="center" :cy="center" :r="radius"
          />
          <circle
            class="focus-timer__progress"
            :cx="center" :cy="center" :r="radius"
            :stroke-dasharray="circumference"
            :stroke-dashoffset="circumference * (1 - timer.progress.value)"
          />
        </svg>
        <div>
          <div class="focus-timer__time">{{ timer.displayTime.value }}</div>
          <div class="focus-timer__label">{{ timer.stateLabel.value }}</div>
        </div>
      </div>

      <!-- Controls -->
      <div class="focus-timer__controls">
        <!-- Pause/Resume -->
        <button
          v-if="timer.state.value === 'running'"
          class="focus-timer__btn"
          @click="timer.pause()"
          title="暂停"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>
        <button
          v-else-if="timer.state.value === 'paused'"
          class="focus-timer__btn focus-timer__btn--primary"
          @click="timer.resume()"
          title="继续"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button
          v-else-if="timer.state.value === 'idle'"
          class="focus-timer__btn focus-timer__btn--primary"
          @click="timer.startFocus(timer.currentTaskId.value)"
          title="开始"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button
          v-else-if="timer.isBreak.value"
          class="focus-timer__btn focus-timer__btn--primary"
          @click="timer.startFocus(timer.currentTaskId.value)"
          title="跳过休息"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
        </button>

        <!-- Stop -->
        <button
          v-if="timer.state.value !== 'idle'"
          class="focus-timer__btn"
          @click="$emit('close')"
          title="停止"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
        </button>
      </div>

      <!-- Pomodoro count -->
      <div style="display:flex; gap:6px; margin-top:8px;">
        <span
          v-for="i in 4"
          :key="i"
          style="font-size:18px; opacity:0.7;"
        >
          {{ i <= (timer.pomodoroCount.value % 4 || (timer.state.value === 'idle' ? 0 : 0)) ? '🍅' : '⚪' }}
        </span>
      </div>
    </div>

    <!-- Noise Panel -->
    <Transition name="slide-right">
      <div v-if="showNoise" class="focus-timer__sidebar" style="right:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div class="focus-timer__sidebar-title">白噪音</div>
          <button class="focus-timer__topbar-btn" style="width:28px;height:28px;" @click="showNoise = false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Volume -->
        <div class="focus-noise__volume" style="margin-bottom:20px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></svg>
          <input
            type="range"
            min="0" max="100"
            class="focus-noise__slider"
            :value="noise.volume.value"
            @input="noise.setVolume(Number(($event.target as HTMLInputElement).value))"
          />
          <span style="color:rgba(255,255,255,0.6); font-size:11px; min-width:30px; text-align:right;">{{ noise.volume.value }}%</span>
        </div>

        <!-- Noise list -->
        <div style="display:grid; grid-template-columns: repeat(3,1fr); gap:8px;">
          <div
            v-for="opt in noise.NOISE_OPTIONS"
            :key="opt.id"
            class="focus-noise__item"
            :class="{ active: noise.currentNoise.value === opt.id }"
            style="border-color: rgba(255,255,255,0.1); color: rgba(255,255,255,0.7);"
            @click="noise.playNoise(opt.id)"
          >
            <span class="focus-noise__item-icon">{{ opt.icon }}</span>
            <span>{{ opt.name }}</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Task Panel -->
    <Transition name="slide-right">
      <div v-if="showTaskPanel" class="focus-timer__sidebar">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div class="focus-timer__sidebar-title">今日任务</div>
          <button class="focus-timer__topbar-btn" style="width:28px;height:28px;" @click="showTaskPanel = false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div
          v-for="task in todayTasks"
          :key="task.id"
          class="focus-timer__sidebar-task"
          :class="{ active: timer.currentTaskId.value === task.id }"
          @click="timer.switchTask(task.id)"
        >
          <span>🍅</span>
          <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ task.name }}</span>
          <span style="opacity:0.5; font-size:11px;">{{ task.pomodoroCompleted }}/{{ task.pomodoroEstimate }}</span>
        </div>

        <div v-if="todayTasks.length === 0" style="color:rgba(255,255,255,0.4); text-align:center; padding:20px; font-size:13px;">
          暂无任务
        </div>

        <div class="focus-timer__sidebar-title" style="margin-top:24px;">专注记录</div>
        <div
          v-for="record in todayRecords"
          :key="record.id"
          style="display:flex; align-items:center; gap:8px; padding:6px 12px; font-size:12px; color:rgba(255,255,255,0.6);"
        >
          <span>{{ formatTime(record.startTime) }}</span>
          <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ record.taskName }}</span>
          <span>{{ Math.round(record.duration / 60) }}分钟</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFocusStore } from '~/composables/useFocusStore'
import { useWhiteNoise, type TimerState } from '~/composables/usePomodoroTimer'

const props = defineProps<{
  timer: {
    state: { value: TimerState }
    currentTask: { value: any }
    currentTaskId: { value: string | null }
    progress: { value: number }
    displayTime: { value: string }
    stateLabel: { value: string }
    isBreak: { value: boolean }
    pomodoroCount: { value: number }
    startFocus: (taskId: string | null) => void
    pause: () => void
    resume: () => void
    stop: () => void
    switchTask: (taskId: string) => void
  }
}>()

const emit = defineEmits(['close'])
const store = useFocusStore()
const noise = useWhiteNoise()

const showNoise = ref(false)
const showTaskPanel = ref(false)
const currentBg = ref(0)

const size = 280
const center = size / 2
const radius = size / 2 - 8
const circumference = 2 * Math.PI * radius

const bgGradients = [
  'linear-gradient(135deg, #0a1628 0%, #1a1a3e 40%, #2d1b4e 100%)',
  'linear-gradient(180deg, rgba(255,107,53,0.15) 0%, #1a4a5e 30%, #0d2137 70%, #0a1628 100%)',
  'linear-gradient(135deg, #1a3a4a 0%, #0d2b3a 50%, #091a28 100%)',
]

const todayTasks = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return store.tasks.value.filter(t => !t.completed && (t.dueDate === today || !t.dueDate)).slice(0, 20)
})

const todayRecords = computed(() => {
  return [...store.todayRecords.value].reverse().slice(0, 10)
})

function formatTime(timestamp: number) {
  const d = new Date(timestamp)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<style scoped>
.slide-right-enter-active, .slide-right-leave-active {
  transition: all 0.3s ease;
}
.slide-right-enter-from, .slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
