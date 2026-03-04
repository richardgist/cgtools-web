<template>
  <div class="focus-app" :class="{ 'focus-dark': isDark }">
    <!-- Sidebar -->
    <FocusSidebar
      @open-settings="showSettings = true"
      @open-stats="showStats = true"
      @open-create-list="showCreateList = true"
    />

    <!-- Main Content -->
    <div class="focus-main">
      <!-- Stats Cards -->
      <div class="focus-stats">
        <div class="focus-stats__card">
          <div class="focus-stats__label">预计时间</div>
          <div class="focus-stats__value focus-stats__value--red">
            {{ formatEstimate(store.stats.value.estimatedMinutes) }}
          </div>
        </div>
        <div class="focus-stats__card">
          <div class="focus-stats__label">待完成</div>
          <div class="focus-stats__value focus-stats__value--blue">
            {{ store.stats.value.pending }}
          </div>
        </div>
        <div class="focus-stats__card">
          <div class="focus-stats__label">已专注</div>
          <div class="focus-stats__value focus-stats__value--orange">
            {{ formatMinutes(store.stats.value.focusedMinutes) }}
          </div>
        </div>
        <div class="focus-stats__card">
          <div class="focus-stats__label">已完成</div>
          <div class="focus-stats__value focus-stats__value--green">
            {{ store.stats.value.completed }}
          </div>
        </div>
      </div>

      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; padding:0 24px 8px;">
        <h2 style="font-size:18px; font-weight:700; margin:0;">{{ store.currentListName.value }}</h2>
        <div style="display:flex; gap:8px;">
          <button class="focus-btn focus-btn--ghost" @click="showStats = true" title="统计报表">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            报表
          </button>
          <button class="focus-btn focus-btn--ghost" @click="showSettings = true" title="设置">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            设置
          </button>
        </div>
      </div>


      <!-- Mini Timer Bars (shows all running timers in background) -->
      <div
        v-for="rt in timer.runningTimers.value"
        :key="rt.taskId"
        class="focus-mini-timer"
        @click="openTimerFor(rt.taskId)"
      >
        <div class="focus-mini-timer__pulse"></div>
        <span class="focus-mini-timer__icon">🍅</span>
        <span class="focus-mini-timer__task">{{ rt.taskName }}</span>
        <span class="focus-mini-timer__time">{{ rt.displayTime }}</span>
        <span class="focus-mini-timer__label">{{ rt.stateLabel }}</span>
        <button class="focus-mini-timer__stop" @click.stop="timer.stop(rt.taskId)" title="停止">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
        </button>
      </div>

      <!-- Task Input -->
      <div class="focus-task-input">
        <div class="focus-task-input__wrapper">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:var(--focus-red); flex-shrink:0;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <input
            ref="taskInputRef"
            class="focus-task-input__field"
            v-model="newTaskName"
            placeholder="添加任务，按回车保存"
            @keydown.enter="addNewTask"
          />
          <div class="focus-task-input__actions">
            <button class="focus-task-input__btn" @click="showTaskOptions = !showTaskOptions" title="更多选项">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Task List -->
      <div class="focus-tasks">
        <div v-if="store.filteredTasks.value.length === 0 && store.completedTasks.value.length === 0" class="focus-empty" style="padding:60px 0;">
          <div class="focus-empty__icon">📋</div>
          <div class="focus-empty__text">暂无任务，开始添加吧！</div>
        </div>

        <!-- Batch selection toolbar -->
        <div v-if="selectedSize > 0" class="focus-batch-toolbar">
          <span class="focus-batch-toolbar__info">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            已选 {{ selectedSize }} 个任务，可拖拽到左侧批量操作
          </span>
          <button class="focus-batch-toolbar__clear" @click="clearSelection" title="取消选择">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            取消选择
          </button>
        </div>

        <!-- Active Tasks -->
        <TransitionGroup name="task-list" tag="div">
          <div
            v-for="task in store.filteredTasks.value"
            :key="task.id"
            class="focus-task-item"
            :class="{
              active: store.selectedTaskId.value === task.id,
              completed: task.completed,
              'focus-task-item--running': isTaskRunning(task.id),
              'focus-task-item--drag-over': dragOverTaskId === task.id,
              'focus-task-item--selected': isSelected(task.id)
            }"
            draggable="true"
            @dragstart="onTaskDragStart($event, task)"
            @dragend="onTaskDragEnd"
            @dragover.prevent="onTaskDragOver($event, task)"
            @dragleave="onTaskDragLeave"
            @drop.prevent="onTaskDrop(task)"
            @click="onTaskClick($event, task)"
          >
            <!-- Multi-select checkbox (shown when any task is selected) -->
            <div
              v-if="selectedSize > 0 && !isTaskRunning(task.id)"
              class="focus-task-item__multi-check"
              :class="{ checked: isSelected(task.id) }"
              @click.stop="toggleTaskSelection(task.id)"
            >
              <svg v-if="isSelected(task.id)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <!-- Running indicator: pulsing tomato (click to complete) -->
            <div v-else-if="isTaskRunning(task.id)" class="focus-task-item__running-icon" @click.stop="completeRunningTask(task.id)" title="完成任务">🍅</div>
            <!-- Normal checkbox -->
            <div
              v-else
              class="focus-task-item__check"
              :class="{ checked: task.completed }"
              @click.stop="store.toggleTask(task.id)"
            >
              <svg v-if="task.completed" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div class="focus-task-item__content">
              <div class="focus-task-item__name">{{ task.name }}</div>
              <div class="focus-task-item__meta">
                <span v-if="task.pomodoroEstimate > 0" class="focus-task-item__pomodoro">
                  🍅 {{ task.pomodoroCompleted }}/{{ task.pomodoroEstimate }}
                </span>
                <span v-if="task.dueDate" class="focus-task-item__date" :class="{ overdue: isOverdue(task.dueDate) }">
                  📅 {{ formatDate(task.dueDate) }}
                </span>
              </div>
            </div>
            <!-- Running: show timer + status -->
            <template v-if="isTaskRunning(task.id)">
              <span class="focus-task-item__timer">{{ timer.getDisplayTime(task.id) }}</span>
              <span class="focus-task-item__status">{{ timer.getStateLabel(task.id) }}</span>
            </template>
            <!-- Not running: show priority + play -->
            <template v-else>
              <div v-if="task.priority !== 'none'" class="focus-task-item__priority" :class="task.priority"></div>
              <button
                class="focus-task-input__btn"
                style="opacity:0.5; width:28px; height:28px;"
                @click.stop="startFocusOn(task)"
                title="开始专注"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--focus-red)"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
            </template>
          </div>
        </TransitionGroup>

        <!-- Completed Tasks -->
        <div v-if="store.completedTasks.value.length > 0" style="margin-top:16px;">
          <div
            class="focus-tasks__section-title"
            :class="{ collapsed: !store.showCompletedTasks.value }"
            @click="store.showCompletedTasks.value = !store.showCompletedTasks.value"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
            已完成 ({{ store.completedTasks.value.length }})
          </div>
          <div v-if="store.showCompletedTasks.value">
            <!-- Today Completed -->
            <template v-if="store.completedTasksGrouped.value.todayCompleted.length > 0">
              <div class="focus-tasks__group-title">
                <span class="focus-tasks__group-dot focus-tasks__group-dot--today"></span>
                今天已完成 ({{ store.completedTasksGrouped.value.todayCompleted.length }})
              </div>
              <div
                v-for="task in store.completedTasksGrouped.value.todayCompleted"
                :key="task.id"
                class="focus-task-item completed"
                @click="store.selectedTaskId.value = task.id"
              >
                <div class="focus-task-item__check checked" @click.stop="store.toggleTask(task.id)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div class="focus-task-item__content">
                  <div class="focus-task-item__name">{{ task.name }}</div>
                </div>
              </div>
            </template>

            <!-- Earlier Completed -->
            <template v-if="store.completedTasksGrouped.value.earlierCompleted.length > 0">
              <div class="focus-tasks__group-title">
                <span class="focus-tasks__group-dot focus-tasks__group-dot--earlier"></span>
                更早已完成 ({{ store.completedTasksGrouped.value.earlierCompleted.length }})
              </div>
              <div
                v-for="task in store.completedTasksGrouped.value.earlierCompleted"
                :key="task.id"
                class="focus-task-item completed"
                @click="store.selectedTaskId.value = task.id"
              >
                <div class="focus-task-item__check checked" @click.stop="store.toggleTask(task.id)">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div class="focus-task-item__content">
                  <div class="focus-task-item__name">{{ task.name }}</div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- Task Detail Panel -->
    <FocusTaskDetail
      v-if="store.selectedTask.value"
      :task="store.selectedTask.value"
      @close="store.selectedTaskId.value = null"
      @start-focus="startFocusOn"
      @delete="store.deleteTask"
    />

    <!-- Pomodoro Timer Overlay -->
    <FocusPomodoroTimer
      v-if="showTimer"
      :timer="timer"
      @close="onTimerClose"
    />

    <!-- Settings Dialog -->
    <FocusSettingsDialog
      v-if="showSettings"
      @close="showSettings = false"
    />

    <!-- Stats Dialog -->
    <FocusStatsPanel
      v-if="showStats"
      @close="showStats = false"
    />

    <!-- Create List Dialog -->
    <FocusCreateListDialog
      v-if="showCreateList"
      @close="showCreateList = false"
    />

    <!-- Stop Confirm Dialog -->
    <div v-if="showStopConfirm" class="focus-dialog-overlay" @click.self="showStopConfirm = false">
      <div class="focus-dialog" style="max-width:380px;">
        <div class="focus-dialog__header">
          <div class="focus-dialog__title">停止专注</div>
          <button class="focus-dialog__close" @click="showStopConfirm = false">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="focus-confirm__message">确定要停止当前番茄钟吗？<br>已专注的时间将被记录。</div>
        <div class="focus-dialog__footer">
          <button class="focus-btn focus-btn--secondary" @click="showStopConfirm = false">取消</button>
          <button class="focus-btn focus-btn--primary" @click="confirmStop">确定停止</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, provide, onMounted } from 'vue'
import { useFocusStore, type FocusTask } from '~/composables/useFocusStore'
import { usePomodoroTimer } from '~/composables/usePomodoroTimer'

definePageMeta({ layout: false })

const store = useFocusStore()
const timer = usePomodoroTimer()

// Load data from server (SQLite database)
onMounted(() => {
  store.loadFromServer()
})

const newTaskName = ref('')
const taskInputRef = ref<HTMLInputElement | null>(null)
const showTimer = ref(false)
const showSettings = ref(false)
const showStats = ref(false)
const showCreateList = ref(false)
const showStopConfirm = ref(false)
const showTaskOptions = ref(false)

// Provide for child components
provide('showCreateList', showCreateList)
provide('showTimer', showTimer)
provide('timer', timer)

const isDark = computed(() => {
  if (store.settings.value.darkMode === 'on') return true
  if (store.settings.value.darkMode === 'off') return false
  // system
  if (typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return false
})

function addNewTask() {
  const name = newTaskName.value.trim()
  if (!name) return
  store.addTask(name)
  newTaskName.value = ''
}

function startFocusOn(task: FocusTask) {
  timer.startFocus(task.id)
  showTimer.value = true
}

function isTaskRunning(taskId: string) {
  return timer.isTaskActive(taskId)
}

function completeRunningTask(taskId: string) {
  timer.stop(taskId)
  store.toggleTask(taskId)
}

function openTimerFor(taskId: string) {
  timer.switchTask(taskId)
  showTimer.value = true
}

function onTimerClose() {
  // Just hide the overlay, keep timer running in background
  showTimer.value = false
}

function confirmStop() {
  timer.stop()
  showTimer.value = false
  showStopConfirm.value = false
}

// --- Multi-select ---
const selectedTaskIds = ref(new Set<string>())

const selectedSize = computed(() => selectedTaskIds.value.size)
function isSelected(id: string) { return selectedTaskIds.value.has(id) }

function toggleTaskSelection(taskId: string) {
  const next = new Set(selectedTaskIds.value)
  if (next.has(taskId)) {
    next.delete(taskId)
  } else {
    next.add(taskId)
  }
  selectedTaskIds.value = next
}

function clearSelection() {
  selectedTaskIds.value = new Set()
}

function onTaskClick(e: MouseEvent, task: FocusTask) {
  if (e.ctrlKey || e.metaKey) {
    toggleTaskSelection(task.id)
  } else if (selectedTaskIds.value.size > 0) {
    toggleTaskSelection(task.id)
  } else {
    store.selectedTaskId.value = task.id
  }
}

// --- Drag & Drop ---
const draggingTaskIds = ref<string[]>([])
const dragOverTaskId = ref<string | null>(null)
provide('draggingTaskIds', draggingTaskIds)

// Custom drag ghost element
let ghostEl: HTMLElement | null = null

function onTaskDragStart(e: DragEvent, task: FocusTask) {
  // Determine which tasks to drag
  const isBatch = selectedTaskIds.value.has(task.id) && selectedTaskIds.value.size > 1
  if (isBatch) {
    draggingTaskIds.value = Array.from(selectedTaskIds.value)
  } else {
    draggingTaskIds.value = [task.id]
  }

  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData('text/plain', task.id)

  // Create custom ghost for batch drag
  if (isBatch) {
    ghostEl = document.createElement('div')
    ghostEl.className = 'focus-drag-ghost'
    ghostEl.textContent = `移动 ${draggingTaskIds.value.length} 个任务`
    document.body.appendChild(ghostEl)
    e.dataTransfer!.setDragImage(ghostEl, 60, 20)
  } else {
    const el = e.target as HTMLElement
    el.style.opacity = '0.5'
  }
}

function onTaskDragEnd(e: DragEvent) {
  draggingTaskIds.value = []
  dragOverTaskId.value = null
  const el = e.target as HTMLElement
  el.style.opacity = ''
  // Remove ghost element
  if (ghostEl) {
    document.body.removeChild(ghostEl)
    ghostEl = null
  }
}

function onTaskDragOver(e: DragEvent, task: FocusTask) {
  if (draggingTaskIds.value.length > 0 && !draggingTaskIds.value.includes(task.id)) {
    dragOverTaskId.value = task.id
    e.dataTransfer!.dropEffect = 'move'
  }
}

function onTaskDragLeave() {
  dragOverTaskId.value = null
}

function onTaskDrop(task: FocusTask) {
  if (draggingTaskIds.value.length === 1 && draggingTaskIds.value[0] !== task.id) {
    // Single task reorder
    store.reorderTask(draggingTaskIds.value[0], task.id)
  }
  // Batch drag into task list area: no reorder for batch
  dragOverTaskId.value = null
}

function handleTaskDrop(targetKey: string) {
  const taskIds = draggingTaskIds.value
  if (!taskIds.length) return

  const today = new Date()
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

  for (const taskId of taskIds) {
    switch (targetKey) {
      case 'today':
        store.updateTask(taskId, { dueDate: todayDate })
        break
      case 'tomorrow':
        store.updateTask(taskId, { dueDate: tomorrowDate })
        break
      case 'week': {
        const day = today.getDay()
        const sunday = new Date(today)
        sunday.setDate(today.getDate() + (7 - day))
        const sundayStr = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`
        store.updateTask(taskId, { dueDate: sundayStr })
        break
      }
      case 'next7': {
        const d = new Date(today)
        d.setDate(d.getDate() + 3)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        store.updateTask(taskId, { dueDate: dateStr })
        break
      }
      case 'high':
        store.updateTask(taskId, { priority: 'high' })
        break
      case 'planned': {
        const task = store.tasks.value.find(t => t.id === taskId)
        if (task && !task.dueDate) {
          store.updateTask(taskId, { dueDate: todayDate })
        }
        break
      }
      case 'completed':
        store.toggleTask(taskId)
        break
      case 'all':
        break
      default:
        store.updateTask(taskId, { listId: targetKey })
        break
    }
  }

  // Clear selection after batch operation
  selectedTaskIds.value = new Set()
  draggingTaskIds.value = []
}
provide('handleTaskDrop', handleTaskDrop)

function formatEstimate(minutes: number) {
  if (minutes < 60) return `${minutes}分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}时${m}分` : `${h}小时`
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}时${m}分` : `${h}小时`
}

function formatDate(dateStr: string) {
  const today = new Date()
  const d = new Date(dateStr + 'T00:00:00')
  const diff = Math.floor((d.getTime() - today.setHours(0, 0, 0, 0)) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === -1) return '昨天'
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function isOverdue(dateStr: string) {
  return dateStr < new Date().toISOString().slice(0, 10)
}
</script>

<style>
@import '~/assets/css/focus.css';

/* Task list transitions */
.task-list-enter-active { animation: focus-fadeInUp 0.3s ease; }
.task-list-leave-active { transition: all 0.2s ease; }
.task-list-leave-to { opacity: 0; transform: translateX(-20px); }
.task-list-move { transition: transform 0.3s ease; }

/* Drag reorder indicator */
.focus-task-item--drag-over {
  border-top: 2px solid var(--focus-red, #E53935) !important;
  margin-top: -2px;
}
.focus-task-item[draggable="true"] {
  cursor: grab;
}
.focus-task-item[draggable="true"]:active {
  cursor: grabbing;
}
</style>
