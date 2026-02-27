<template>
  <div class="focus-dialog-overlay" @click.self="$emit('close')">
    <div class="focus-dialog focus-dialog--large">
      <div class="focus-dialog__header">
        <div class="focus-dialog__title">设置</div>
        <button class="focus-dialog__close" @click="$emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Tabs -->
      <div class="focus-settings__tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="focus-settings__tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="focus-dialog__body">
        <!-- 通用 -->
        <div v-if="activeTab === 'general'">
          <div class="focus-settings__group">
            <div class="focus-settings__group-title">任务</div>
            <div class="focus-settings__row">
              <span class="focus-settings__row-label">在顶部添加新任务</span>
              <div class="focus-toggle" :class="{ active: s.addTaskOnTop }" @click="toggle('addTaskOnTop')">
                <div class="focus-toggle__knob"></div>
              </div>
            </div>
          </div>

          <div class="focus-settings__group">
            <div class="focus-settings__group-title">每日专注目标</div>
            <div class="focus-settings__row">
              <span class="focus-settings__row-label">目标时长（分钟）</span>
              <div class="focus-stepper">
                <button class="focus-stepper__btn" @click="adjustSetting('dailyGoalMinutes', -30)">−</button>
                <span class="focus-stepper__value">{{ s.dailyGoalMinutes }}</span>
                <button class="focus-stepper__btn" @click="adjustSetting('dailyGoalMinutes', 30)">+</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 番茄钟 -->
        <div v-if="activeTab === 'pomodoro'">
          <div class="focus-settings__group">
            <div class="focus-settings__group-title">时长设置</div>
            <div class="focus-settings__row">
              <span class="focus-settings__row-label">番茄时长</span>
              <div class="focus-settings__row-value">
                <div class="focus-stepper">
                  <button class="focus-stepper__btn" @click="adjustSetting('pomodoroDuration', -5)">−</button>
                  <span class="focus-stepper__value">{{ s.pomodoroDuration }}</span>
                  <button class="focus-stepper__btn" @click="adjustSetting('pomodoroDuration', 5)">+</button>
                </div>
                <span style="font-size:12px; color:var(--focus-text-muted);">分钟</span>
              </div>
            </div>
            <div class="focus-settings__row">
              <span class="focus-settings__row-label">短时休息</span>
              <div class="focus-settings__row-value">
                <div class="focus-stepper">
                  <button class="focus-stepper__btn" @click="adjustSetting('shortBreakDuration', -1)">−</button>
                  <span class="focus-stepper__value">{{ s.shortBreakDuration }}</span>
                  <button class="focus-stepper__btn" @click="adjustSetting('shortBreakDuration', 1)">+</button>
                </div>
                <span style="font-size:12px; color:var(--focus-text-muted);">分钟</span>
              </div>
            </div>
            <div class="focus-settings__row">
              <span class="focus-settings__row-label">长时休息</span>
              <div class="focus-settings__row-value">
                <div class="focus-stepper">
                  <button class="focus-stepper__btn" @click="adjustSetting('longBreakDuration', -5)">−</button>
                  <span class="focus-stepper__value">{{ s.longBreakDuration }}</span>
                  <button class="focus-stepper__btn" @click="adjustSetting('longBreakDuration', 5)">+</button>
                </div>
                <span style="font-size:12px; color:var(--focus-text-muted);">分钟</span>
              </div>
            </div>
            <div class="focus-settings__row">
              <span class="focus-settings__row-label">长时休息间隔</span>
              <div class="focus-settings__row-value">
                <div class="focus-stepper">
                  <button class="focus-stepper__btn" @click="adjustSetting('longBreakInterval', -1)">−</button>
                  <span class="focus-stepper__value">{{ s.longBreakInterval }}</span>
                  <button class="focus-stepper__btn" @click="adjustSetting('longBreakInterval', 1)">+</button>
                </div>
                <span style="font-size:12px; color:var(--focus-text-muted);">个番茄</span>
              </div>
            </div>
          </div>

          <div class="focus-settings__group">
            <div class="focus-settings__group-title">自动化</div>
            <div class="focus-settings__row">
              <span class="focus-settings__row-label">自动开始下个番茄</span>
              <div class="focus-toggle" :class="{ active: s.autoStartNextPomodoro }" @click="toggle('autoStartNextPomodoro')">
                <div class="focus-toggle__knob"></div>
              </div>
            </div>
            <div class="focus-settings__row">
              <span class="focus-settings__row-label">自动开始休息</span>
              <div class="focus-toggle" :class="{ active: s.autoStartBreak }" @click="toggle('autoStartBreak')">
                <div class="focus-toggle__knob"></div>
              </div>
            </div>
            <div class="focus-settings__row">
              <span class="focus-settings__row-label">禁用休息</span>
              <div class="focus-toggle" :class="{ active: s.disableBreak }" @click="toggle('disableBreak')">
                <div class="focus-toggle__knob"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 外观 -->
        <div v-if="activeTab === 'appearance'">
          <div class="focus-settings__group">
            <div class="focus-settings__group-title">深色模式</div>
            <div style="display:flex; gap:8px;">
              <button
                v-for="mode in darkModes"
                :key="mode.value"
                class="focus-btn"
                :class="s.darkMode === mode.value ? 'focus-btn--primary' : 'focus-btn--secondary'"
                @click="store.updateSettings({ darkMode: mode.value as any })"
              >
                {{ mode.label }}
              </button>
            </div>
          </div>

          <div class="focus-settings__group">
            <div class="focus-settings__group-title">专注壁纸</div>
            <div style="display:grid; grid-template-columns: repeat(3,1fr); gap:12px;">
              <div
                v-for="(theme, i) in themes"
                :key="theme.id"
                style="cursor:pointer; border-radius:8px; overflow:hidden; border:2px solid transparent; transition:0.2s;"
                :style="{ borderColor: s.theme === theme.id ? 'var(--focus-red)' : 'transparent' }"
                @click="store.updateSettings({ theme: theme.id })"
              >
                <div style="height:80px; display:flex; align-items:center; justify-content:center; font-size:32px;"
                  :style="{ background: theme.bg }">
                  {{ theme.icon }}
                </div>
                <div style="text-align:center; font-size:12px; padding:6px; color:var(--focus-text-secondary);">
                  {{ theme.name }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 关于 -->
        <div v-if="activeTab === 'about'">
          <div style="text-align:center; padding:32px 0;">
            <div style="font-size:48px; margin-bottom:16px;">🍅</div>
            <div style="font-size:20px; font-weight:700; margin-bottom:4px;">专注清单</div>
            <div style="font-size:13px; color:var(--focus-text-muted);">Focus To-Do v1.0.0</div>
            <div style="font-size:12px; color:var(--focus-text-muted); margin-top:16px;">
              番茄工作法任务管理工具<br>
              帮助你提升专注力与工作效率
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

const activeTab = ref('general')
const s = computed(() => store.settings.value)

const tabs = [
  { key: 'general', label: '通用' },
  { key: 'pomodoro', label: '番茄钟' },
  { key: 'appearance', label: '外观' },
  { key: 'about', label: '关于' },
]

const darkModes = [
  { value: 'system', label: '跟随系统' },
  { value: 'on', label: '开启' },
  { value: 'off', label: '关闭' },
]

const themes = [
  { id: 'starry', name: '星空', icon: '🌌', bg: 'linear-gradient(135deg, #0a1628, #1a1a3e)' },
  { id: 'mountain', name: '山脉', icon: '🏔️', bg: 'linear-gradient(135deg, #1a4a5e, #0d2137)' },
  { id: 'lake', name: '湖泊', icon: '🏞️', bg: 'linear-gradient(135deg, #1a3a4a, #091a28)' },
  { id: 'forest', name: '森林', icon: '🌲', bg: 'linear-gradient(135deg, #1a3a2a, #0a2818)' },
]

function toggle(key: keyof typeof s.value) {
  store.updateSettings({ [key]: !s.value[key] })
}

function adjustSetting(key: string, delta: number) {
  const current = (s.value as any)[key] as number
  const newVal = Math.max(1, current + delta)
  store.updateSettings({ [key]: newVal })
}
</script>
