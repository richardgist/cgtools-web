<template>
  <div class="page active" style="display: flex;">
    <div class="standard-page-header">
      <h1 class="header-title">脚本运行器</h1>
      <div class="header-controls">
        <button class="fluent-btn-icon" @click="loadScripts" title="刷新">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>
    </div>

    <div class="page-content-scroll">
      <div class="page-grid">
        <section class="fluent-card script-list-panel" style="display: flex; flex-direction: column; height: 100%;">
          <div class="card-header script-list-header">
            <span>{{ activeMode === 'script' ? '可用脚本' : '最近命令' }}</span>
            <div class="mode-segment">
              <button :class="{ active: activeMode === 'script' }" @click="switchMode('script')">脚本</button>
              <button :class="{ active: activeMode === 'console' }" @click="switchMode('console')">Console</button>
            </div>
          </div>
          <div v-if="activeMode === 'script'" class="script-items">
            <div v-if="scripts.length === 0" style="color: var(--text-secondary); padding: 16px; text-align: center;">暂无脚本</div>
            <div 
              v-else 
              v-for="s in scripts" 
              :key="s.path"
              class="list-item" 
              :class="{ active: selectedScript && selectedScript.path === s.path }"
              @click="selectScript(s)"
            >
              <span>{{ s.icon }}</span>
              <span>{{ s.name }}</span>
            </div>
          </div>
          <div v-else class="script-items">
            <div v-if="consoleHistory.length === 0" class="empty-hint">暂无命令历史</div>
            <button
              v-else
              v-for="item in consoleHistory"
              :key="item.id"
              class="console-history-item"
              @click="selectConsoleHistory(item)"
            >
              <span class="history-command">{{ item.command }}</span>
              <span class="history-meta">{{ item.packageName || 'com.tencent.tmgp.pubgmhd' }}{{ item.deviceSerial ? ` · ${item.deviceSerial}` : '' }}</span>
            </button>
          </div>
        </section>

        <section class="fluent-card terminal-panel" style="display: flex; flex-direction: column; height: 100%;">
          <div class="card-header script-runner-header">
            <div class="script-title-stack">
              <span class="script-title">{{ currentRunnerTitle }}</span>
              <span class="script-save-state" :class="{ dirty: isScriptDirty && activeMode === 'script' }">{{ currentRunnerStatusText }}</span>
            </div>
            <div class="script-command-bar">
              <button class="command-btn command-primary" @click="runCurrent" :disabled="!canRunCurrent" :title="activeMode === 'script' ? '运行脚本' : '运行 Console 命令'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span>运行</span>
              </button>
              <button class="command-btn command-danger" @click="stopScript" :disabled="!isRunning" title="停止脚本">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                </svg>
                <span>停止</span>
              </button>
              <span class="command-divider"></span>
              <button class="command-btn command-ghost" @click="copySelectedTerminalText" :disabled="logs.length === 0" title="复制终端选中文本">
                复制选中
              </button>
              <button class="command-btn command-ghost" @click="copyAllTerminalText" :disabled="logs.length === 0" title="复制全部终端日志">
                复制全部
              </button>
              <button class="command-btn command-ghost icon-text" @click="clearTerminal" title="清空终端">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
                <span>清空</span>
              </button>
            </div>
          </div>
          <div v-if="activeMode === 'script' && selectedScriptParams.length" class="script-param-panel">
            <div v-for="param in selectedScriptParams" :key="param.key" class="script-param-row">
              <label>{{ param.label }}</label>
              <input
                v-model="scriptParamValues[param.key]"
                class="fluent-input script-param-input"
                :placeholder="param.placeholder || ''"
                :disabled="isRunning"
              />
              <button
                v-if="param.type === 'folder'"
                class="fluent-btn sub"
                @click="pickScriptFolder(param.key)"
                :disabled="isRunning || isPickingScriptFolder"
              >
                {{ isPickingScriptFolder ? '打开中...' : '选择文件夹' }}
              </button>
            </div>
            <div class="script-param-hint">参数会按脚本自动保存，下次打开会继续使用最近一次的值。</div>
          </div>
          <div v-if="activeMode === 'console'" class="console-panel">
            <div class="console-row">
              <label>包名</label>
              <input
                v-model="consolePackageName"
                class="fluent-input console-package-input"
                placeholder="Android package name"
                :disabled="isRunning"
              />
              <label>设备</label>
              <input
                v-model="consoleDeviceSerial"
                class="fluent-input console-device-input"
                placeholder="多设备时填写 adb serial"
                :disabled="isRunning"
              />
              <label class="console-checkbox">
                <input v-model="consoleRequireProcess" type="checkbox" :disabled="isRunning" />
                要求进程已启动
              </label>
            </div>
            <textarea
              ref="consoleTextareaEl"
              v-model="consoleCommand"
              class="console-command-input"
              spellcheck="false"
              placeholder="输入要发送到游戏的 UE console command。支持一行一条，或用分号分隔多条命令。"
              :disabled="isRunning"
              @input="updateConsoleCursor"
              @click="updateConsoleCursor"
              @keyup="updateConsoleCursor"
              @keydown="handleConsoleCommandKeydown"
            ></textarea>
            <div v-if="consoleSuggestions.length" class="console-suggestion-popover">
              <button
                v-for="(suggestion, index) in consoleSuggestions"
                :key="suggestion.name"
                class="console-suggestion-item"
                :class="{ active: index === consoleSuggestionIndex }"
                type="button"
                @mousedown.prevent="acceptConsoleSuggestion(suggestion)"
              >
                <span class="suggestion-name">{{ suggestion.name }}</span>
                <span v-if="suggestion.description" class="suggestion-desc">{{ suggestion.description }}</span>
              </button>
            </div>
            <div class="console-sync-row">
              <span class="console-sync-state" :class="{ error: consoleCommandLoadError }">{{ consoleCommandStatusText }}</span>
              <input
                v-model="consoleCommandLocalPath"
                class="fluent-input console-local-path-input"
                placeholder="本地 CVarList.csv 路径"
                :disabled="isSyncingConsoleCommands || isLoadingLocalConsoleCommands"
              />
              <button class="command-btn command-ghost compact" @click="pickConsoleCommandCsv" :disabled="isSyncingConsoleCommands || isLoadingLocalConsoleCommands">
                选择 CSV
              </button>
              <button class="command-btn command-ghost compact" @click="loadConsoleCommands({ notify: true })" :disabled="isSyncingConsoleCommands || isLoadingLocalConsoleCommands">
                {{ isLoadingLocalConsoleCommands ? '读取中' : '读取路径' }}
              </button>
              <button class="command-btn command-save compact" @click="syncConsoleCommands" :disabled="isSyncingConsoleCommands || isLoadingLocalConsoleCommands">
                {{ isSyncingConsoleCommands ? '同步中' : '同步命令' }}
              </button>
            </div>
          </div>
          <div v-if="activeMode === 'script' && selectedScript" class="script-editor-panel">
            <div class="script-editor-head">
              <div class="script-editor-title-group">
                <span class="script-editor-title">脚本内容</span>
                <span class="script-editor-meta">{{ scriptEditorStatusText }}</span>
              </div>
              <div class="script-editor-actions">
                <button class="command-btn command-ghost compact" @click="reloadScriptContent" :disabled="isLoadingScriptContent || isSavingScriptContent || isRunning">
                  重载
                </button>
                <button class="command-btn command-save compact" @click="saveScriptContent" :disabled="!canSaveScriptContent">
                  保存脚本
                </button>
              </div>
            </div>
            <textarea
              v-model="scriptContent"
              class="script-editor"
              spellcheck="false"
              :placeholder="isLoadingScriptContent ? '正在加载脚本...' : '选择脚本后可在这里修改内容'"
              :disabled="isLoadingScriptContent || isSavingScriptContent || isRunning"
            ></textarea>
          </div>
          <div class="terminal" ref="terminalEl">
            <div v-for="(log, idx) in logs" :key="idx" :class="['terminal-line', log.type]">
              <template v-for="(part, partIndex) in formatTerminalLogParts(log.text)" :key="`${idx}-${partIndex}`">
                <button
                  v-if="part.kind === 'local-path'"
                  type="button"
                  class="terminal-path-link"
                  :title="`用默认程序打开：${part.path}`"
                  @click="openLocalPath(part.path)"
                >{{ part.text }}</button>
                <span v-else>{{ part.text }}</span>
              </template>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, nextTick, watch } from 'vue'

const PARAM_STORAGE_KEY = 'cgtools_script_runner_params_v1'
const MODE_STORAGE_KEY = 'cgtools_script_runner_mode_v1'
const CONSOLE_SETTINGS_STORAGE_KEY = 'cgtools_console_runner_settings_v1'
const CONSOLE_HISTORY_STORAGE_KEY = 'cgtools_console_runner_history_v1'
const CONSOLE_LOG_KEY = '__console__'
const DEFAULT_CONSOLE_COMMAND_LOCAL_PATH = 'E:\\CJGame\\trunk\\Survive\\Saved\\Profiling\\CVar\\CVarList.csv'
const scripts = ref([])
const selectedScript = ref(null)
const activeMode = ref('script')
const isRunning = ref(false)
const isPickingScriptFolder = ref(false)
const isLoadingScriptContent = ref(false)
const isSavingScriptContent = ref(false)
const logsByScript = ref({})
const terminalEl = ref(null)
const consoleTextareaEl = ref(null)
const scriptParamValues = ref({})
const scriptParamStore = ref({})
const consolePackageName = ref('com.tencent.tmgp.pubgmhd')
const consoleDeviceSerial = ref('')
const consoleRequireProcess = ref(true)
const consoleCommand = ref('')
const consoleCommandLocalPath = ref(DEFAULT_CONSOLE_COMMAND_LOCAL_PATH)
const consoleHistory = ref([])
const consoleCommands = ref([])
const consoleCommandSourcePath = ref('')
const consoleCommandUpdatedAt = ref(0)
const consoleCommandLoadError = ref('')
const consoleCursorIndex = ref(0)
const consoleSuggestionIndex = ref(0)
const isLoadingLocalConsoleCommands = ref(false)
const isSyncingConsoleCommands = ref(false)
const scriptContent = ref('')
const savedScriptContent = ref('')
const scriptContentLoaded = ref(false)
let ws = null
let scriptContentLoadId = 0

const fetchScripts = async () => {
  try {
    const data = await $fetch('/api/scripts')
    scripts.value = data || []
    if (selectedScript.value) {
      const refreshed = scripts.value.find((script) => script.path === selectedScript.value.path)
      if (refreshed) {
        selectedScript.value = refreshed
        applySavedScriptParams(refreshed)
      }
    }
  } catch (e) {
    console.error('Failed to load scripts', e)
  }
}

const loadScripts = () => {
  fetchScripts()
}

const selectScript = (script) => {
  if (selectedScript.value?.path !== script.path && isScriptDirty.value) {
    const shouldSwitch = window.confirm('当前脚本有未保存修改，切换后会丢失这些修改。继续切换吗？')
    if (!shouldSwitch) return
  }

  activeMode.value = 'script'
  localStorage.setItem(MODE_STORAGE_KEY, activeMode.value)
  selectedScript.value = script
  applySavedScriptParams(script)
  loadScriptContent(script)
}

const switchMode = (mode) => {
  if (mode === activeMode.value) return
  if (activeMode.value === 'script' && isScriptDirty.value) {
    const shouldSwitch = window.confirm('当前脚本有未保存修改，切换后会丢失这些修改。继续切换吗？')
    if (!shouldSwitch) return
  }

  activeMode.value = mode
  localStorage.setItem(MODE_STORAGE_KEY, mode)
}

const selectedScriptParams = computed(() => selectedScript.value?.params || [])
const isScriptDirty = computed(() => scriptContentLoaded.value && scriptContent.value !== savedScriptContent.value)
const canSaveScriptContent = computed(() => Boolean(
  selectedScript.value
  && scriptContentLoaded.value
  && isScriptDirty.value
  && !isSavingScriptContent.value
  && !isLoadingScriptContent.value
  && !isRunning.value
))
const scriptStatusText = computed(() => {
  if (isLoadingScriptContent.value) return '读取中'
  if (isSavingScriptContent.value) return '保存中'
  if (!scriptContentLoaded.value) return '未加载'
  return isScriptDirty.value ? '有未保存修改' : '已保存'
})
const scriptEditorStatusText = computed(() => {
  if (isLoadingScriptContent.value) return '正在读取文件内容'
  if (isSavingScriptContent.value) return '正在写入文件'
  if (!scriptContentLoaded.value) return '脚本内容尚未加载'
  return isScriptDirty.value ? '修改后请先保存再运行' : '已同步到磁盘文件'
})
const currentRunnerTitle = computed(() => {
  if (activeMode.value === 'console') return 'Console 命令'
  return selectedScript.value ? selectedScript.value.name : '请选择脚本'
})
const currentRunnerStatusText = computed(() => {
  if (activeMode.value === 'console') {
    return '通过 adb broadcast 发送到游戏'
  }
  return selectedScript.value ? scriptStatusText.value : '未选择'
})
const canRunCurrent = computed(() => {
  if (isRunning.value) return false
  if (activeMode.value === 'console') return Boolean(consoleCommand.value.trim())
  return Boolean(selectedScript.value && !isScriptDirty.value)
})
const currentConsolePrefix = computed(() => {
  const beforeCursor = consoleCommand.value.slice(0, consoleCursorIndex.value)
  const segment = beforeCursor.split(/[;\r\n]/).pop() || ''
  return segment.trimStart()
})
const consoleSuggestions = computed(() => {
  const prefix = currentConsolePrefix.value.toLowerCase()
  if (!prefix) return []

  const startsWith = []
  const contains = []
  for (const command of consoleCommands.value) {
    const name = command.name.toLowerCase()
    if (name.startsWith(prefix)) {
      startsWith.push(command)
    } else if (name.includes(prefix)) {
      contains.push(command)
    }
  }

  return [...startsWith, ...contains].slice(0, 16)
})
const consoleCommandStatusText = computed(() => {
  if (isLoadingLocalConsoleCommands.value) return '正在读取本地命令库...'
  if (isSyncingConsoleCommands.value) return '正在从设备同步最新命令...'
  if (consoleCommandLoadError.value) return consoleCommandLoadError.value
  if (!consoleCommands.value.length) return '尚未加载命令库，可读取本地路径或同步命令'

  const timeText = consoleCommandUpdatedAt.value
    ? new Date(consoleCommandUpdatedAt.value).toLocaleString()
    : '未知时间'
  const sourceName = consoleCommandSourcePath.value ? consoleCommandSourcePath.value.split(/[\\/]/).pop() : '未知来源'
  return `${consoleCommands.value.length} 条命令 · ${sourceName} · ${timeText}`
})
const currentScriptLogKey = computed(() => activeMode.value === 'console' ? CONSOLE_LOG_KEY : selectedScript.value?.path || '')
const logs = computed(() => {
  const key = currentScriptLogKey.value
  return key ? (logsByScript.value[key] || []) : []
})

const WINDOWS_LOCAL_PATH_RE = /[A-Za-z]:\\[^\r\n<>"|?*]+/g

const trimLocalPathMatch = (rawPath) => {
  let text = rawPath.trimEnd()
  while (/[.,;:]+$/.test(text)) {
    text = text.slice(0, -1)
  }
  return text
}

const formatTerminalLogParts = (text) => {
  const parts = []
  let lastIndex = 0

  for (const match of text.matchAll(WINDOWS_LOCAL_PATH_RE)) {
    const rawPath = match[0]
    const pathText = trimLocalPathMatch(rawPath)
    const start = match.index ?? 0
    const end = start + pathText.length

    if (!pathText || end <= lastIndex) continue
    if (start > lastIndex) {
      parts.push({ kind: 'text', text: text.slice(lastIndex, start) })
    }

    parts.push({ kind: 'local-path', text: pathText, path: pathText })
    lastIndex = end
  }

  if (lastIndex < text.length) {
    parts.push({ kind: 'text', text: text.slice(lastIndex) })
  }

  return parts.length ? parts : [{ kind: 'text', text }]
}

const getScriptParamKey = (script) => script?.name || script?.path || ''

const getDefaultScriptParams = (script) => {
  const defaults = {}
  for (const param of script?.params || []) {
    defaults[param.key] = param.defaultValue || ''
  }
  return defaults
}

const loadParamStore = () => {
  try {
    const raw = localStorage.getItem(PARAM_STORAGE_KEY)
    scriptParamStore.value = raw ? JSON.parse(raw) : {}
  } catch {
    scriptParamStore.value = {}
  }
}

const loadConsoleState = () => {
  try {
    const savedMode = localStorage.getItem(MODE_STORAGE_KEY)
    if (savedMode === 'console' || savedMode === 'script') {
      activeMode.value = savedMode
    }

    const rawSettings = localStorage.getItem(CONSOLE_SETTINGS_STORAGE_KEY)
    const settings = rawSettings ? JSON.parse(rawSettings) : {}
    consolePackageName.value = typeof settings.packageName === 'string' && settings.packageName.trim()
      ? settings.packageName
      : 'com.tencent.tmgp.pubgmhd'
    consoleDeviceSerial.value = typeof settings.deviceSerial === 'string' ? settings.deviceSerial : ''
    consoleRequireProcess.value = typeof settings.requireProcess === 'boolean' ? settings.requireProcess : true
    consoleCommand.value = typeof settings.command === 'string' ? settings.command : ''
    consoleCommandLocalPath.value = typeof settings.commandLocalPath === 'string' && settings.commandLocalPath.trim()
      ? settings.commandLocalPath
      : DEFAULT_CONSOLE_COMMAND_LOCAL_PATH

    const rawHistory = localStorage.getItem(CONSOLE_HISTORY_STORAGE_KEY)
    const history = rawHistory ? JSON.parse(rawHistory) : []
    consoleHistory.value = Array.isArray(history) ? history.slice(0, 12) : []
  } catch {
    activeMode.value = 'script'
    consolePackageName.value = 'com.tencent.tmgp.pubgmhd'
    consoleDeviceSerial.value = ''
    consoleRequireProcess.value = true
    consoleCommand.value = ''
    consoleCommandLocalPath.value = DEFAULT_CONSOLE_COMMAND_LOCAL_PATH
    consoleHistory.value = []
  }
}

const persistConsoleSettings = () => {
  localStorage.setItem(CONSOLE_SETTINGS_STORAGE_KEY, JSON.stringify({
    packageName: consolePackageName.value,
    deviceSerial: consoleDeviceSerial.value,
    requireProcess: consoleRequireProcess.value,
    command: consoleCommand.value,
    commandLocalPath: consoleCommandLocalPath.value,
  }))
}

const persistConsoleHistory = () => {
  localStorage.setItem(CONSOLE_HISTORY_STORAGE_KEY, JSON.stringify(consoleHistory.value))
}

const persistSelectedScriptParams = () => {
  if (!selectedScript.value) return
  const key = getScriptParamKey(selectedScript.value)
  if (!key) return

  scriptParamStore.value = {
    ...scriptParamStore.value,
    [key]: { ...scriptParamValues.value },
  }
  localStorage.setItem(PARAM_STORAGE_KEY, JSON.stringify(scriptParamStore.value))
}

const applySavedScriptParams = (script) => {
  const key = getScriptParamKey(script)
  const saved = key ? scriptParamStore.value[key] || {} : {}
  scriptParamValues.value = {
    ...getDefaultScriptParams(script),
    ...saved,
  }
}

const rememberConsoleCommand = () => {
  const command = consoleCommand.value.trim()
  if (!command) return

  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    command,
    packageName: consolePackageName.value.trim() || 'com.tencent.tmgp.pubgmhd',
    deviceSerial: consoleDeviceSerial.value.trim(),
    requireProcess: consoleRequireProcess.value,
  }
  const deduped = consoleHistory.value.filter((entry) => (
    entry.command !== item.command
      || entry.packageName !== item.packageName
      || entry.deviceSerial !== item.deviceSerial
      || entry.requireProcess !== item.requireProcess
  ))
  consoleHistory.value = [item, ...deduped].slice(0, 12)
  persistConsoleHistory()
}

const selectConsoleHistory = (item) => {
  consoleCommand.value = item.command || ''
  consolePackageName.value = item.packageName || 'com.tencent.tmgp.pubgmhd'
  consoleDeviceSerial.value = item.deviceSerial || ''
  consoleRequireProcess.value = typeof item.requireProcess === 'boolean' ? item.requireProcess : true
  persistConsoleSettings()
  nextTick(() => {
    if (!consoleTextareaEl.value) return
    const cursor = consoleCommand.value.length
    consoleTextareaEl.value.focus()
    consoleTextareaEl.value.setSelectionRange(cursor, cursor)
    updateConsoleCursor()
  })
}

const getErrorMessage = (error, fallback) => {
  return error?.data?.statusMessage || error?.statusMessage || error?.message || fallback
}

const applyConsoleCommandSnapshot = (snapshot) => {
  consoleCommands.value = Array.isArray(snapshot.commands) ? snapshot.commands : []
  consoleCommandSourcePath.value = snapshot.sourcePath || ''
  consoleCommandUpdatedAt.value = Number(snapshot.updatedAt || 0)
  consoleCommandLoadError.value = ''
  consoleSuggestionIndex.value = 0
}

const loadConsoleCommands = async (options = {}) => {
  if (isLoadingLocalConsoleCommands.value) return

  const shouldNotify = options.notify === true
  isLoadingLocalConsoleCommands.value = true
  consoleCommandLoadError.value = ''
  const localPath = consoleCommandLocalPath.value.trim()

  if (shouldNotify) {
    appendLog('info', `[info] 正在读取本地 UE Console 命令库：${localPath || '默认 scripts/Logs 最新 CSV'}\n`, CONSOLE_LOG_KEY)
  }

  try {
    const snapshot = await $fetch('/api/scripts/console-commands', {
      query: localPath ? { path: localPath } : {},
    })
    applyConsoleCommandSnapshot(snapshot)
    if (shouldNotify) {
      appendLog(
        'info',
        `[info] 已读取 ${consoleCommands.value.length} 条 UE Console 命令：${consoleCommandSourcePath.value || '无本地命令库文件'}\n`,
        CONSOLE_LOG_KEY,
      )
    }
  } catch (error) {
    const message = getErrorMessage(error, '未知错误')
    consoleCommandLoadError.value = `读取命令库失败：${message}`
    if (shouldNotify) {
      appendLog('stderr', `[error] 读取命令库失败：${message}\n`, CONSOLE_LOG_KEY)
    }
  } finally {
    isLoadingLocalConsoleCommands.value = false
  }
}

const pickConsoleCommandCsv = async () => {
  try {
    const res = await $fetch('/api/system/file', {
      query: {
        mode: 'open',
        filter: 'csv',
      },
    })

    if (res.success && res.path) {
      consoleCommandLocalPath.value = res.path
      persistConsoleSettings()
      await loadConsoleCommands({ notify: true })
      return
    }

    consoleCommandLoadError.value = res.error || '未选择 CSV 文件'
  } catch (error) {
    consoleCommandLoadError.value = `选择 CSV 失败：${getErrorMessage(error, '未知错误')}`
  }
}

const syncConsoleCommands = async () => {
  if (isSyncingConsoleCommands.value) return

  isSyncingConsoleCommands.value = true
  consoleCommandLoadError.value = ''
  appendLog('info', '[info] 正在从设备同步 UE Console 命令库...\n', CONSOLE_LOG_KEY)

  try {
    const snapshot = await $fetch('/api/scripts/console-commands/sync', {
      method: 'POST',
      body: {
        packageName: consolePackageName.value.trim() || 'com.tencent.tmgp.pubgmhd',
        deviceSerial: consoleDeviceSerial.value.trim(),
      },
    })
    applyConsoleCommandSnapshot(snapshot)
    appendLog('info', `[info] 已同步 ${consoleCommands.value.length} 条命令。\n`, CONSOLE_LOG_KEY)
  } catch (error) {
    const message = getErrorMessage(error, '未知错误')
    consoleCommandLoadError.value = `同步命令失败：${message}`
    appendLog('stderr', `[error] 同步命令失败：${message}\n`, CONSOLE_LOG_KEY)
  } finally {
    isSyncingConsoleCommands.value = false
  }
}

const updateConsoleCursor = () => {
  consoleCursorIndex.value = consoleTextareaEl.value?.selectionStart ?? consoleCommand.value.length
  if (consoleSuggestionIndex.value >= consoleSuggestions.value.length) {
    consoleSuggestionIndex.value = 0
  }
}

const acceptConsoleSuggestion = (suggestion = consoleSuggestions.value[consoleSuggestionIndex.value]) => {
  if (!suggestion || !consoleTextareaEl.value) return

  const cursor = consoleTextareaEl.value.selectionStart ?? consoleCommand.value.length
  const beforeCursor = consoleCommand.value.slice(0, cursor)
  const afterCursor = consoleCommand.value.slice(cursor)
  const separators = [';', '\n', '\r']
  const lastSeparatorIndex = Math.max(...separators.map((separator) => beforeCursor.lastIndexOf(separator)))
  let replaceStart = lastSeparatorIndex + 1
  while (replaceStart < beforeCursor.length && /\s/.test(beforeCursor[replaceStart])) {
    replaceStart += 1
  }

  const nextValue = `${consoleCommand.value.slice(0, replaceStart)}${suggestion.name}${afterCursor}`
  const nextCursor = replaceStart + suggestion.name.length
  consoleCommand.value = nextValue
  consoleSuggestionIndex.value = 0

  nextTick(() => {
    consoleTextareaEl.value.focus()
    consoleTextareaEl.value.setSelectionRange(nextCursor, nextCursor)
    updateConsoleCursor()
  })
}

const handleConsoleCommandKeydown = (event) => {
  if (event.ctrlKey && event.key === 'Enter') {
    event.preventDefault()
    runCurrent()
    return
  }

  if (!consoleSuggestions.value.length) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    consoleSuggestionIndex.value = (consoleSuggestionIndex.value + 1) % consoleSuggestions.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    consoleSuggestionIndex.value = (consoleSuggestionIndex.value - 1 + consoleSuggestions.value.length) % consoleSuggestions.value.length
  } else if (event.key === 'Tab' || event.key === 'Enter') {
    event.preventDefault()
    acceptConsoleSuggestion()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    consoleSuggestionIndex.value = 0
    consoleCursorIndex.value = 0
  }
}

const resetScriptContent = () => {
  scriptContent.value = ''
  savedScriptContent.value = ''
  scriptContentLoaded.value = false
}

const loadScriptContent = async (script = selectedScript.value) => {
  if (!script) {
    resetScriptContent()
    return
  }

  const loadId = ++scriptContentLoadId
  isLoadingScriptContent.value = true
  resetScriptContent()

  try {
    const res = await $fetch('/api/scripts/content', { query: { path: script.path } })
    if (loadId !== scriptContentLoadId) return

    const content = typeof res.content === 'string' ? res.content : ''
    scriptContent.value = content
    savedScriptContent.value = content
    scriptContentLoaded.value = true
  } catch (error) {
    if (loadId === scriptContentLoadId) {
      appendLog('stderr', `[error] 读取脚本失败：${getErrorMessage(error, '未知错误')}\n`)
    }
  } finally {
    if (loadId === scriptContentLoadId) {
      isLoadingScriptContent.value = false
    }
  }
}

const reloadScriptContent = async () => {
  if (!selectedScript.value) return
  if (isScriptDirty.value) {
    const shouldReload = window.confirm('当前脚本有未保存修改，重载后会丢失这些修改。继续重载吗？')
    if (!shouldReload) return
  }

  await loadScriptContent(selectedScript.value)
}

const saveScriptContent = async () => {
  if (!selectedScript.value || !canSaveScriptContent.value) return

  isSavingScriptContent.value = true
  try {
    await $fetch('/api/scripts/content', {
      method: 'POST',
      body: {
        path: selectedScript.value.path,
        content: scriptContent.value,
      },
    })
    savedScriptContent.value = scriptContent.value
    scriptContentLoaded.value = true
    appendLog('info', `[info] 已保存脚本：${selectedScript.value.name}\n`)
  } catch (error) {
    appendLog('stderr', `[error] 保存脚本失败：${getErrorMessage(error, '未知错误')}\n`)
  } finally {
    isSavingScriptContent.value = false
  }
}

const buildScriptArgs = () => {
  const args = []

  for (const param of selectedScriptParams.value) {
    const rawValue = scriptParamValues.value[param.key]
    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue

    if (param.required && !value) {
      appendLog('stderr', `[error] 缺少必填参数：${param.label}\n`)
      return null
    }

    if (!value) continue

    if (param.type === 'switch') {
      if (value && param.argName) {
        args.push(param.argName)
      }
      continue
    }

    if (param.argName) {
      args.push(param.argName, String(value))
    } else {
      args.push(String(value))
    }
  }

  return args
}

const pickFolder = async () => {
  if (isPickingScriptFolder.value) return
  isPickingScriptFolder.value = true
  appendLog('info', '[info] 正在打开文件夹选择器...\n')

  try {
    const res = await $fetch('/api/system/folder')
    if (res.success && res.path) {
      appendLog('info', `[info] 已选择文件夹：${res.path}\n`)
      return res.path
    }

    appendLog('stderr', `[warning] ${res.error || '选择文件夹失败'}\n`)
  } catch (error) {
    appendLog('stderr', `[error] 选择文件夹失败：${error.message}\n`)
  } finally {
    isPickingScriptFolder.value = false
  }
}

const pickScriptFolder = async (key) => {
  const path = await pickFolder()
  if (!path) return

  scriptParamValues.value = {
    ...scriptParamValues.value,
    [key]: path,
  }
  persistSelectedScriptParams()
}

const appendLog = (type, text, scriptPath = currentScriptLogKey.value) => {
  if (!scriptPath) return

  const scriptLogs = logsByScript.value[scriptPath] || []
  logsByScript.value = {
    ...logsByScript.value,
    [scriptPath]: [...scriptLogs, { type, text }],
  }

  nextTick(() => {
    if (terminalEl.value && scriptPath === currentScriptLogKey.value) {
      terminalEl.value.scrollTop = terminalEl.value.scrollHeight
    }
  })
}

const clearTerminal = () => {
  const key = currentScriptLogKey.value
  if (!key) return

  logsByScript.value = {
    ...logsByScript.value,
    [key]: [],
  }
}

const copyText = async (text) => {
  if (!text) return false

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  }
}

const getSelectedTerminalText = () => {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !terminalEl.value || selection.rangeCount === 0) {
    return ''
  }

  const range = selection.getRangeAt(0)
  const ancestor = range.commonAncestorContainer
  const selectedNode = ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : ancestor.parentNode
  if (!selectedNode || !terminalEl.value.contains(selectedNode)) {
    return ''
  }

  return selection.toString()
}

const copySelectedTerminalText = async () => {
  const selectedText = getSelectedTerminalText()
  if (!selectedText.trim()) {
    appendLog('stderr', '[warning] 请先在终端里选中要复制的文本。\n')
    return
  }

  const copied = await copyText(selectedText)
  appendLog(copied ? 'info' : 'stderr', copied ? '[info] 已复制选中文本。\n' : '[error] 复制选中文本失败。\n')
}

const copyAllTerminalText = async () => {
  const allText = logs.value.map((log) => log.text).join('')
  const copied = await copyText(allText)
  appendLog(copied ? 'info' : 'stderr', copied ? '[info] 已复制全部日志。\n' : '[error] 复制全部日志失败。\n')
}

const openLocalPath = async (path) => {
  try {
    const res = await $fetch('/api/system/open', {
      method: 'POST',
      body: { path },
    })
    if (!res?.success) {
      appendLog('stderr', `[error] 打开本地路径失败：${res?.error || path}\n`)
    }
  } catch (error) {
    appendLog('stderr', `[error] 打开本地路径失败：${getErrorMessage(error, '未知错误')}\n`)
  }
}

const startTerminalRun = (runLogKey, startLine, payload) => {
  appendLog('info', startLine, runLogKey)
  isRunning.value = true

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProtocol}//${window.location.host}/ws/terminal`
  
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    ws.send(JSON.stringify(payload))
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.type === 'stdout' || data.type === 'stderr') {
      appendLog(data.type, data.data, runLogKey)
    } else if (data.type === 'error') {
      appendLog('stderr', `\n${data.data}`, runLogKey)
    } else if (data.type === 'end') {
      appendLog('info', '\n✓ Process exited with code ' + data.exitCode, runLogKey)
      isRunning.value = false
      if (ws) ws.close()
    }
  }

  ws.onerror = () => {
    appendLog('stderr', `\nWebSocket error: ${wsUrl}`, runLogKey)
    isRunning.value = false
  }

  ws.onclose = () => {
    isRunning.value = false
  }
}

const runScript = () => {
  if (!selectedScript.value) return
  const runScriptPath = selectedScript.value.path
  const runScriptName = selectedScript.value.path.split(/[\\/]/).pop()

  if (isScriptDirty.value) {
    appendLog('stderr', '[warning] 脚本有未保存修改，请先保存后再运行。\n', runScriptPath)
    return
  }

  const args = buildScriptArgs()
  if (!args) return

  persistSelectedScriptParams()
  startTerminalRun(runScriptPath, '▶ Starting: ' + runScriptName + '\n', {
    action: 'run',
    script: runScriptPath,
    args,
  })
}

const runConsoleCommand = () => {
  const command = consoleCommand.value.trim()
  if (!command) {
    appendLog('stderr', '[error] 请输入要执行的 Console 命令。\n', CONSOLE_LOG_KEY)
    return
  }

  persistConsoleSettings()
  rememberConsoleCommand()
  const packageName = consolePackageName.value.trim() || 'com.tencent.tmgp.pubgmhd'
  const deviceText = consoleDeviceSerial.value.trim() || '默认设备'
  startTerminalRun(CONSOLE_LOG_KEY, `▶ UE Console: ${command}\n[pkg] ${packageName}\n[device] ${deviceText}\n`, {
    action: 'run',
    mode: 'ue-console',
    command,
    packageName,
    deviceSerial: consoleDeviceSerial.value.trim(),
    requireProcess: consoleRequireProcess.value,
  })
}

const runCurrent = () => {
  if (activeMode.value === 'console') {
    runConsoleCommand()
    return
  }

  runScript()
}

const stopScript = async () => {
  if (ws) {
    ws.send(JSON.stringify({ action: 'terminate' }))
  }
  try {
    await $fetch('/api/scripts/terminate', { method: 'POST' })
  } catch(e) {}
  
  isRunning.value = false
}

onMounted(() => {
  loadParamStore()
  loadConsoleState()
  loadConsoleCommands()
  loadScripts()
})

watch(scriptParamValues, () => {
  persistSelectedScriptParams()
}, { deep: true })

watch([consolePackageName, consoleDeviceSerial, consoleRequireProcess, consoleCommand, consoleCommandLocalPath], () => {
  persistConsoleSettings()
})
</script>

<style scoped>
/* Page-specific overrides for scripts if needed */
.page-grid {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 24px;
  height: calc(100vh - 150px);
}

.script-list-header {
  gap: 12px;
}

.mode-segment {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
}

.mode-segment button {
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  color: var(--text-secondary);
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.mode-segment button.active {
  color: #071318;
  background: var(--accent-default);
}

.empty-hint {
  color: var(--text-secondary);
  padding: 16px;
  text-align: center;
}

.console-history-item {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.console-history-item:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.04);
}

.history-command,
.history-meta {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-command {
  color: inherit;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
}

.history-meta {
  color: var(--text-tertiary);
  font-size: 11px;
}

.script-param-panel {
  padding: 14px 16px;
  border-bottom: 1px solid var(--divider);
  background: rgba(255, 255, 255, 0.015);
}

.script-param-row {
  display: grid;
  grid-template-columns: 120px minmax(260px, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.script-param-row label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.script-param-input {
  width: 100%;
  min-width: 0;
}

.script-param-hint {
  margin-top: 8px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.terminal-panel {
  overflow: hidden;
}

.script-runner-header {
  align-items: center;
  gap: 16px;
  min-height: 56px;
}

.script-title-stack {
  display: flex;
  flex: 1;
  min-width: 180px;
  flex-direction: column;
  gap: 4px;
}

.script-title {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.script-save-state {
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 600;
}

.script-save-state.dirty {
  color: #fbbf24;
}

.script-command-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  overflow-x: auto;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.18);
}

.command-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 32px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.command-btn svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.command-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.command-btn:active:not(:disabled) {
  transform: translateY(0);
}

.command-btn:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.command-primary {
  min-width: 78px;
  border-color: rgba(96, 205, 255, 0.32);
  color: #071318;
  background: linear-gradient(180deg, #77d9ff 0%, #4bbdea 100%);
  box-shadow: 0 8px 20px rgba(75, 189, 234, 0.22);
}

.command-primary:hover:not(:disabled) {
  border-color: rgba(154, 230, 255, 0.74);
  background: linear-gradient(180deg, #92e4ff 0%, #5cc7f0 100%);
}

.command-danger {
  min-width: 74px;
  border-color: rgba(255, 153, 164, 0.2);
  color: #ffb4bd;
  background: rgba(255, 153, 164, 0.1);
}

.command-danger:hover:not(:disabled) {
  background: rgba(255, 153, 164, 0.17);
}

.command-ghost {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.035);
}

.command-ghost:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.075);
}

.command-save {
  border-color: rgba(108, 203, 95, 0.3);
  color: #d8ffd2;
  background: rgba(108, 203, 95, 0.12);
}

.command-save:hover:not(:disabled) {
  background: rgba(108, 203, 95, 0.18);
}

.command-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.command-btn.compact {
  height: 28px;
  padding: 0 11px;
}

.icon-text {
  padding-left: 10px;
}

.console-panel {
  position: relative;
  display: flex;
  flex: 0 0 30%;
  min-height: 180px;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid var(--divider);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.018), rgba(255, 255, 255, 0.006));
}

.console-row {
  display: grid;
  grid-template-columns: auto minmax(260px, 1fr) auto minmax(220px, 0.8fr) auto;
  gap: 10px;
  align-items: center;
}

.console-row label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.console-package-input,
.console-device-input {
  min-width: 0;
  width: 100%;
}

.console-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.console-checkbox input {
  width: 15px;
  height: 15px;
  accent-color: var(--accent-default);
}

.console-command-input {
  flex: 1;
  min-height: 108px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  outline: none;
  resize: vertical;
  color: #e8e8e8;
  background: #101010;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
  tab-size: 2;
}

.console-command-input:focus {
  border-color: rgba(96, 205, 255, 0.55);
  box-shadow: 0 0 0 1px rgba(96, 205, 255, 0.28);
}

.console-suggestion-popover {
  position: absolute;
  left: 14px;
  right: 14px;
  top: 106px;
  z-index: 10;
  display: flex;
  max-height: 260px;
  flex-direction: column;
  overflow-y: auto;
  border: 1px solid rgba(96, 205, 255, 0.25);
  border-radius: 8px;
  background: rgba(18, 18, 18, 0.98);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.42);
}

.console-suggestion-item {
  display: grid;
  grid-template-columns: minmax(220px, 0.38fr) minmax(260px, 1fr);
  gap: 12px;
  align-items: center;
  padding: 7px 10px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.045);
  color: var(--text-secondary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.console-suggestion-item:last-child {
  border-bottom: 0;
}

.console-suggestion-item.active,
.console-suggestion-item:hover {
  color: #071318;
  background: var(--accent-default);
}

.suggestion-name {
  overflow: hidden;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggestion-desc {
  overflow: hidden;
  color: inherit;
  font-size: 12px;
  opacity: 0.82;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console-sync-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.console-sync-state {
  flex: 0 1 260px;
  min-width: 0;
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console-sync-state.error {
  color: #ffb4bd;
}

.console-local-path-input {
  flex: 1 1 360px;
  min-width: 220px;
}

.script-editor-panel {
  display: flex;
  flex: 0 0 34%;
  min-height: 210px;
  flex-direction: column;
  border-bottom: 1px solid var(--divider);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.018), rgba(255, 255, 255, 0.006));
}

.script-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
}

.script-editor-title-group {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.script-editor-title {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
}

.script-editor-meta {
  color: var(--text-tertiary);
  font-size: 11px;
}

.script-editor-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.script-editor {
  flex: 1;
  width: 100%;
  min-height: 150px;
  padding: 12px 14px;
  border: 0;
  outline: none;
  resize: vertical;
  color: #e8e8e8;
  background: #101010;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
  tab-size: 2;
}

.script-editor:focus {
  box-shadow: inset 0 0 0 1px rgba(96, 205, 255, 0.35);
}

@media (max-width: 900px) {
  .script-param-row,
  .console-row {
    grid-template-columns: 1fr;
  }

  .script-runner-header,
  .script-editor-head {
    align-items: stretch;
    flex-direction: column;
  }

  .script-command-bar,
  .script-editor-actions {
    width: 100%;
  }
}

.terminal {
  flex: 1;
  min-height: 140px;
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}

.terminal :deep(*) {
  user-select: text;
  -webkit-user-select: text;
  white-space: pre-wrap;
}

.terminal-line {
  white-space: pre-wrap;
}

.terminal-path-link {
  display: inline;
  padding: 0 2px;
  border: 0;
  border-radius: 3px;
  color: var(--accent-default);
  background: rgba(96, 205, 255, 0.12);
  font: inherit;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.terminal-path-link:hover {
  color: #071318;
  background: var(--accent-default);
}
</style>
