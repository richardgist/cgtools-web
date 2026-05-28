<template>
  <div class="page active" style="display: flex;">
    <div class="standard-page-header">
      <h1 class="header-title">Runtime Actor Inspector</h1>
      <div class="header-controls">
        <div class="connection-status" :class="connectionClass">
          <span class="status-dot"></span>
          <span>{{ connectionLabel }}</span>
        </div>
      </div>
    </div>

    <div class="page-content-scroll inspector-page">
      <section class="fluent-card premium-connection-card">
        <div class="card-header">
          <span>📶 设备连接</span>
          <span class="active-connection-pill" :class="connectionClass">
            <span class="pulse-dot"></span>
            {{ connectionLabel }}
          </span>
        </div>
        <div class="card-body inspector-connection-grid">
          <div class="form-group">
            <label>Host</label>
            <input v-model="host" class="fluent-input" placeholder="127.0.0.1" />
          </div>
          <div class="form-group">
            <label>Port</label>
            <input v-model.number="port" class="fluent-input" type="number" />
          </div>
          <div class="form-group command-field">
            <label>ADB Forward</label>
            <div class="copy-line interactive-copy-line">
              <code>adb forward tcp:{{ port }} tcp:{{ port }}</code>
              <button class="fluent-btn sub copy-btn" :class="{ copied: copiedStates['adb'] }" @click="copyAdbCommand">
                {{ copiedStates['adb'] ? '✔ 已复制' : '📋 复制' }}
              </button>
            </div>
          </div>
          <div class="inspector-actions">
            <button class="fluent-btn primary" :disabled="loading" @click="sendPing">Ping</button>
            <button class="fluent-btn" :disabled="loading" @click="getCapabilities">Capabilities</button>
          </div>
        </div>
      </section>

      <div class="inspector-workbench">
        <aside class="inspector-panel control-panel">
          <div class="panel-title">Pick</div>
          <div class="inspector-form">
            <div class="form-row coordinate-form-row">
              <div class="form-group coord-group">
                <label>X 坐标</label>
                <div class="coord-input-wrapper">
                  <input v-model.number="screenX" class="fluent-input coord-input" type="number" />
                  <div class="coord-adjusters-row">
                    <button class="adjust-btn-micro" @click="adjustX(-100)" title="X轴 -100">-100</button>
                    <button class="adjust-btn-micro" @click="adjustX(-10)" title="X轴 -10">-10</button>
                    <button class="adjust-btn-micro" @click="adjustX(10)" title="X轴 +10">+10</button>
                    <button class="adjust-btn-micro" @click="adjustX(100)" title="X轴 +100">+100</button>
                  </div>
                </div>
              </div>
              <div class="form-group coord-group">
                <label>Y 坐标</label>
                <div class="coord-input-wrapper">
                  <input v-model.number="screenY" class="fluent-input coord-input" type="number" />
                  <div class="coord-adjusters-row">
                    <button class="adjust-btn-micro" @click="adjustY(-100)" title="Y轴 -100">-100</button>
                    <button class="adjust-btn-micro" @click="adjustY(-10)" title="Y轴 -10">-10</button>
                    <button class="adjust-btn-micro" @click="adjustY(10)" title="Y轴 +10">+10</button>
                    <button class="adjust-btn-micro" @click="adjustY(100)" title="Y轴 +100">+100</button>
                  </div>
                </div>
              </div>
            </div>
            <button class="fluent-btn sub compact reset-center-btn" @click="resetCoordinates" title="重置屏幕拾取点至中心">
              🎯 居中点选 (960, 540)
            </button>

            <div class="form-group">
              <label>Trace Channel</label>
              <select v-model="traceChannel" class="fluent-select">
                <option>Visibility</option>
                <option>Camera</option>
                <option>WorldStatic</option>
                <option>WorldDynamic</option>
              </select>
            </div>

            <div class="toggle-row compact">
              <label><input v-model="traceComplex" type="checkbox" /> Complex</label>
              <label><input v-model="highlight" type="checkbox" /> Highlight</label>
              <label><input v-model="ignoreSelf" type="checkbox" /> Ignore Self</label>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Thickness</label>
                <input v-model.number="thickness" class="fluent-input" type="number" min="0.1" step="0.1" />
              </div>
              <div class="form-group">
                <label>Color</label>
                <input v-model="highlightColor" class="color-input" type="color" />
              </div>
            </div>

            <div class="inspector-actions vertical">
              <button class="fluent-btn primary" :disabled="loading" @click="pickAtScreen">Pick Actor</button>
              <button class="fluent-btn" :disabled="loading" @click="getCurrentSelection">Current Selection</button>
              <button class="fluent-btn" :disabled="loading || !selectionId" @click="getSelectionTree">Load Details</button>
              <button class="fluent-btn danger" :disabled="loading" @click="clearHighlight">Clear Highlight</button>
            </div>
          </div>

          <div class="selection-strip">
            <span>Selection</span>
            <strong>{{ selectionLabel }}</strong>
          </div>

          <div class="pick-readout">
            <div class="pick-readout-header">
              <span>当前点中对象</span>
              <label class="pick-auto-toggle">
                <input v-model="autoRefreshPick" type="checkbox" />
                自动刷新
              </label>
            </div>

            <template v-if="pickReadout">
              <div class="pick-readout-primary">
                <strong>{{ pickReadout.actorName }}</strong>
                <em>#{{ pickReadout.selectionId ?? '-' }}</em>
              </div>
              <div class="pick-readout-meta">
                <span>{{ pickReadout.source }}</span>
                <span v-if="pickReadout.screenText">{{ pickReadout.screenText }}</span>
                <span v-if="pickReadout.distanceText">{{ pickReadout.distanceText }}</span>
                <span>{{ pickReadout.updatedAt }}</span>
              </div>
              <div class="pick-readout-grid">
                <span>Actor Class</span>
                <strong>{{ pickReadout.actorClass }}</strong>
                <span>Component</span>
                <strong>{{ pickReadout.componentName }}</strong>
                <span>Component Class</span>
                <strong>{{ pickReadout.componentClass }}</strong>
                <span>Impact</span>
                <strong>{{ pickReadout.impactText }}</strong>
              </div>
              <div class="pick-readout-path" :title="pickReadout.actorPath">
                {{ pickReadout.actorPath }}
              </div>
            </template>

            <div v-else class="pick-readout-empty">
              {{ pickReadoutError || '还没有点选记录' }}
            </div>
          </div>

          <div v-if="capabilityCommands.length" class="capability-box">
            <div class="panel-title small">Capabilities</div>
            <div class="capability-grid">
              <div v-for="row in capabilityRows" :key="row.label">
                <span>{{ row.label }}</span>
                <strong>{{ row.value }}</strong>
              </div>
            </div>
          </div>
        </aside>

        <main class="actor-stage">
          <section class="actor-hero" :class="{ empty: !actorInfo }">
            <div class="actor-kicker">
              <span>{{ lastCommand || 'idle' }}</span>
              <span v-if="responseTime" class="latency-pill">
                <span class="pulse-dot-green"></span>
                {{ responseTime }}ms
              </span>
            </div>

            <template v-if="responseError">
              <h2>{{ responseError.code || 'request_failed' }}</h2>
              <p>{{ responseError.message || responseError }}</p>
            </template>
            <template v-else-if="actorInfo">
              <div class="actor-id">#{{ responseData?.selectionId ?? selectionId }}</div>
              <h2>{{ actorTitle }}</h2>
              <p>{{ actorClassName }}</p>
              <div class="actor-path clickable-path" @click="copyActorPath" title="点击复制完整路径">
                <span>{{ actorPath }}</span>
                <span class="path-copy-tag" :class="{ copied: copiedStates['actorPath'] }">
                  {{ copiedStates['actorPath'] ? '✔ 已复制' : '📋 复制' }}
                </span>
              </div>
              <div class="actor-flags">
                <span v-for="flag in actorFlags" :key="flag.label" :class="{ on: flag.on }">
                  {{ flag.label }} {{ flag.value }}
                </span>
              </div>
            </template>
            <template v-else>
              <h2>No Actor Selected</h2>
              <p>Use Current Selection or Pick Actor to inspect runtime objects.</p>
            </template>
          </section>

          <!-- Flat categories style similar to UE DetailView -->
          <div class="actor-stage-sections">
            <!-- Transform Category -->
            <section class="actor-section ue-category-card">
              <div class="ue-category-header clickable" @click="toggleSection('transform')">
                <span class="ue-category-title">
                  <span class="category-arrow" :class="{ collapsed: collapsedSections.transform }">▼</span>
                  📐 Transform
                </span>
                <strong class="ue-category-count">{{ transformRows.length }}</strong>
              </div>
              <div v-show="!collapsedSections.transform" class="ue-category-body">
                <div v-if="transformRows.length" class="transform-grid">
                  <div v-for="row in transformRows" :key="row.key" class="transform-row">
                    <span>{{ row.label }}</span>
                    <strong>
                      <em :class="['type-pill', row.type]">{{ row.type }}</em>
                      {{ row.value }}
                    </strong>
                  </div>
                </div>
                <div v-else class="empty-line">No transform data</div>
              </div>
            </section>

            <!-- Actor Fields Category -->
            <section class="actor-section ue-category-card">
              <div class="ue-category-header clickable" @click="toggleSection('fields')">
                <span class="ue-category-title">
                  <span class="category-arrow" :class="{ collapsed: collapsedSections.fields }">▼</span>
                  📊 Actor Fields
                </span>
                <strong class="ue-category-count">{{ actorDetailRows.length }}</strong>
              </div>
              <div v-show="!collapsedSections.fields" class="ue-category-body">
                <div v-if="actorDetailRows.length" class="detail-grid">
                  <div v-for="row in actorDetailRows" :key="row.key" class="detail-row">
                    <span>{{ row.label }}</span>
                    <strong>
                      <em :class="['type-pill', row.type]">{{ row.type }}</em>
                      {{ row.value }}
                    </strong>
                  </div>
                </div>
                <div v-else class="empty-line">No actor fields</div>
              </div>
            </section>

            <!-- Hit Result Category -->
            <section class="actor-section ue-category-card">
              <div class="ue-category-header clickable" @click="toggleSection('hit')">
                <span class="ue-category-title">
                  <span class="category-arrow" :class="{ collapsed: collapsedSections.hit }">▼</span>
                  🎯 Hit Result
                </span>
                <strong class="ue-category-count">{{ hitRows.length }}</strong>
              </div>
              <div v-show="!collapsedSections.hit" class="ue-category-body">
                <div v-if="hitRows.length" class="detail-grid">
                  <div v-for="row in hitRows" :key="row.key" class="detail-row">
                    <span>{{ row.label }}</span>
                    <strong>
                      <em :class="['type-pill', row.type]">{{ row.type }}</em>
                      {{ row.value }}
                    </strong>
                  </div>
                </div>
                <div v-else class="empty-line">No hit data</div>
              </div>
            </section>
          </div>
        </main>

        <aside class="inspector-panel details-panel">
          <!-- Components Area -->
          <section class="details-section">
            <div class="section-header">
              <span>Components</span>
              <strong>{{ filteredComponentRows.length }} / {{ componentRows.length }}</strong>
            </div>

            <!-- Client-side fuzzy filter for Components -->
            <div v-if="componentRows.length" class="list-search-wrapper">
              <input
                v-model="componentSearch"
                class="fluent-input list-search"
                placeholder="🔍 搜索组件..."
                spellcheck="false"
              />
              <button v-if="componentSearch" class="clear-search-btn" @click="componentSearch = ''">×</button>
            </div>

            <div v-if="filteredComponentRows.length" class="component-list">
              <button
                v-for="component in filteredComponentRows"
                :key="component.key"
                class="component-row interactive-component-row"
                :class="{ active: currentNodeId === component.key }"
                @click="selectComponent(component)"
                title="点击探查该组件的属性"
              >
                <span>{{ component.name }}</span>
                <strong>{{ component.type }}</strong>
              </button>
            </div>
            <div v-else-if="componentRows.length" class="empty-line">未找到匹配的组件</div>
            <div v-else class="empty-line">Load details to view components</div>
          </section>

          <!-- Properties Area -->
          <section class="details-section">
            <div class="section-header">
              <span>Properties</span>
              <strong>{{ filteredPropertyRows.length }} / {{ propertyRows.length }}</strong>
            </div>

            <!-- Properties Breadcrumbs Navigation -->
            <div v-if="propertyHistory.length" class="properties-breadcrumbs-container">
              <div class="breadcrumb-trail">
                <span v-for="(hist, idx) in propertyHistory" :key="idx" class="breadcrumb-trail-item">
                  <button
                    class="breadcrumb-link"
                    :disabled="idx === propertyHistory.length - 1"
                    @click="idx === 0 ? resetToActorProperties() : goBackProperty()"
                  >
                    {{ hist.label }}
                  </button>
                  <span v-if="idx < propertyHistory.length - 1" class="breadcrumb-sep">&gt;</span>
                </span>
              </div>
              <button class="fluent-btn danger compact back-btn-tiny" @click="resetToActorProperties" title="返回根属性">
                🏠 根属性
              </button>
            </div>

            <!-- Client-side fuzzy filter for Properties -->
            <div v-if="propertyRows.length" class="list-search-wrapper">
              <input
                v-model="propertySearch"
                class="fluent-input list-search"
                placeholder="🔍 搜索属性..."
                spellcheck="false"
              />
              <button v-if="propertySearch" class="clear-search-btn" @click="propertySearch = ''">×</button>
            </div>

            <div v-if="filteredPropertyRows.length" class="property-list">
              <div
                v-for="property in filteredPropertyRows"
                :key="property.key"
                class="property-row interactive-property-row"
                :class="{ 'has-nested-subtree': property.hasChildren }"
              >
                <span class="prop-name-cell">
                  <span v-if="property.hasChildren" class="nested-dot-badge"></span>
                  {{ property.name }}
                </span>
                <strong class="prop-val-cell">
                  <em :class="['type-pill', property.type]">{{ property.type }}</em>
                  <span class="prop-val-text" :title="property.value">{{ property.value }}</span>
                  
                  <div class="prop-action-overlay">
                    <button
                      v-if="property.hasChildren"
                      class="fluent-btn primary compact drill-btn"
                      @click="drillIntoProperty(property)"
                      title="钻取该节点以显示嵌套属性"
                    >
                      🔍 钻取
                    </button>
                    <button
                      class="fluent-btn sub compact copy-btn-tiny"
                      @click="copyPropertyPath(property.value)"
                      title="复制属性值"
                    >
                      {{ copiedStates[property.value] ? '✔' : '📋' }}
                    </button>
                  </div>
                </strong>
              </div>
            </div>
            <div v-else-if="propertyRows.length" class="empty-line">未找到匹配的属性</div>
            <div v-else class="empty-line">No property nodes loaded</div>
          </section>
        </aside>
      </div>

      <details class="debug-drawer" open>
        <summary>
          <span>Debug JSON</span>
          <span>{{ lastCommand || 'no command' }}</span>
        </summary>
        <div class="debug-grid">
          <div class="raw-command">
            <div class="debug-title">Raw Request</div>
            <textarea v-model="rawRequest" class="fluent-textarea code" spellcheck="false"></textarea>
            <div class="inspector-actions">
              <button class="fluent-btn" :disabled="loading" @click="sendRawRequest">发送 Raw JSON</button>
              <button class="fluent-btn sub" @click="fillLastPick">填入 Pick 模板</button>
            </div>
          </div>
          <div class="raw-response">
            <div class="debug-title">Raw Response</div>
            <div class="response-area">
              <pre v-if="responseText" class="response-json">{{ responseText }}</pre>
              <div v-else class="placeholder">No response</div>
              <button v-if="responseText" class="fluent-btn sub copy-json" @click="copyResponse">复制响应</button>
            </div>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type InspectorObject = Record<string, any>
type DisplayRow = {
  key: string
  label: string
  value: string
  type: string
}
type PickReadout = {
  source: string
  updatedAt: string
  screenText: string
  selectionId: number | null
  actorName: string
  actorClass: string
  actorPath: string
  componentName: string
  componentClass: string
  componentPath: string
  distanceText: string
  impactText: string
}

const host = ref('127.0.0.1')
const port = ref(49273)
const timeoutMs = ref(5000)
const loading = ref(false)
const connectionState = ref<'unknown' | 'connected' | 'disconnected'>('unknown')
const responseText = ref('')
const lastResponse = ref<InspectorObject | null>(null)
const lastCommand = ref('')
const responseTime = ref<number | null>(null)
const selectionId = ref<number | null>(null)
const selectionActor = ref('')
const pickReadout = ref<PickReadout | null>(null)
const pickReadoutError = ref('')
const pickReadoutPending = ref(false)
const autoRefreshPick = ref(false)
let pickPollTimer: ReturnType<typeof setInterval> | null = null

const screenX = ref(960)
const screenY = ref(540)
const traceChannel = ref('Visibility')
const traceComplex = ref(true)
const highlight = ref(true)
const ignoreSelf = ref(false)
const highlightColor = ref('#ffb800')
const thickness = ref(2)

// UX & Interaction Enhanced States
const componentSearch = ref('')
const propertySearch = ref('')
const collapsedSections = ref<Record<string, boolean>>({
  transform: false,
  fields: false,
  hit: false
})
function toggleSection(sectionKey: string) {
  collapsedSections.value[sectionKey] = !collapsedSections.value[sectionKey]
}
const copiedStates = ref<Record<string, boolean>>({})
const propertyHistory = ref<Array<{ nodeId: string | null; label: string }>>([])
const currentNodeId = ref<string | null>(null)

const rawRequest = ref(JSON.stringify({ version: 1, id: 'capabilities', cmd: 'get_capabilities', args: {} }, null, 2))

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

const selectionLabel = computed(() => {
  if (!selectionId.value) return '未选中'
  return `#${selectionId.value} ${selectionActor.value || ''}`
})

const responseData = computed(() => asObject(lastResponse.value?.data))
const responseError = computed(() => {
  if (!lastResponse.value || lastResponse.value.ok === true) return null
  const error = lastResponse.value?.error
  if (!error) return null
  if (typeof error !== 'object') return { code: 'error', message: String(error) }

  const errorObject = error as InspectorObject
  if (!errorObject.code && !errorObject.message) return null
  return errorObject
})

const actorInfo = computed(() => {
  const data = responseData.value
  return asObject(data?.actor) || asObject(data?.summary) || null
})

const actorTitle = computed(() => formatValue(actorInfo.value?.name ?? 'No Actor Selected'))
const actorClassName = computed(() => shortTypeName(formatValue(actorInfo.value?.class ?? actorInfo.value?.className ?? '-')))
const actorPath = computed(() => formatValue(actorInfo.value?.pathName ?? actorInfo.value?.path ?? '-'))

const actorFlags = computed(() => {
  const actor = actorInfo.value
  if (!actor) return []
  return [
    { label: 'Valid', value: formatValue(actor.valid ?? true), on: actor.valid !== false },
    { label: 'Hidden', value: formatValue(actor.hidden ?? false), on: !!actor.hidden },
    { label: 'Tick', value: formatValue(actor.tickEnabled ?? false), on: !!actor.tickEnabled },
    { label: 'Role', value: formatValue(actor.role ?? actor.localRole ?? '-'), on: true },
  ].filter((flag) => flag.value !== '-')
})

const hitInfo = computed(() => asObject(responseData.value?.hit))

const capabilityCommands = computed(() => {
  const commands = responseData.value?.commands
  return Array.isArray(commands) ? commands.map((cmd) => String(cmd)) : []
})

const capabilityRows = computed(() => {
  return objectRows(responseData.value, { exclude: ['commands', 'actor', 'hit', 'components', 'properties'] })
})

const actorDetailRows = computed(() => objectRows(actorInfo.value, { exclude: ['transform'] }))

const transformRows = computed(() => {
  const transform = asObject(actorInfo.value?.transform)
  return objectRows(transform)
})

const hitRows = computed(() => {
  return objectRows(hitInfo.value)
})

const componentRows = computed(() => {
  const components = responseData.value?.components
  if (!Array.isArray(components)) return []

  return components.slice(0, 200).map((component: InspectorObject, index: number) => ({
    key: String(component.nodeId ?? component.pathName ?? component.name ?? index),
    name: formatValue(component.name ?? component.pathName ?? `Component ${index}`),
    type: formatValue(component.class ?? component.type ?? component.className ?? ''),
  }))
})

const filteredComponentRows = computed(() => {
  const query = componentSearch.value.trim().toLowerCase()
  if (!query) return componentRows.value
  return componentRows.value.filter(
    (c) => c.name.toLowerCase().includes(query) || c.type.toLowerCase().includes(query)
  )
})

const propertyRows = computed(() => {
  const properties = responseData.value?.properties
  const children = Array.isArray(properties?.children)
    ? properties.children
    : Array.isArray(responseData.value?.children)
      ? responseData.value.children
      : []

  return children.slice(0, 150).map((property: InspectorObject, index: number) => ({
    key: String(property.nodeId ?? property.path ?? property.name ?? index),
    name: formatValue(property.name ?? property.path ?? `Property ${index}`),
    value: formatValue(property.value ?? property.type ?? (property.hasChildren ? '可展开' : '')),
    hasChildren: !!property.hasChildren,
    nodeId: property.nodeId,
    type: property.type || 'string',
  }))
})

const filteredPropertyRows = computed(() => {
  const query = propertySearch.value.trim().toLowerCase()
  if (!query) return propertyRows.value
  return propertyRows.value.filter(
    (p: any) => p.name.toLowerCase().includes(query) || p.value.toLowerCase().includes(query)
  )
})

const hasStructuredContent = computed(() => (
  capabilityCommands.value.length > 0
  || !!actorInfo.value
  || !!hitInfo.value
  || componentRows.value.length > 0
  || propertyRows.value.length > 0
))

function asObject(value: unknown): InspectorObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as InspectorObject : null
}

function objectRows(value: unknown, options: { exclude?: string[] } = {}): DisplayRow[] {
  const objectValue = asObject(value)
  if (!objectValue) return []

  const excluded = new Set(options.exclude || [])
  return Object.entries(objectValue)
    .filter(([key]) => !excluded.has(key))
    .map(([key, entryValue]) => ({
      key,
      label: key,
      value: formatValue(entryValue),
      type: valueType(entryValue),
    }))
}

function valueType(value: unknown) {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return 'array'
  if (asObject(value)) return 'object'
  return typeof value
}

function formatNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3)
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') return formatNumber(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return `Array(${value.length})`
  const objectValue = asObject(value)
  if (objectValue) {
    return formatObjectInline(objectValue)
  }
  return JSON.stringify(value)
}

function formatObjectInline(value: InspectorObject) {
  const entries = Object.entries(value)
  if (entries.length === 0) return '{}'

  return entries.map(([key, entryValue]) => {
    if (typeof entryValue === 'number') return `${key}: ${formatNumber(entryValue)}`
    if (typeof entryValue === 'boolean') return `${key}: ${entryValue ? 'true' : 'false'}`
    if (typeof entryValue === 'string') return `${key}: ${entryValue}`
    if (Array.isArray(entryValue)) return `${key}: Array(${entryValue.length})`
    if (asObject(entryValue)) return `${key}: {${Object.keys(entryValue).length} keys}`
    if (entryValue === null || entryValue === undefined) return `${key}: null`
    return `${key}: ${String(entryValue)}`
  }).join(', ')
}

function shortTypeName(value: string) {
  if (!value || value === '-') return '-'
  const normalized = value.replace(/['"]/g, '')
  const slashIndex = normalized.lastIndexOf('/')
  const dotIndex = normalized.lastIndexOf('.')
  const splitIndex = Math.max(slashIndex, dotIndex)
  return splitIndex >= 0 ? normalized.slice(splitIndex + 1) : normalized
}

function updateSelectionFromResponse(response: any) {
  if (!response?.ok || !response?.data) return
  const data = response.data
  if (data.selectionId) {
    selectionId.value = data.selectionId
    selectionActor.value = data.actor?.pathName || data.actor?.name || selectionActor.value
  }
}

function formatPoint(value: unknown) {
  const point = asObject(value)
  if (!point) return '-'
  return `x:${formatNumber(point.x)} y:${formatNumber(point.y)} z:${formatNumber(point.z)}`
}

function buildPickReadout(response: any, source: string, screen?: { x: number; y: number }): PickReadout | null {
  if (!response?.ok || !response?.data) return null

  const data = response.data
  const hit = asObject(data.hit)
  const actor = asObject(data.actor) || asObject(hit?.actor)
  const component = asObject(hit?.component) || asObject(data.component)
  if (!actor && !component) return null

  const distance = typeof hit?.distance === 'number' ? `${formatNumber(hit.distance)} uu` : ''
  return {
    source,
    updatedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    screenText: screen ? `x:${formatNumber(screen.x)} y:${formatNumber(screen.y)}` : '',
    selectionId: typeof data.selectionId === 'number' ? data.selectionId : null,
    actorName: formatValue(actor?.name ?? hit?.actor?.name ?? '-'),
    actorClass: shortTypeName(formatValue(actor?.class ?? actor?.className ?? hit?.actor?.class ?? '-')),
    actorPath: formatValue(actor?.pathName ?? actor?.path ?? hit?.actor?.pathName ?? '-'),
    componentName: formatValue(component?.name ?? '-'),
    componentClass: shortTypeName(formatValue(component?.class ?? component?.className ?? '-')),
    componentPath: formatValue(component?.pathName ?? component?.path ?? '-'),
    distanceText: distance ? `dist:${distance}` : '',
    impactText: formatPoint(hit?.impactPoint),
  }
}

function updatePickReadoutFromResponse(response: any, source: string, screen?: { x: number; y: number }) {
  const nextReadout = buildPickReadout(response, source, screen)
  if (!nextReadout) return
  pickReadout.value = nextReadout
  pickReadoutError.value = ''
}

function colorToLinear(hex: string) {
  const raw = hex.replace('#', '')
  const r = parseInt(raw.slice(0, 2), 16) / 255
  const g = parseInt(raw.slice(2, 4), 16) / 255
  const b = parseInt(raw.slice(4, 6), 16) / 255
  return { r, g, b, a: 1 }
}

async function sendInspectorRequest(request: Record<string, unknown>) {
  loading.value = true
  responseTime.value = null
  lastCommand.value = String(request.cmd || 'raw')
  const started = performance.now()
  try {
    const response = await $fetch('/api/inspector/request', {
      method: 'POST',
      body: {
        host: host.value,
        port: Number(port.value),
        timeoutMs: Number(timeoutMs.value),
        request,
      },
    })
    responseTime.value = Math.round(performance.now() - started)
    responseText.value = JSON.stringify(response, null, 2)
    lastResponse.value = response as InspectorObject
    connectionState.value = 'connected'
    updateSelectionFromResponse(response)
    return response as any
  } catch (err: any) {
    responseTime.value = Math.round(performance.now() - started)
    connectionState.value = 'disconnected'
    const data = err?.data?.data || err?.data || {}
    const failedResponse = {
      ok: false,
      error: typeof data.error === 'object'
        ? data.error
        : { code: 'request_failed', message: data.error || err?.message || String(err) },
      host: data.host || host.value,
      port: data.port || port.value,
    }
    lastResponse.value = failedResponse
    responseText.value = JSON.stringify(failedResponse, null, 2)
    return null
  } finally {
    loading.value = false
  }
}

function makeRequestId(prefix: string) {
  return `${prefix}_${Date.now()}`
}

async function sendPing() {
  await sendInspectorRequest({ version: 1, id: makeRequestId('ping'), cmd: 'ping', args: {} })
}

async function getCapabilities() {
  await sendInspectorRequest({ version: 1, id: makeRequestId('cap'), cmd: 'get_capabilities', args: {} })
}

async function pickAtScreen() {
  const pickScreen = { x: Number(screenX.value), y: Number(screenY.value) }
  const response = await sendInspectorRequest({
    version: 1,
    id: makeRequestId('pick'),
    cmd: 'pick_at_screen',
    args: {
      x: pickScreen.x,
      y: pickScreen.y,
      traceChannel: traceChannel.value,
      traceComplex: traceComplex.value,
      ignoreSelf: ignoreSelf.value,
      highlight: highlight.value,
      color: colorToLinear(highlightColor.value),
      thickness: Number(thickness.value),
    },
  })
  if (response?.ok && response?.data?.selectionId) {
    selectionId.value = response.data.selectionId
    selectionActor.value = response.data.actor?.pathName || response.data.actor?.name || ''
    updatePickReadoutFromResponse(response, '手动 Pick', pickScreen)
  }
}

async function getCurrentSelection() {
  const response = await sendInspectorRequest({
    version: 1,
    id: makeRequestId('current'),
    cmd: 'get_current_selection',
    args: {},
  })
  if (response?.ok && response?.data?.selectionId) {
    selectionId.value = response.data.selectionId
    selectionActor.value = response.data.actor?.pathName || response.data.actor?.name || ''
    updatePickReadoutFromResponse(response, 'Current Selection')
  }
}

async function refreshPickReadout() {
  if (pickReadoutPending.value) return

  pickReadoutPending.value = true
  try {
    const response = await $fetch('/api/inspector/request', {
      method: 'POST',
      body: {
        host: host.value,
        port: Number(port.value),
        timeoutMs: Number(timeoutMs.value),
        request: {
          version: 1,
          id: makeRequestId('current'),
          cmd: 'get_current_selection',
          args: {},
        },
      },
    }) as any
    connectionState.value = response?.ok ? 'connected' : connectionState.value
    if (response?.ok && response?.data?.selectionId) {
      updateSelectionFromResponse(response)
      updatePickReadoutFromResponse(response, '自动刷新')
    } else if (!pickReadout.value) {
      const error = asObject(response?.error)
      pickReadoutError.value = formatValue(error?.message ?? error?.code ?? '当前没有点选对象')
    }
  } catch (err: any) {
    if (!pickReadout.value) {
      pickReadoutError.value = err?.message || String(err)
    }
  } finally {
    pickReadoutPending.value = false
  }
}

async function getSelectionTree() {
  if (!selectionId.value) return
  await sendInspectorRequest({
    version: 1,
    id: makeRequestId('tree'),
    cmd: 'get_selection_tree',
    args: { selectionId: selectionId.value, depth: 1, offset: 0, limit: 200 },
  })
}

async function clearHighlight() {
  await sendInspectorRequest({
    version: 1,
    id: makeRequestId('clear'),
    cmd: 'clear_selection_highlight',
    args: {},
  })
}

async function sendRawRequest() {
  try {
    const request = JSON.parse(rawRequest.value)
    await sendInspectorRequest(request)
  } catch (err: any) {
    const failedResponse = {
      ok: false,
      error: { code: 'invalid_raw_json', message: err?.message || String(err) },
    }
    lastCommand.value = 'raw'
    lastResponse.value = failedResponse
    responseText.value = JSON.stringify(failedResponse, null, 2)
  }
}

function fillLastPick() {
  rawRequest.value = JSON.stringify({
    version: 1,
    id: makeRequestId('pick'),
    cmd: 'pick_at_screen',
    args: {
      x: Number(screenX.value),
      y: Number(screenY.value),
      traceChannel: traceChannel.value,
      traceComplex: traceComplex.value,
      highlight: highlight.value,
      color: colorToLinear(highlightColor.value),
      thickness: Number(thickness.value),
    },
  }, null, 2)
}

// Helper to trigger transient copy-success notification
function triggerCopySuccess(key: string) {
  copiedStates.value[key] = true
  setTimeout(() => {
    copiedStates.value[key] = false
  }, 1500)
}

async function copyAdbCommand() {
  try {
    await navigator.clipboard?.writeText(`adb forward tcp:${port.value} tcp:${port.value}`)
    triggerCopySuccess('adb')
  } catch (e) {}
}

async function copyResponse() {
  if (responseText.value) {
    try {
      await navigator.clipboard?.writeText(responseText.value)
      triggerCopySuccess('response')
    } catch (e) {}
  }
}

async function copyActorPath() {
  if (actorPath.value && actorPath.value !== '-') {
    try {
      await navigator.clipboard?.writeText(actorPath.value)
      triggerCopySuccess('actorPath')
    } catch (e) {}
  }
}

async function copyPropertyPath(path: string) {
  if (path && path !== '-') {
    try {
      await navigator.clipboard?.writeText(path)
      triggerCopySuccess(path)
    } catch (e) {}
  }
}

// Coordinate Micro-adjusters
function adjustX(delta: number) {
  screenX.value = Math.max(0, screenX.value + delta)
}

function adjustY(delta: number) {
  screenY.value = Math.max(0, screenY.value + delta)
}

function resetCoordinates() {
  screenX.value = 960
  screenY.value = 540
}

onMounted(() => {
  pickPollTimer = setInterval(() => {
    if (autoRefreshPick.value) {
      refreshPickReadout()
    }
  }, 1000)
})

onBeforeUnmount(() => {
  if (pickPollTimer) {
    clearInterval(pickPollTimer)
    pickPollTimer = null
  }
})

// Drill-down Component handler
async function selectComponent(component: any) {
  if (!selectionId.value) return
  
  // Reset the property history with this component as first level
  currentNodeId.value = component.key
  propertyHistory.value = [
    { nodeId: null, label: 'Actor根属性' },
    { nodeId: component.key, label: String(component.name) }
  ]

  await sendInspectorRequest({
    version: 1,
    id: makeRequestId('tree'),
    cmd: 'get_selection_tree',
    args: { 
      selectionId: selectionId.value, 
      nodeId: component.key, 
      depth: 1, 
      offset: 0, 
      limit: 200 
    },
  })
}

// Drill-down Property Subtree handler
async function drillIntoProperty(property: any) {
  if (!selectionId.value || !property.hasChildren || !property.nodeId) return
  
  currentNodeId.value = property.nodeId
  propertyHistory.value.push({
    nodeId: property.nodeId,
    label: String(property.name)
  })

  await sendInspectorRequest({
    version: 1,
    id: makeRequestId('tree'),
    cmd: 'get_selection_tree',
    args: { 
      selectionId: selectionId.value, 
      nodeId: property.nodeId, 
      depth: 1, 
      offset: 0, 
      limit: 200 
    },
  })
}

// Back navigation to previous nesting level or Actor root properties
async function resetToActorProperties() {
  if (!selectionId.value) return
  
  currentNodeId.value = null
  propertyHistory.value = []
  
  await getSelectionTree()
}

async function goBackProperty() {
  if (!selectionId.value || propertyHistory.value.length === 0) return
  
  // Pop current
  propertyHistory.value.pop()
  
  // Grab the previous node
  const prev = propertyHistory.value[propertyHistory.value.length - 1]
  if (!prev || prev.nodeId === null) {
    await resetToActorProperties()
    return
  }
  
  currentNodeId.value = prev.nodeId
  
  await sendInspectorRequest({
    version: 1,
    id: makeRequestId('tree'),
    cmd: 'get_selection_tree',
    args: { 
      selectionId: selectionId.value, 
      nodeId: prev.nodeId, 
      depth: 1, 
      offset: 0, 
      limit: 200 
    },
  })
}
</script>

<style scoped>
.inspector-page {
  padding-bottom: 72px;
}

/* ================= Premium Enhanced UI Styles ================= */

/* Latency Pill & Dynamic pulse */
.latency-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  background: rgba(60, 207, 116, 0.08);
  border: 1px solid rgba(60, 207, 116, 0.25);
  border-radius: 99px;
  color: #3ccf74;
  font-size: 11px;
  font-family: var(--font-mono);
}

.pulse-dot-green {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #3ccf74;
  box-shadow: 0 0 8px #3ccf74;
  animation: pulse-glow-green 1.5s infinite;
}

@keyframes pulse-glow-green {
  0% { transform: scale(0.9); opacity: 0.6; }
  50% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 12px #3ccf74; }
  100% { transform: scale(0.9); opacity: 0.6; }
}

/* Premium Connection Card */
.premium-connection-card {
  border-color: rgba(167, 139, 250, 0.15);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4), inset 0 0 20px rgba(167, 139, 250, 0.03);
}

.active-connection-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.active-connection-pill.connected {
  color: #3ccf74;
  background: rgba(60, 207, 116, 0.08);
  border-color: rgba(60, 207, 116, 0.2);
}

.active-connection-pill.disconnected {
  color: #ff6464;
  background: rgba(255, 100, 100, 0.08);
  border-color: rgba(255, 100, 100, 0.2);
}

.active-connection-pill.unknown {
  color: var(--text-tertiary);
  background: rgba(255, 255, 255, 0.03);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.connected .pulse-dot {
  animation: pulse-glow-green 1.5s infinite;
}

/* Interactive copy lines */
.interactive-copy-line {
  transition: all var(--transition-premium);
  position: relative;
  overflow: hidden;
}

.interactive-copy-line:hover {
  border-color: rgba(167, 139, 250, 0.35);
  box-shadow: 0 0 15px rgba(167, 139, 250, 0.05);
}

.copy-btn {
  font-size: 11px;
  height: 26px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.03);
  transition: all 250ms ease;
}

.copy-btn.copied {
  color: #3ccf74;
  background: rgba(60, 207, 116, 0.1);
  border-color: rgba(60, 207, 116, 0.3);
}

/* Coordinate Adjusters Styles */
.coordinate-form-row {
  gap: 12px;
}

.coord-group {
  position: relative;
}

.coord-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.coord-input {
  text-align: center;
  font-family: var(--font-mono);
  font-size: 14px;
}

.coord-adjusters-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}

.adjust-btn-micro {
  height: 22px;
  border-radius: 4px;
  border: 1px solid var(--control-stroke);
  background: var(--control-fill);
  color: var(--text-secondary);
  font-size: 9.5px;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all var(--transition-premium);
}

.adjust-btn-micro:hover {
  background: var(--control-fill-hover);
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-0.5px);
}

.adjust-btn-micro:active {
  transform: translateY(0.5px);
}

.reset-center-btn {
  width: 100%;
  justify-content: center;
  font-size: 11.5px;
  border-style: dashed;
  margin-top: -6px;
  margin-bottom: 4px;
}

.reset-center-btn:hover {
  border-color: var(--accent-default);
  color: var(--text-primary);
}

/* Clickable Actor Path Style */
.clickable-path {
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.015);
  border: 1px solid transparent;
  transition: all var(--transition-premium);
}

.clickable-path:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--border-glass-hover);
  color: var(--text-primary);
}

.path-copy-tag {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  border: 1px solid transparent;
  transition: all 250ms ease;
}

.clickable-path:hover .path-copy-tag {
  background: rgba(167, 139, 250, 0.15);
  border-color: rgba(167, 139, 250, 0.25);
  color: var(--accent-default);
}

.path-copy-tag.copied {
  background: rgba(60, 207, 116, 0.15) !important;
  border-color: rgba(60, 207, 116, 0.3) !important;
  color: #3ccf74 !important;
}

/* Flat categories style similar to UE DetailView */
.actor-stage-sections {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  overflow-y: auto;
  flex: 1;
}

.ue-category-card {
  border: 1px solid var(--border-glass) !important;
  border-radius: var(--radius-md) !important;
  background: rgba(255, 255, 255, 0.012) !important;
  overflow: hidden;
  padding: 0 !important;
  transition: all var(--transition-premium);
}

.ue-category-card:hover {
  border-color: rgba(167, 139, 250, 0.22) !important;
  background: rgba(255, 255, 255, 0.018) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.ue-category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 38px;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.025);
  border-bottom: 1px solid var(--border-glass);
  cursor: pointer;
  user-select: none;
  transition: all var(--transition-premium);
}

.ue-category-header:hover {
  background: rgba(255, 255, 255, 0.055);
}

.ue-category-title {
  font-size: 12.5px;
  font-weight: 750;
  letter-spacing: 0.3px;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.category-arrow {
  display: inline-block;
  transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
  font-size: 10px;
  color: var(--accent-default);
}

.category-arrow.collapsed {
  transform: rotate(-90deg);
  color: var(--text-tertiary);
}

.ue-category-count {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.04);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-glass);
}

.ue-category-body {
  padding: 16px;
  animation: ue-slide-down 280ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes ue-slide-down {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

.tab-content-wrapper {
  flex: 1;
  overflow-y: auto;
  position: relative;
}

.tab-pane {
  min-height: 100%;
}

/* Dynamic Breadcrumbs for Properties */
.properties-breadcrumbs-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-glass);
  margin-bottom: 8px;
}

.breadcrumb-trail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.breadcrumb-trail-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.breadcrumb-link {
  background: transparent;
  border: none;
  padding: 0;
  color: var(--accent-default);
  font-family: inherit;
  font-size: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: color 200ms ease;
}

.breadcrumb-link:hover:not(:disabled) {
  color: var(--accent-hover);
  text-decoration: underline;
}

.breadcrumb-link:disabled {
  color: var(--text-secondary);
  cursor: default;
  font-weight: 600;
}

.breadcrumb-sep {
  color: var(--text-tertiary);
  font-weight: bold;
}

.back-btn-tiny {
  font-size: 10.5px;
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
}

/* Fuzzy Search Box Wrapper */
.list-search-wrapper {
  position: relative;
  width: 100%;
  margin-bottom: 10px;
}

.list-search {
  width: 100%;
  height: 32px;
  padding-left: 12px;
  padding-right: 32px;
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.clear-search-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 50%;
  transition: all 200ms ease;
}

.clear-search-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
}

/* Interactive Components rows */
.interactive-component-row {
  cursor: pointer;
  transition: all var(--transition-premium);
  position: relative;
  overflow: hidden;
  border: 1px solid transparent;
}

.interactive-component-row:hover {
  background: rgba(167, 139, 250, 0.05);
  border-color: rgba(167, 139, 250, 0.2);
  transform: translateX(4px);
}

.interactive-component-row.active {
  background: linear-gradient(90deg, rgba(167, 139, 250, 0.1) 0%, rgba(20, 184, 166, 0.02) 100%);
  border-color: rgba(167, 139, 250, 0.35);
  box-shadow: inset 0 0 10px rgba(167, 139, 250, 0.04);
}

.interactive-component-row.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 3px;
  background: var(--accent-default);
  border-radius: 0 4px 4px 0;
}

/* Interactive Properties rows with Action Overlay on Hover */
.interactive-property-row {
  position: relative;
  overflow: hidden;
  transition: all var(--transition-premium);
}

.interactive-property-row:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
}

.interactive-property-row.has-nested-subtree {
  border-left: 2px solid rgba(167, 139, 250, 0.25);
  padding-left: 12px;
}

.interactive-property-row.has-nested-subtree:hover {
  border-left-color: var(--accent-default);
  box-shadow: inset 4px 0 12px rgba(167, 139, 250, 0.02);
}

.prop-name-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.nested-dot-badge {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-default);
  box-shadow: 0 0 6px var(--accent-default);
}

.prop-val-cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.prop-val-text {
  flex: 1;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  padding-right: 48px;
}

.prop-action-overlay {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%) translateX(20px);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: all 250ms cubic-bezier(0.16, 1, 0.3, 1);
  background: linear-gradient(90deg, transparent 0%, rgba(20, 20, 25, 0.95) 20%);
  padding-left: 16px;
  height: 100%;
}

.interactive-property-row:hover .prop-action-overlay {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}

.drill-btn {
  font-size: 10px;
  height: 22px;
  padding: 0 8px;
  border-radius: 4px;
}

.copy-btn-tiny {
  font-size: 10px;
  height: 22px;
  width: 22px;
  padding: 0;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* ================= Tab Slide Transition ================= */
.tab-slide-enter-active,
.tab-slide-leave-active {
  transition: all 300ms cubic-bezier(0.16, 1, 0.3, 1);
}

.tab-slide-enter-from {
  opacity: 0;
  transform: translateX(12px);
}

.tab-slide-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.inspector-connection-grid {
  display: grid;
  grid-template-columns: minmax(140px, 180px) minmax(110px, 140px) 1fr auto;
  gap: 16px;
  align-items: end;
}

.inspector-workbench {
  display: grid;
  grid-template-columns: minmax(260px, 300px) minmax(420px, 1fr) minmax(320px, 420px);
  gap: 18px;
  align-items: stretch;
}

.inspector-panel,
.actor-stage {
  min-width: 0;
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.025);
  overflow: hidden;
}

.control-panel,
.details-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px;
}

.actor-stage {
  display: flex;
  flex-direction: column;
}

.panel-title,
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
}

.panel-title.small {
  font-size: 12px;
}

.section-header {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-glass);
}

.section-header strong {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label,
.color-row label,
.summary-label {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.inspector-form,
.raw-command {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inspector-actions.vertical {
  flex-direction: column;
  align-items: stretch;
}

.inspector-actions.vertical .fluent-btn {
  justify-content: center;
  width: 100%;
}

.toggle-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  color: var(--text-secondary);
  font-size: 13px;
}

.toggle-row.compact {
  gap: 10px;
  font-size: 12px;
}

.toggle-row label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.color-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.color-row input {
  width: 64px;
  height: 36px;
  border: 1px solid var(--control-stroke);
  border-radius: var(--radius-md);
  background: var(--bg-input);
}

.color-input {
  width: 100%;
  height: 36px;
  padding: 3px;
  border: 1px solid var(--control-stroke);
  border-radius: var(--radius-md);
  background: var(--bg-input);
}

.copy-line {
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px 0 12px;
  border: 1px solid var(--control-stroke);
  border-radius: var(--radius-md);
  background: var(--bg-input);
}

.copy-line code {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.inspector-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.selection-summary {
  padding: 12px 14px;
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.025);
}

.selection-strip {
  display: grid;
  gap: 7px;
  padding: 12px;
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-md);
  background: rgba(255, 184, 0, 0.08);
}

.selection-strip span {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.selection-strip strong {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.pick-readout {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(45, 209, 159, 0.32);
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, rgba(45, 209, 159, 0.12), rgba(255, 184, 0, 0.05));
}

.pick-readout-header,
.pick-readout-primary,
.pick-readout-meta,
.pick-auto-toggle {
  display: flex;
  align-items: center;
}

.pick-readout-header {
  justify-content: space-between;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.pick-auto-toggle {
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  text-transform: none;
}

.pick-readout-primary {
  justify-content: space-between;
  gap: 10px;
}

.pick-readout-primary strong {
  min-width: 0;
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 850;
  overflow-wrap: anywhere;
}

.pick-readout-primary em {
  flex: 0 0 auto;
  padding: 3px 7px;
  border: 1px solid rgba(255, 184, 0, 0.4);
  border-radius: var(--radius-sm);
  color: #ffcf5a;
  background: rgba(255, 184, 0, 0.08);
  font-family: var(--font-mono);
  font-size: 11px;
  font-style: normal;
}

.pick-readout-meta {
  flex-wrap: wrap;
  gap: 6px;
}

.pick-readout-meta span {
  padding: 3px 7px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.035);
  font-family: var(--font-mono);
  font-size: 11px;
}

.pick-readout-grid {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 7px 10px;
  align-items: baseline;
  font-size: 12px;
}

.pick-readout-grid span {
  color: var(--text-muted);
}

.pick-readout-grid strong {
  min-width: 0;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.pick-readout-path,
.pick-readout-empty {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.pick-readout-path {
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.capability-box {
  display: grid;
  gap: 12px;
  margin-top: auto;
}

.capability-grid {
  display: grid;
  gap: 8px;
}

.capability-grid > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 12px;
}

.capability-grid strong {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.summary-value {
  margin-top: 6px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  word-break: break-all;
}

.fluent-textarea {
  width: 100%;
  min-height: 260px;
  padding: 14px;
  resize: vertical;
  border: 1px solid var(--control-stroke);
  border-radius: var(--radius-md);
  background: var(--bg-input);
  color: var(--text-primary);
  outline: none;
}

.code {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
}

.actor-hero {
  min-height: 218px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-content: flex-end;
  padding: 24px;
  border-bottom: 1px solid var(--border-glass);
  background:
    linear-gradient(135deg, rgba(255, 184, 0, 0.18), rgba(45, 209, 159, 0.07) 48%, rgba(255, 255, 255, 0.025)),
    rgba(255, 255, 255, 0.02);
}

.actor-hero.empty {
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.07), rgba(45, 209, 159, 0.04)),
    rgba(255, 255, 255, 0.02);
}

.actor-kicker {
  display: flex;
  gap: 10px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.actor-id {
  width: fit-content;
  padding: 5px 8px;
  border: 1px solid rgba(255, 184, 0, 0.45);
  border-radius: var(--radius-md);
  color: #ffcf5a;
  background: rgba(255, 184, 0, 0.08);
  font-family: var(--font-mono);
  font-size: 12px;
}

.actor-hero h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 28px;
  line-height: 1.15;
  font-weight: 850;
  overflow-wrap: anywhere;
}

.actor-hero p {
  margin: 0;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.actor-path {
  max-width: 100%;
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.actor-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.actor-flags span {
  padding: 5px 8px;
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.1);
  font-family: var(--font-mono);
  font-size: 11px;
}

.actor-flags span.on {
  color: #7ee2b8;
  border-color: rgba(126, 226, 184, 0.34);
  background: rgba(126, 226, 184, 0.08);
}

.actor-section,
.details-section {
  display: grid;
  gap: 12px;
  padding: 18px;
}

.details-section + .details-section {
  border-top: 1px solid var(--border-glass);
}

.transform-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.transform-row {
  display: grid;
  gap: 7px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.025);
}

.transform-row span {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.transform-row strong {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.detail-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-sm);
  background: rgba(0, 0, 0, 0.16);
  overflow: hidden;
}

.detail-row {
  min-height: 30px;
  display: grid;
  grid-template-columns: 200px 1fr !important;
  gap: 0 !important;
  align-items: stretch !important;
  padding: 0 !important;
  border: none !important;
  border-radius: 0 !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.035) !important;
  background: transparent !important;
}

.detail-row:nth-child(even) {
  background: rgba(255, 255, 255, 0.015) !important;
}

.detail-row:last-child {
  border-bottom: none !important;
}

.detail-row > span {
  font-family: var(--font-stack);
  font-size: 11.5px !important;
  font-weight: 600;
  color: var(--text-secondary) !important;
  border-right: 1px solid var(--border-glass);
  display: flex;
  align-items: center;
  padding: 6px 12px !important;
  background: rgba(0, 0, 0, 0.1);
  user-select: text;
}

.detail-row > strong {
  font-family: var(--font-mono);
  font-size: 12px !important;
  font-weight: 500 !important;
  color: var(--text-primary) !important;
  display: flex;
  align-items: center;
  padding: 6px 14px !important;
  overflow-wrap: anywhere;
  user-select: text;
}

.detail-row,
.component-row,
.property-row {
  min-height: 34px;
  display: grid;
  grid-template-columns: minmax(94px, 0.32fr) minmax(0, 0.68fr);
  gap: 12px;
  align-items: center;
  padding: 7px 10px;
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.025);
}

.component-row {
  width: 100%;
  border-color: var(--border-glass);
  color: inherit;
  text-align: left;
  cursor: default;
}

.detail-row span,
.component-row span,
.property-row span {
  color: var(--text-secondary);
  font-size: 12px;
}

.detail-row strong,
.component-row strong,
.property-row strong {
  min-width: 0;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.type-pill {
  display: inline-flex;
  align-items: center;
  margin-right: 7px;
  padding: 2px 5px;
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.035);
  font-family: var(--font-mono);
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
}

.type-pill.number {
  color: #8bd5ff;
  border-color: rgba(139, 213, 255, 0.32);
}

.type-pill.boolean {
  color: #7ee2b8;
  border-color: rgba(126, 226, 184, 0.32);
}

.type-pill.object,
.type-pill.array {
  color: #ffcf5a;
  border-color: rgba(255, 207, 90, 0.32);
}

.component-list,
.property-list {
  display: grid;
  gap: 8px;
  max-height: 520px;
  overflow: auto;
}

.command-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.command-tag {
  padding: 5px 8px;
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.04);
  font-family: var(--font-mono);
  font-size: 12px;
}

.empty-line {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  border: 1px dashed var(--border-glass);
  border-radius: var(--radius-md);
  font-size: 13px;
}

.debug-drawer {
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.02);
  overflow: hidden;
}

.debug-drawer summary {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
}

.debug-drawer summary span:last-child {
  font-family: var(--font-mono);
  font-size: 12px;
}

.debug-grid {
  display: grid;
  grid-template-columns: minmax(360px, 0.9fr) minmax(420px, 1.1fr);
  gap: 16px;
  padding: 16px;
  border-top: 1px solid var(--border-glass);
}

.debug-title {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.raw-response {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.response-area {
  position: relative;
  min-height: 260px;
  max-height: 520px;
  overflow: auto;
  padding: 16px;
  background: rgba(0, 0, 0, 0.16);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-md);
}

.response-json {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-primary);
  white-space: pre-wrap;
  user-select: text;
}

.placeholder {
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}

.copy-json {
  position: absolute;
  top: 10px;
  right: 10px;
}

.response-meta {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 12px;
}

.connection-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.04);
  font-size: 13px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);
}

.connection-status.connected .status-dot {
  background: #3ccf74;
}

.connection-status.disconnected .status-dot {
  background: #ff6464;
}

.connection-status.connected {
  color: #3ccf74;
}

.connection-status.disconnected {
  color: #ff6464;
}

@media (max-width: 1180px) {
  .inspector-connection-grid,
  .inspector-workbench,
  .debug-grid {
    grid-template-columns: 1fr;
  }

  .transform-grid {
    grid-template-columns: 1fr;
  }
}
</style>
