<template>
  <div class="focus-dialog-overlay" @click.self="$emit('close')">
    <div class="focus-dialog focus-dialog--xl">
      <div class="focus-dialog__header">
        <div class="focus-dialog__title">📊 数据报表</div>
        <button class="focus-dialog__close" @click="$emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="focus-dialog__body">
        <!-- Overview Cards -->
        <div class="focus-report__cards" style="grid-template-columns: repeat(6,1fr);">
          <div class="focus-report__card">
            <div class="focus-report__card-value">{{ formatTime(store.totalFocusMinutes.value) }}</div>
            <div class="focus-report__card-label">总专注时间</div>
          </div>
          <div class="focus-report__card">
            <div class="focus-report__card-value" style="color:var(--focus-blue);">{{ formatTime(store.weekFocusMinutes.value) }}</div>
            <div class="focus-report__card-label">本周专注</div>
          </div>
          <div class="focus-report__card">
            <div class="focus-report__card-value" style="color:var(--focus-orange);">{{ formatTime(store.todayFocusMinutes.value) }}</div>
            <div class="focus-report__card-label">今日专注</div>
          </div>
          <div class="focus-report__card">
            <div class="focus-report__card-value" style="color:var(--focus-green);">{{ store.totalCompletedTasks.value }}</div>
            <div class="focus-report__card-label">总完成任务</div>
          </div>
          <div class="focus-report__card">
            <div class="focus-report__card-value" style="color:var(--focus-blue);">{{ store.weekCompletedTasks.value }}</div>
            <div class="focus-report__card-label">本周完成</div>
          </div>
          <div class="focus-report__card">
            <div class="focus-report__card-value" style="color:var(--focus-orange);">{{ store.todayCompletedTasks.value }}</div>
            <div class="focus-report__card-label">今日完成</div>
          </div>
        </div>

        <!-- Heatmap -->
        <div class="focus-report__section">
          <div class="focus-report__section-title">🔥 本周专注热力图</div>
          <div style="overflow-x:auto;">
            <div style="display:grid; grid-template-columns: 50px repeat(24,1fr); gap:2px; min-width:600px;">
              <!-- Hour headers -->
              <div></div>
              <div v-for="h in 24" :key="'h'+h" style="text-align:center; font-size:9px; color:var(--focus-text-muted);">{{ h-1 }}</div>

              <!-- Day rows -->
              <template v-for="(dayName, dayIdx) in dayNames" :key="'d'+dayIdx">
                <div style="font-size:11px; color:var(--focus-text-secondary); display:flex; align-items:center;">{{ dayName }}</div>
                <div
                  v-for="h in 24"
                  :key="'c'+dayIdx+'-'+h"
                  class="focus-heatmap__cell"
                  :class="getHeatmapLevel(heatmap[dayIdx]?.[h-1] ?? 0)"
                  :title="`${dayName} ${h-1}:00 - ${heatmap[dayIdx]?.[h-1] ?? 0}分钟`"
                  style="aspect-ratio:1; border-radius:2px;"
                ></div>
              </template>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:4px; justify-content:flex-end; margin-top:8px; font-size:10px; color:var(--focus-text-muted);">
            少
            <div class="focus-heatmap__cell" style="width:10px;height:10px;"></div>
            <div class="focus-heatmap__cell focus-heatmap__cell--l1" style="width:10px;height:10px;"></div>
            <div class="focus-heatmap__cell focus-heatmap__cell--l2" style="width:10px;height:10px;"></div>
            <div class="focus-heatmap__cell focus-heatmap__cell--l3" style="width:10px;height:10px;"></div>
            <div class="focus-heatmap__cell focus-heatmap__cell--l4" style="width:10px;height:10px;"></div>
            多
          </div>
        </div>

        <!-- Focus Ranking & List Distribution side by side -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px;">
          <!-- Focus Ranking -->
          <div class="focus-report__section">
            <div class="focus-report__section-title">🏆 专注时间排行</div>
            <div v-if="ranking.length === 0" style="text-align:center; padding:20px; color:var(--focus-text-muted); font-size:13px;">
              暂无数据
            </div>
            <div v-for="(item, i) in ranking" :key="item.taskId" style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid var(--focus-border-light);">
              <span style="width:20px; text-align:center; font-size:12px; font-weight:700;" :style="{ color: i < 3 ? 'var(--focus-red)' : 'var(--focus-text-muted)' }">{{ i + 1 }}</span>
              <span style="flex:1; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{{ item.name }}</span>
              <span style="font-size:12px; color:var(--focus-red); font-weight:600;">{{ item.minutes }}分钟</span>
            </div>
          </div>

          <!-- List Distribution -->
          <div class="focus-report__section">
            <div class="focus-report__section-title">📊 清单时间分布</div>
            <div style="display:flex; flex-direction:column; align-items:center;">
              <!-- Simple ring chart using SVG -->
              <svg width="160" height="160" viewBox="0 0 160 160" style="margin-bottom:16px;">
                <circle cx="80" cy="80" r="60" fill="none" stroke="var(--focus-border-light)" stroke-width="20"/>
                <circle
                  v-for="(seg, i) in ringSegments"
                  :key="i"
                  cx="80" cy="80" r="60"
                  fill="none"
                  :stroke="seg.color"
                  stroke-width="20"
                  :stroke-dasharray="`${seg.length} ${circumference - seg.length}`"
                  :stroke-dashoffset="-seg.offset"
                  style="transform: rotate(-90deg); transform-origin: center;"
                />
                <text x="80" y="76" text-anchor="middle" fill="var(--focus-text)" font-size="18" font-weight="700">
                  {{ totalDistMinutes }}
                </text>
                <text x="80" y="94" text-anchor="middle" fill="var(--focus-text-muted)" font-size="10">
                  分钟
                </text>
              </svg>

              <!-- Legend -->
              <div style="width:100%;">
                <div v-for="item in distribution" :key="item.listId" style="display:flex; align-items:center; gap:8px; padding:4px 0; font-size:12px;">
                  <span style="width:8px; height:8px; border-radius:50; flex-shrink:0;" :style="{ background: item.color, borderRadius: '50%' }"></span>
                  <span style="flex:1; color:var(--focus-text-secondary);">{{ item.name }}</span>
                  <span style="font-weight:600;">{{ item.minutes }}分钟</span>
                  <span style="color:var(--focus-text-muted); width:40px; text-align:right;">{{ ((item.minutes / (totalDistMinutes || 1)) * 100).toFixed(0) }}%</span>
                </div>
              </div>
              <div v-if="distribution.length === 0" style="text-align:center; padding:20px; color:var(--focus-text-muted); font-size:13px;">
                暂无数据
              </div>
            </div>
          </div>
        </div>

        <!-- Daily Goal Calendar -->
        <div class="focus-report__section">
          <div class="focus-report__section-title">🎯 每日专注目标</div>
          <div style="display:flex; gap:24px; align-items:flex-start;">
            <!-- Calendar -->
            <div style="flex:1;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <button class="focus-btn focus-btn--ghost" @click="prevMonth">◀</button>
                <span style="font-size:14px; font-weight:600;">{{ calendarYear }}年{{ calendarMonth + 1 }}月</span>
                <button class="focus-btn focus-btn--ghost" @click="nextMonth">▶</button>
              </div>
              <div class="focus-calendar">
                <div v-for="d in ['一','二','三','四','五','六','日']" :key="d" class="focus-calendar__day-header">{{ d }}</div>
                <div
                  v-for="(day, i) in calendarDays"
                  :key="i"
                  class="focus-calendar__day"
                  :class="{
                    today: day.isToday,
                    achieved: day.achieved
                  }"
                  :style="day.day === 0 ? { visibility: 'hidden' } : {}"
                >
                  {{ day.day || '' }}
                </div>
              </div>
            </div>

            <!-- Stats -->
            <div style="width:180px; display:flex; flex-direction:column; gap:12px;">
              <div class="focus-report__card">
                <div class="focus-report__card-value" style="font-size:20px;">{{ goalStats.focusDays }}</div>
                <div class="focus-report__card-label">专注天数</div>
              </div>
              <div class="focus-report__card">
                <div class="focus-report__card-value" style="font-size:20px; color:var(--focus-green);">{{ goalStats.achievedDays }}</div>
                <div class="focus-report__card-label">达标天数</div>
              </div>
              <div class="focus-report__card">
                <div class="focus-report__card-value" style="font-size:20px; color:var(--focus-blue);">{{ goalStats.rate }}%</div>
                <div class="focus-report__card-label">目标完成率</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFocusStore } from '~/composables/useFocusStore'

const emit = defineEmits(['close'])
const store = useFocusStore()

const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// Heatmap
const heatmap = computed(() => store.getHeatmapData())

function getHeatmapLevel(minutes: number) {
  if (minutes === 0) return ''
  if (minutes < 15) return 'focus-heatmap__cell--l1'
  if (minutes < 30) return 'focus-heatmap__cell--l2'
  if (minutes < 60) return 'focus-heatmap__cell--l3'
  return 'focus-heatmap__cell--l4'
}

// Ranking
const ranking = computed(() => {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - 7)
  return store.getFocusRanking(start.getTime(), now.getTime()).slice(0, 10)
})

// Distribution
const distribution = computed(() => {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - 7)
  return store.getListDistribution(start.getTime(), now.getTime())
})

const totalDistMinutes = computed(() => distribution.value.reduce((a, b) => a + b.minutes, 0))

const circumference = 2 * Math.PI * 60

const ringSegments = computed(() => {
  const total = totalDistMinutes.value || 1
  let offset = 0
  return distribution.value.map(item => {
    const length = (item.minutes / total) * circumference
    const seg = { color: item.color, length, offset }
    offset += length
    return seg
  })
})

// Calendar
const calendarMonth = ref(new Date().getMonth())
const calendarYear = ref(new Date().getFullYear())

function prevMonth() {
  if (calendarMonth.value === 0) {
    calendarMonth.value = 11
    calendarYear.value--
  } else {
    calendarMonth.value--
  }
}

function nextMonth() {
  if (calendarMonth.value === 11) {
    calendarMonth.value = 0
    calendarYear.value++
  } else {
    calendarMonth.value++
  }
}

const calendarDays = computed(() => {
  const year = calendarYear.value
  const month = calendarMonth.value
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  let startDayOfWeek = firstDay.getDay()
  if (startDayOfWeek === 0) startDayOfWeek = 7

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const days: { day: number; isToday: boolean; achieved: boolean }[] = []

  // Fill empty cells before first day
  for (let i = 1; i < startDayOfWeek; i++) {
    days.push({ day: 0, isToday: false, achieved: false })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayStart = new Date(year, month, d).getTime()
    const dayEnd = dayStart + 86400000
    const dayRecords = store.getRecordsInRange(dayStart, dayEnd)
    const dayMinutes = Math.floor(dayRecords.reduce((a, r) => a + r.duration, 0) / 60)

    days.push({
      day: d,
      isToday: dateStr === todayStr,
      achieved: dayMinutes >= store.settings.value.dailyGoalMinutes,
    })
  }

  return days
})

const goalStats = computed(() => {
  const year = calendarYear.value
  const month = calendarMonth.value
  const lastDay = new Date(year, month + 1, 0).getDate()
  let focusDays = 0
  let achievedDays = 0

  for (let d = 1; d <= lastDay; d++) {
    const dayStart = new Date(year, month, d).getTime()
    const dayEnd = dayStart + 86400000
    const dayRecords = store.getRecordsInRange(dayStart, dayEnd)
    const dayMinutes = Math.floor(dayRecords.reduce((a, r) => a + r.duration, 0) / 60)
    if (dayMinutes > 0) focusDays++
    if (dayMinutes >= store.settings.value.dailyGoalMinutes) achievedDays++
  }

  return {
    focusDays,
    achievedDays,
    rate: focusDays > 0 ? Math.round((achievedDays / focusDays) * 100) : 0,
  }
})

function formatTime(minutes: number) {
  if (minutes < 60) return `${minutes}分`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}时${m}分` : `${h}时`
}
</script>
