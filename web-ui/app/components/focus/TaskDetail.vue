<template>
  <div class="focus-detail">
    <div class="focus-detail__header">
      <span style="font-size:14px; font-weight:600;">任务详情</span>
      <button class="focus-detail__close" @click="$emit('close')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="focus-detail__body">
      <!-- Task name -->
      <div class="focus-detail__field">
        <div class="focus-detail__label">任务名称</div>
        <input
          class="focus-detail__input"
          :value="task.name"
          @change="update('name', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <!-- Notes -->
      <div class="focus-detail__field">
        <div class="focus-detail__label">备注</div>
        <textarea
          class="focus-detail__input focus-detail__textarea"
          :value="task.notes"
          placeholder="添加备注..."
          @change="update('notes', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
      </div>

      <!-- Pomodoro estimate -->
      <div class="focus-detail__field">
        <div class="focus-detail__label">预估番茄数</div>
        <div class="focus-pomodoro-selector">
          <button class="focus-pomodoro-selector__btn" @click="updatePomodoro(-1)">−</button>
          <span class="focus-pomodoro-selector__count">🍅 {{ task.pomodoroEstimate }}</span>
          <button class="focus-pomodoro-selector__btn" @click="updatePomodoro(1)">+</button>
          <span style="font-size:11px; color:var(--focus-text-muted); margin-left:8px;">
            已完成 {{ task.pomodoroCompleted }}
          </span>
        </div>
      </div>

      <!-- Due date -->
      <div class="focus-detail__field">
        <div class="focus-detail__label">截止日期</div>
        <input
          type="date"
          class="focus-detail__input"
          :value="task.dueDate || ''"
          @change="update('dueDate', ($event.target as HTMLInputElement).value || undefined)"
        />
      </div>

      <!-- Priority -->
      <div class="focus-detail__field">
        <div class="focus-detail__label">优先级</div>
        <div style="display:flex; gap:8px;">
          <button
            v-for="p in priorities"
            :key="p.value"
            class="focus-btn"
            :class="task.priority === p.value ? 'focus-btn--primary' : 'focus-btn--secondary'"
            :style="task.priority === p.value ? { background: p.color, borderColor: p.color } : {}"
            @click="update('priority', p.value)"
          >
            {{ p.label }}
          </button>
        </div>
      </div>

      <!-- List -->
      <div class="focus-detail__field">
        <div class="focus-detail__label">所属清单</div>
        <select
          class="focus-detail__input"
          :value="task.listId"
          @change="update('listId', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="list in store.lists.value" :key="list.id" :value="list.id">
            {{ list.name }}
          </option>
        </select>
      </div>

      <!-- Actions -->
      <div style="display:flex; gap:8px; margin-top:24px;">
        <button class="focus-btn focus-btn--primary" style="flex:1;" @click="$emit('startFocus', task)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          开始专注
        </button>
        <button class="focus-btn focus-btn--secondary" @click="$emit('delete', task.id)" style="color:var(--focus-red);">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useFocusStore, type FocusTask } from '~/composables/useFocusStore'

const props = defineProps<{ task: FocusTask }>()
const emit = defineEmits(['close', 'startFocus', 'delete'])
const store = useFocusStore()

const priorities = [
  { value: 'none', label: '无', color: 'var(--focus-text-muted)' },
  { value: 'low', label: '低', color: '#1E88E5' },
  { value: 'medium', label: '中', color: '#FB8C00' },
  { value: 'high', label: '高', color: '#E53935' },
] as const

function update(field: string, value: any) {
  store.updateTask(props.task.id, { [field]: value })
}

function updatePomodoro(delta: number) {
  const newVal = Math.max(0, Math.min(20, props.task.pomodoroEstimate + delta))
  store.updateTask(props.task.id, { pomodoroEstimate: newVal })
}
</script>
