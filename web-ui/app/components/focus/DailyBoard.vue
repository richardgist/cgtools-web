<template>
  <div class="focus-daily-board">
    <div class="focus-daily-board__toolbar">
      <div class="focus-daily-board__tabs" role="tablist" aria-label="日期范围">
        <button
          v-for="option in rangeOptions"
          :key="option.key"
          class="focus-daily-board__tab"
          :class="{ active: rangeMode === option.key }"
          @click="rangeMode = option.key"
        >
          {{ option.label }}
        </button>
      </div>

      <div v-if="rangeMode === 'month'" class="focus-daily-board__month-nav">
        <button class="focus-icon-btn" @click="prevMonth" title="上个月">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span>{{ visibleYear }}年{{ visibleMonth + 1 }}月</span>
        <button class="focus-icon-btn" @click="nextMonth" title="下个月">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    </div>

    <div v-if="rangeMode === 'month'" class="focus-daily-board__calendar">
      <div v-for="day in weekHeaders" :key="day" class="focus-daily-board__weekday">{{ day }}</div>
      <button
        v-for="day in monthDays"
        :key="day.key"
        class="focus-daily-card"
        :class="{
          active: selectedDate === day.date,
          today: day.isToday,
          'is-empty': !day.date,
          'has-snapshot': day.hasSnapshot
        }"
        :disabled="!day.date"
        @click="day.date && (selectedDate = day.date)"
      >
        <span class="focus-daily-card__date">{{ day.label }}</span>
        <span v-if="day.date" class="focus-daily-card__counts">
          计 {{ day.counts.planned }} / 完 {{ day.counts.completed }} / 顺 {{ day.counts.carried }}
        </span>
      </button>
    </div>

    <div v-else class="focus-daily-board__strip">
      <button
        v-for="day in stripDays"
        :key="day.date"
        class="focus-daily-card"
        :class="{
          active: selectedDate === day.date,
          today: day.isToday,
          'has-snapshot': day.hasSnapshot
        }"
        @click="selectedDate = day.date"
      >
        <span class="focus-daily-card__week">{{ day.weekday }}</span>
        <span class="focus-daily-card__date">{{ day.label }}</span>
        <span class="focus-daily-card__counts">
          计 {{ day.counts.planned }} / 完 {{ day.counts.completed }} / 顺 {{ day.counts.carried }}
        </span>
      </button>
    </div>

    <div class="focus-daily-detail">
      <div class="focus-daily-detail__header">
        <div>
          <div class="focus-daily-detail__date">{{ selectedDateLabel }}</div>
          <div class="focus-daily-detail__source">
            {{ savedSnapshot ? `已保存快照，更新于 ${formatTime(savedSnapshot.updatedAt)}` : '实时生成，保存后可固定历史内容' }}
          </div>
        </div>
        <div class="focus-daily-detail__actions">
          <button class="focus-btn focus-btn--secondary" @click="copyReport">
            {{ copied ? '已复制' : '复制日报' }}
          </button>
          <button class="focus-btn focus-btn--primary" @click="saveSnapshot">
            {{ savedSnapshot ? '更新快照' : '保存快照' }}
          </button>
        </div>
      </div>

      <div class="focus-daily-detail__sections">
        <section class="focus-daily-section">
          <h3>今日计划</h3>
          <button
            v-for="task in report.planned"
            :key="task.id"
            class="focus-daily-task"
            @click="openTask(task.id)"
          >
            {{ task.name }}
          </button>
          <div v-if="report.planned.length === 0" class="focus-daily-empty">无</div>
        </section>

        <section class="focus-daily-section">
          <h3>今日完成</h3>
          <button
            v-for="task in report.completed"
            :key="task.id"
            class="focus-daily-task focus-daily-task--done"
            @click="openTask(task.id)"
          >
            {{ task.name }}
          </button>
          <div v-if="report.completed.length === 0" class="focus-daily-empty">无</div>
        </section>

        <section class="focus-daily-section">
          <h3>未完成/顺延</h3>
          <button
            v-for="task in report.carried"
            :key="task.id"
            class="focus-daily-task focus-daily-task--carried"
            @click="openTask(task.id)"
          >
            {{ task.name }}
          </button>
          <div v-if="report.carried.length === 0" class="focus-daily-empty">无</div>
        </section>
      </div>

      <pre class="focus-daily-copy-preview">{{ report.reportText }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFocusStore } from '~/composables/useFocusStore'

type RangeMode = 'recent7' | 'week' | 'month'

const store = useFocusStore()
const today = new Date()
const rangeMode = ref<RangeMode>('recent7')
const selectedDate = ref(formatDateKey(today))
const visibleMonth = ref(today.getMonth())
const visibleYear = ref(today.getFullYear())
const copied = ref(false)

const rangeOptions: { key: RangeMode; label: string }[] = [
  { key: 'recent7', label: '最近7天' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '月历' },
]

const weekHeaders = ['一', '二', '三', '四', '五', '六', '日']

const savedSnapshot = computed(() => store.getSavedDailySnapshot(selectedDate.value))
const report = computed(() => store.getDailyReport(selectedDate.value))

const selectedDateLabel = computed(() => {
  const d = parseDateKey(selectedDate.value)
  const weekday = new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(d)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekday}`
})

const stripDays = computed(() => {
  const dates = rangeMode.value === 'week' ? getWeekDates(today) : getRecent7Dates(today)
  return dates.map((date) => buildDayCard(date))
})

const monthDays = computed(() => {
  const firstDay = new Date(visibleYear.value, visibleMonth.value, 1)
  const lastDay = new Date(visibleYear.value, visibleMonth.value + 1, 0)
  const firstWeekday = firstDay.getDay() === 0 ? 7 : firstDay.getDay()
  const days: Array<ReturnType<typeof buildEmptyDayCard> | ReturnType<typeof buildDayCard>> = []

  for (let i = 1; i < firstWeekday; i++) {
    days.push(buildEmptyDayCard(`blank-${i}`))
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    days.push(buildDayCard(new Date(visibleYear.value, visibleMonth.value, day)))
  }

  return days
})

function buildDayCard(date: Date) {
  const dateKey = formatDateKey(date)
  const currentReport = store.buildDailyReport(dateKey)
  return {
    key: dateKey,
    date: dateKey,
    label: String(date.getDate()),
    weekday: new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date),
    isToday: dateKey === formatDateKey(today),
    hasSnapshot: !!store.getSavedDailySnapshot(dateKey),
    counts: {
      planned: currentReport.planned.length,
      completed: currentReport.completed.length,
      carried: currentReport.carried.length,
    },
  }
}

function buildEmptyDayCard(key: string) {
  return {
    key,
    date: '',
    label: '',
    weekday: '',
    isToday: false,
    hasSnapshot: false,
    counts: { planned: 0, completed: 0, carried: 0 },
  }
}

function getRecent7Dates(baseDate: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(baseDate)
    d.setDate(baseDate.getDate() - 6 + index)
    return d
  })
}

function getWeekDates(baseDate: Date) {
  const day = baseDate.getDay()
  const monday = new Date(baseDate)
  monday.setDate(baseDate.getDate() - (day === 0 ? 6 : day - 1))
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + index)
    return d
  })
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`)
}

function prevMonth() {
  if (visibleMonth.value === 0) {
    visibleMonth.value = 11
    visibleYear.value--
  } else {
    visibleMonth.value--
  }
}

function nextMonth() {
  if (visibleMonth.value === 11) {
    visibleMonth.value = 0
    visibleYear.value++
  } else {
    visibleMonth.value++
  }
}

function openTask(taskId: string) {
  if (store.tasks.value.some((task) => task.id === taskId)) {
    store.selectedTaskId.value = taskId
  }
}

async function copyReport() {
  const text = report.value.reportText
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
  } else {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1200)
}

function saveSnapshot() {
  store.saveDailySnapshot(selectedDate.value)
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}
</script>
