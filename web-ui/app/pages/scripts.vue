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
          <div class="card-header">可用脚本</div>
          <div class="script-items">
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
        </section>

        <section class="fluent-card terminal-panel" style="display: flex; flex-direction: column; height: 100%;">
          <div class="card-header">
            <span>{{ selectedScript ? selectedScript.name : '请选择脚本' }}</span>
            <div class="terminal-actions">
              <button class="fluent-btn" @click="runScript" :disabled="!selectedScript || isRunning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                运行
              </button>
              <button class="fluent-btn danger" @click="stopScript" :disabled="!isRunning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                </svg>
                停止
              </button>
              <button class="fluent-btn sub" @click="clearTerminal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
                清空
              </button>
            </div>
          </div>
          <div class="terminal" ref="terminalEl">
            <div v-for="(log, idx) in logs" :key="idx" :class="log.type">{{ log.text }}</div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'

const scripts = ref([])
const selectedScript = ref(null)
const isRunning = ref(false)
const logs = ref([])
const terminalEl = ref(null)
let ws = null

const fetchScripts = async () => {
  try {
    const data = await $fetch('/api/scripts')
    scripts.value = data || []
  } catch (e) {
    console.error('Failed to load scripts', e)
  }
}

const loadScripts = () => {
  fetchScripts()
}

const selectScript = (script) => {
  selectedScript.value = script
}

const appendLog = (type, text) => {
  logs.value.push({ type, text })
  nextTick(() => {
    if (terminalEl.value) {
      terminalEl.value.scrollTop = terminalEl.value.scrollHeight
    }
  })
}

const clearTerminal = () => {
  logs.value = []
}

const runScript = () => {
  if (!selectedScript.value) return

  appendLog('info', '▶ Starting: ' + selectedScript.value.path.split('\\').pop() + '\n')
  isRunning.value = true

  const host = window.location.host
  // Note: Nuxt dev server proxy doesn't proxy WebSockets transparently unless configured.
  // Using direct FastAPI port for WebSockets during dev
  const wsUrl = process.dev ? `ws://127.0.0.1:18432/ws/terminal` : `ws://${host}/ws/terminal`
  
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    ws.send(JSON.stringify({ action: 'run', script: selectedScript.value.path }))
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.type === 'stdout' || data.type === 'stderr') {
      appendLog(data.type, data.data)
    } else if (data.type === 'end') {
      appendLog('info', '\n✓ Process exited with code ' + data.exitCode)
      isRunning.value = false
      if (ws) ws.close()
    }
  }

  ws.onerror = (err) => {
    appendLog('stderr', '\nWebSocket error.')
    isRunning.value = false
  }

  ws.onclose = () => {
    isRunning.value = false
  }
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
  loadScripts()
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
</style>
