<template>
  <div class="page active" style="display: flex;">
    <div class="standard-page-header">
      <h1 class="header-title">Bridge API 测试</h1>
      <div class="header-controls">
        <div class="connection-status" :class="connectionClass">
          <span class="status-dot"></span>
          <span>{{ connectionLabel }}</span>
        </div>
      </div>
    </div>

    <div class="page-content-scroll">
      <!-- Connection Settings -->
      <section class="fluent-card" style="margin-bottom: 16px;">
        <div class="card-header">连接设置</div>
        <div class="card-body" style="display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap;">
          <div class="form-group">
            <label>Host</label>
            <input v-model="bridgeHost" class="fluent-input" placeholder="127.0.0.1" />
          </div>
          <div class="form-group">
            <label>Port</label>
            <input v-model.number="bridgePort" class="fluent-input" type="number" placeholder="18773" />
          </div>
          <button class="fluent-btn" @click="checkHealth" :disabled="loading">
            {{ loading ? '检测中...' : '健康检测' }}
          </button>
        </div>
      </section>

      <!-- API Endpoints -->
      <div class="api-grid">
        <!-- Left: Endpoint List -->
        <section class="fluent-card" style="display: flex; flex-direction: column;">
          <div class="card-header">接口列表</div>
          <div class="endpoint-list">
            <div
              v-for="ep in endpoints"
              :key="ep.name"
              class="list-item"
              :class="{ active: selectedEndpoint?.name === ep.name }"
              @click="selectEndpoint(ep)"
            >
              <span class="method-badge" :class="ep.method.toLowerCase()">{{ ep.method }}</span>
              <span class="ep-name">{{ ep.name }}</span>
            </div>
          </div>
        </section>

        <!-- Right: Request/Response -->
        <section class="fluent-card" style="display: flex; flex-direction: column;">
          <div class="card-header">
            <span v-if="selectedEndpoint">
              <span class="method-badge" :class="selectedEndpoint.method.toLowerCase()">{{ selectedEndpoint.method }}</span>
              {{ selectedEndpoint.path }}
            </span>
            <span v-else>请选择接口</span>
            <div class="terminal-actions">
              <button class="fluent-btn" @click="sendRequest" :disabled="!selectedEndpoint || loading">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
                发送
              </button>
            </div>
          </div>
          <div class="request-response-area">
            <!-- Request Body -->
            <div v-if="selectedEndpoint && selectedEndpoint.method === 'POST'" class="section">
              <div class="section-title">请求参数 (JSON)</div>
              <textarea
                v-model="requestBody"
                class="fluent-textarea code"
                rows="6"
                placeholder='{"target_fps": 60}'
                spellcheck="false"
              ></textarea>
              <div v-if="selectedEndpoint.paramHints" class="param-hints">
                <span v-for="hint in selectedEndpoint.paramHints" :key="hint" class="hint-tag" @click="applyHint(hint)">
                  {{ hint }}
                </span>
              </div>
            </div>

            <!-- Response -->
            <div class="section" style="flex: 1; min-height: 0;">
              <div class="section-title">
                响应
                <span v-if="responseTime" class="response-time">{{ responseTime }}ms</span>
                <span v-if="responseStatus" class="response-status" :class="responseStatusClass">{{ responseStatus }}</span>
                <span v-if="responseSize" class="response-time">{{ responseSize }}</span>
                <template v-if="responseData">
                  <button class="action-btn" @click="copyResponse" title="复制全部">📋</button>
                  <button class="action-btn" @click="downloadResponse" title="下载 JSON">💾</button>
                </template>
              </div>
              <div class="response-area" ref="responseEl">
                <pre v-if="responseData" class="response-json">{{ displayData }}</pre>
                <div v-if="isTruncated" class="truncation-notice">
                  <span>⚠️ 响应过大 ({{ responseSize }})，仅显示前 {{ DISPLAY_LIMIT_LABEL }}。</span>
                  <button class="fluent-btn small" @click="showFullResponse">展开全部 (可能卡顿)</button>
                </div>
                <div v-if="!responseData" class="placeholder">点击"发送"查看结果</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const bridgeHost = ref('127.0.0.1')
const bridgePort = ref(18773)
const loading = ref(false)
const connectionState = ref('unknown') // unknown, connected, disconnected
const selectedEndpoint = ref(null)
const requestBody = ref('')
const responseData = ref('')
const responseTime = ref(null)
const responseStatus = ref('')
const responseEl = ref(null)
const forceShowFull = ref(false)

const DISPLAY_LIMIT = 50000  // chars to display before truncation
const DISPLAY_LIMIT_LABEL = '50KB'

const responseSize = computed(() => {
  if (!responseData.value) return ''
  const len = responseData.value.length
  if (len < 1024) return `${len} B`
  if (len < 1024 * 1024) return `${(len / 1024).toFixed(1)} KB`
  return `${(len / (1024 * 1024)).toFixed(1)} MB`
})

const isTruncated = computed(() => {
  return !forceShowFull.value && responseData.value && responseData.value.length > DISPLAY_LIMIT
})

const displayData = computed(() => {
  if (!responseData.value) return ''
  if (forceShowFull.value || responseData.value.length <= DISPLAY_LIMIT) {
    return responseData.value
  }
  return responseData.value.slice(0, DISPLAY_LIMIT) + '\n\n... (truncated) ...'
})

const showFullResponse = () => {
  forceShowFull.value = true
}

const copyResponse = async () => {
  if (responseData.value) {
    try {
      await navigator.clipboard.writeText(responseData.value)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = responseData.value
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
  }
}

const downloadResponse = () => {
  if (!responseData.value) return
  const blob = new Blob([responseData.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const epName = selectedEndpoint.value?.name?.replace(/\s+/g, '_') || 'response'
  a.download = `bridge_${epName}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// Use server-side proxy to avoid CORS issues.
// Requests go to /api/bridge/v1/xxx?host=...&port=...
// and the Nuxt server forwards them to the Bridge.
const proxyBase = computed(() => `/api/bridge`)
const proxyParams = computed(() => `host=${encodeURIComponent(bridgeHost.value)}&port=${encodeURIComponent(bridgePort.value)}`)


const connectionClass = computed(() => ({
  connected: connectionState.value === 'connected',
  disconnected: connectionState.value === 'disconnected',
  unknown: connectionState.value === 'unknown',
}))

const connectionLabel = computed(() => {
  if (connectionState.value === 'connected') return '已连接'
  if (connectionState.value === 'disconnected') return '未连接'
  return '未检测'
})

const responseStatusClass = computed(() => {
  if (responseStatus.value?.startsWith('2')) return 'success'
  if (responseStatus.value?.startsWith('4') || responseStatus.value?.startsWith('5')) return 'error'
  return ''
})

const endpoints = [
  { name: 'Health', method: 'GET', path: '/v1/health' },
  { name: 'Open Stats', method: 'GET', path: '/v1/open_stats' },
  { name: 'Stats Catalog', method: 'GET', path: '/v1/stats_catalog' },
  {
    name: 'Frame Time Stats', method: 'POST', path: '/v1/frame_time_stats',
    defaultBody: '{"target_fps": 60}',
    paramHints: ['{"target_fps": 30}', '{"target_fps": 60}', '{"target_fps": 120}'],
  },
  {
    name: 'Thread Time Stats', method: 'POST', path: '/v1/thread_time_stats',
    defaultBody: '{"target_fps": 60}',
    paramHints: ['{"target_fps": 30}', '{"target_fps": 60}', '{"target_fps": 120}'],
  },
  {
    name: 'Thread Series', method: 'POST', path: '/v1/thread_series',
    defaultBody: '{"thread_names": ["GameThread", "RenderThread", "RHIThread"]}',
    paramHints: [
      '{}',
      '{"thread_names": ["GameThread"]}',
      '{"thread_names": ["GameThread", "RenderThread", "RHIThread"]}',
    ],
  },
  {
    name: 'Frame Series', method: 'POST', path: '/v1/frame_series',
    defaultBody: '{"frame_start": 0, "frame_end": 100}',
    paramHints: [
      '{}',
      '{"frame_start": 0, "frame_end": 50}',
      '{"frame_start": 100, "frame_end": 200}',
    ],
  },
  {
    name: 'Stat Series', method: 'POST', path: '/v1/stat_series',
    defaultBody: '{"stat_name": "GameThread"}',
    paramHints: [
      '{"stat_id": 0}',
      '{"stat_name": "GameThread"}',
      '{"stat_name": "GameThread", "frame_start": 0, "frame_end": 100}',
    ],
  },
  {
    name: 'Frame All Stats', method: 'POST', path: '/v1/frame_all_stats',
    defaultBody: '{"frame_start": 0, "frame_end": 0}',
    paramHints: [
      '{"frame_start": 0, "frame_end": 0}',
      '{"frame_start": 0, "frame_end": 0, "format": "compact"}',
      '{"frame_start": 0, "frame_end": 0, "format": "tree"}',
      '{"frame_start": 0, "frame_end": 0, "max_depth": 3}',
      '{"frame_start": 0, "frame_end": 0, "min_value": 0.1}',
      '{"frame_start": 0, "frame_end": 2, "max_depth": 2, "min_value": 0.5}',
    ],
  },
]

const selectEndpoint = (ep) => {
  selectedEndpoint.value = ep
  requestBody.value = ep.defaultBody || ''
  responseData.value = ''
  responseTime.value = null
  responseStatus.value = ''
  forceShowFull.value = false
}

const applyHint = (hint) => {
  requestBody.value = hint
}

const doFetch = async (url, method, body) => {
  const opts = {
    method,
    headers: { 'Accept': 'application/json' },
  }
  if (method === 'POST' && body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = body
  }

  const t0 = performance.now()
  const resp = await fetch(url, opts)
  const elapsed = Math.round(performance.now() - t0)
  const text = await resp.text()

  let formatted
  try {
    formatted = JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    formatted = text
  }

  return { status: `${resp.status} ${resp.statusText}`, elapsed, body: formatted }
}

const checkHealth = async () => {
  loading.value = true
  try {
    const result = await doFetch(`${proxyBase.value}/v1/health?${proxyParams.value}`, 'GET')
    connectionState.value = 'connected'
    // Also show result if health endpoint is selected
    if (selectedEndpoint.value?.name === 'Health') {
      responseData.value = result.body
      responseTime.value = result.elapsed
      responseStatus.value = result.status
    }
  } catch (e) {
    connectionState.value = 'disconnected'
  } finally {
    loading.value = false
  }
}

const sendRequest = async () => {
  if (!selectedEndpoint.value) return
  loading.value = true
  responseData.value = ''
  responseTime.value = null
  responseStatus.value = ''
  forceShowFull.value = false

  const ep = selectedEndpoint.value
  const url = `${proxyBase.value}${ep.path}?${proxyParams.value}`

  try {
    const result = await doFetch(url, ep.method, ep.method === 'POST' ? requestBody.value : null)
    responseData.value = result.body
    responseTime.value = result.elapsed
    responseStatus.value = result.status
    connectionState.value = 'connected'
  } catch (e) {
    responseData.value = `Error: ${e.message}`
    responseStatus.value = 'Error'
    connectionState.value = 'disconnected'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.api-grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  height: calc(100vh - 220px);
}

.endpoint-list {
  overflow-y: auto;
  flex: 1;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.15s;
}
.list-item:hover {
  background: var(--bg-hover, rgba(255,255,255,0.06));
}
.list-item.active {
  background: var(--accent-bg, rgba(96,165,250,0.12));
}

.method-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Consolas', 'Courier New', monospace;
  text-transform: uppercase;
  flex-shrink: 0;
}
.method-badge.get {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}
.method-badge.post {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.ep-name {
  font-size: 13px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.form-group label {
  font-size: 12px;
  color: var(--text-secondary, #888);
}

.fluent-input {
  padding: 6px 10px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 6px;
  background: var(--bg-input, rgba(255,255,255,0.05));
  color: var(--text-primary, #e0e0e0);
  font-size: 13px;
  outline: none;
  width: 140px;
}
.fluent-input:focus {
  border-color: var(--accent, #60a5fa);
}

.request-response-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
  min-height: 0;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #888);
  display: flex;
  align-items: center;
  gap: 8px;
}

.fluent-textarea.code {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  padding: 10px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 6px;
  background: var(--bg-input, rgba(255,255,255,0.05));
  color: var(--text-primary, #e0e0e0);
  resize: vertical;
  outline: none;
}
.fluent-textarea.code:focus {
  border-color: var(--accent, #60a5fa);
}

.param-hints {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.hint-tag {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--bg-hover, rgba(255,255,255,0.06));
  color: var(--text-secondary, #aaa);
  cursor: pointer;
  font-family: 'Consolas', 'Courier New', monospace;
  transition: background 0.15s;
}
.hint-tag:hover {
  background: var(--accent-bg, rgba(96,165,250,0.15));
  color: var(--text-primary, #e0e0e0);
}

.response-area {
  flex: 1;
  min-height: 200px;
  max-height: calc(100vh - 500px);
  overflow: auto;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  border-radius: 6px;
  background: var(--bg-code, rgba(0,0,0,0.2));
  padding: 12px;
}

.response-json {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-primary, #e0e0e0);
  margin: 0;
}

.placeholder {
  color: var(--text-secondary, #666);
  font-size: 13px;
  text-align: center;
  padding: 40px;
}

.response-time {
  font-size: 11px;
  color: var(--text-secondary, #888);
  font-family: 'Consolas', monospace;
  padding: 1px 6px;
  background: rgba(255,255,255,0.05);
  border-radius: 4px;
}

.response-status {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: 'Consolas', monospace;
}
.response-status.success {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}
.response-status.error {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
}
.connection-status.connected {
  color: #4ade80;
}
.connection-status.disconnected {
  color: #f87171;
}
.connection-status.unknown {
  color: var(--text-secondary, #888);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.card-body {
  padding: 12px;
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  opacity: 0.7;
  transition: opacity 0.15s;
}
.action-btn:hover {
  opacity: 1;
}

.truncation-notice {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  margin-top: 8px;
  background: rgba(234, 179, 8, 0.08);
  border: 1px solid rgba(234, 179, 8, 0.2);
  border-radius: 6px;
  font-size: 12px;
  color: #eab308;
}

.fluent-btn.small {
  font-size: 11px;
  padding: 3px 10px;
  white-space: nowrap;
}
</style>
