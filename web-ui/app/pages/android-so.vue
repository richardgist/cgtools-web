<template>
  <div class="page active" style="display: flex;">
    <div class="standard-page-header">
      <h1 class="header-title">Android SO Tooling</h1>
      <div class="header-controls">
        <div class="env-chip" :class="detected.adbAvailable ? 'ok' : 'bad'">adb: {{ detected.adbAvailable ? 'ok' : 'missing' }}</div>
        <div class="env-chip" :class="detected.ueAppToolsExists ? 'ok' : 'bad'">UEAppTools: {{ detected.ueAppToolsExists ? 'ok' : 'missing' }}</div>
        <div class="env-chip" :class="injectToolsReady ? 'ok' : 'bad'">Inject tools: {{ injectToolsReady ? 'ok' : 'missing' }}</div>
      </div>
    </div>

    <div class="page-content-scroll">
      <section class="fluent-card">
        <div class="card-header">Workflow Tabs</div>
        <div class="card-body">
          <div class="tab-row">
            <button class="tab-btn" :class="{ active: activeTab === 'buildSo' }" @click="activeTab = 'buildSo'">1) Build SO</button>
            <button class="tab-btn" :class="{ active: activeTab === 'replaceA' }" @click="activeTab = 'replaceA'">2) Plan A Replace APK SO</button>
            <button class="tab-btn" :class="{ active: activeTab === 'injectB' }" @click="activeTab = 'injectB'">3) Plan B Inject Runtime SO</button>
            <button class="tab-btn" :class="{ active: activeTab === 'guideC' }" @click="activeTab = 'guideC'">4) Plan C APL Guide</button>
          </div>
        </div>
      </section>

      <section class="fluent-card">
        <div class="card-header">
          <span>Shared Paths</span>
          <div class="terminal-actions">
            <button class="fluent-btn sub" @click="togglePathSection">{{ collapsePathSection ? 'Expand' : 'Collapse' }}</button>
            <button class="fluent-btn sub" @click="loadDefaults">Reload Defaults</button>
          </div>
        </div>
        <div class="card-body" v-if="!collapsePathSection">
          <div class="field-grid">
            <div class="field-row">
              <label>Project Root</label>
              <input v-model="settings.projectRoot" class="fluent-input path-input" />
              <button class="fluent-btn sub" @click="pickFolder('projectRoot')">Browse</button>
            </div>
            <div class="field-row">
              <label>Project File (.uproject)</label>
              <input v-model="settings.projectFile" class="fluent-input path-input" />
              <button class="fluent-btn sub" @click="pickFile('projectFile', 'any')">Browse</button>
            </div>
            <div class="field-row">
              <label>Engine Root</label>
              <input v-model="settings.engineRoot" class="fluent-input path-input" />
              <button class="fluent-btn sub" @click="pickFolder('engineRoot')">Browse</button>
            </div>
            <div class="field-row">
              <label>UEAppTools.exe</label>
              <input v-model="settings.ueAppToolsExe" class="fluent-input path-input" />
              <button class="fluent-btn sub" @click="pickFile('ueAppToolsExe', 'exe')">Browse</button>
            </div>
            <div class="field-row">
              <label>AndroidInject Dir</label>
              <input v-model="settings.androidInjectDir" class="fluent-input path-input" />
              <button class="fluent-btn sub" @click="pickFolder('androidInjectDir')">Browse</button>
            </div>
          </div>
        </div>
      </section>

      <section class="fluent-card">
        <div class="card-header">Current Step Settings</div>
        <div class="card-body">
          <div v-if="activeTab === 'buildSo'" class="field-grid">
            <div class="field-row compact">
              <label>Config</label>
              <select v-model="settings.config" class="fluent-select">
                <option value="Development">Development</option>
                <option value="Test">Test</option>
                <option value="Shipping">Shipping</option>
              </select>
            </div>
            <div class="field-row compact">
              <label>Arch</label>
              <select v-model="settings.arch" class="fluent-select">
                <option value="arm64-v8a">arm64-v8a</option>
                <option value="armeabi-v7a">armeabi-v7a</option>
                <option value="x86_64">x86_64</option>
              </select>
            </div>
            <div class="field-row compact">
              <label>Cook Flavor</label>
              <input v-model="settings.cookFlavor" class="fluent-input" placeholder="ETC2" />
            </div>
            <div class="field-row">
              <label>Archive Dir (optional)</label>
              <input v-model="settings.archiveDir" class="fluent-input path-input" placeholder="C:\\CJGame\\PRE418\\bin" />
              <button class="fluent-btn sub" @click="pickFolder('archiveDir')">Browse</button>
            </div>
            <div class="hint-line">Expected output: <code>{{ expectedSoOutputPath }}</code></div>
          </div>

          <div v-else-if="activeTab === 'replaceA'" class="field-grid">
            <div class="field-row">
              <label>APK Path</label>
              <input v-model="settings.apkPath" class="fluent-input path-input" />
              <button class="fluent-btn sub" @click="pickFile('apkPath', 'apk')">Browse</button>
            </div>
            <div class="field-row">
              <label>SO Path</label>
              <input v-model="settings.soPath" class="fluent-input path-input" />
              <button class="fluent-btn sub" @click="pickFile('soPath', 'so')">Browse</button>
            </div>
            <div class="field-row compact">
              <label>Arch</label>
              <select v-model="settings.arch" class="fluent-select">
                <option value="arm64-v8a">arm64-v8a</option>
                <option value="armeabi-v7a">armeabi-v7a</option>
                <option value="x86_64">x86_64</option>
              </select>
            </div>
            <label class="check-line">
              <input v-model="settings.showInstallHint" type="checkbox" />
              Show install hint after replacement (`adb install -r`)
            </label>
            <div class="hint-line warn">Reminder: make sure APK ABI and SO ABI match.</div>
          </div>

          <div v-else-if="activeTab === 'injectB'" class="field-grid">
            <div class="field-row">
              <label>Package Name</label>
              <input v-model="settings.packageName" class="fluent-input path-input" placeholder="com.tencent.tmgp.pubgmhd" />
            </div>
            <div class="field-row">
              <label>Launch Activity</label>
              <input v-model="settings.launchActivity" class="fluent-input path-input" placeholder="com.epicgames.ue4.SplashActivity" />
            </div>
            <div class="field-row">
              <label>SO Path</label>
              <input v-model="settings.soPath" class="fluent-input path-input" />
              <button class="fluent-btn sub" @click="pickFile('soPath', 'so')">Browse</button>
            </div>
            <div class="hint-line">
              Inject success marker must exist in pulled log:
              <code>inject dlclose_addr res : 0</code>
            </div>
          </div>

          <div v-else class="field-grid">
            <div class="field-row">
              <label>Library Name</label>
              <input v-model="settings.aplLibraryName" class="fluent-input path-input" placeholder="my_inject_lib" />
            </div>
            <div class="field-row">
              <label>Fail Message</label>
              <input v-model="settings.aplFailMessage" class="fluent-input path-input" placeholder="library not loaded" />
            </div>
            <div class="hint-line">
              Plan C is guide-only in this version. It generates the snippet and checklist but does not modify project files.
            </div>
            <div class="guide-box">
              <div class="guide-title">Manual checklist</div>
              <ol>
                <li>Create/update your APL xml and add <code>&lt;soLoadLibrary&gt;</code> section.</li>
                <li>Register that APL in your module Build.cs via <code>AdditionalPropertiesForReceipt</code>.</li>
                <li>Put your extra .so into Android libs copy path in APL <code>resourceCopies</code>.</li>
                <li>Rebuild APK and verify load order before <code>libUE4.so</code>.</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section class="fluent-card">
        <div class="card-header">Command Preview</div>
        <div class="card-body">
          <textarea class="preview-area" readonly :value="commandPreview"></textarea>
          <div class="action-row">
            <button class="fluent-btn" @click="copyPreview">Copy Command</button>
            <button class="fluent-btn primary" @click="runActive" :disabled="isRunning || activeTab === 'guideC'">Run</button>
            <button class="fluent-btn danger" @click="terminateRun" :disabled="!isRunning">Stop</button>
            <button class="fluent-btn" v-if="activeTab === 'guideC'" @click="copyAplTemplate">Copy APL Snippet</button>
          </div>
          <div v-if="lastOutputs" class="outputs-box">
            <div class="guide-title">Latest Outputs</div>
            <div v-for="(v, k) in lastOutputs" :key="k"><code>{{ k }}</code>: <span>{{ v }}</span></div>
          </div>
        </div>
      </section>

      <section class="fluent-card terminal-wrap">
        <div class="card-header">
          <span>Execution Log</span>
          <div class="terminal-actions">
            <button class="fluent-btn sub" @click="clearLogs">Clear</button>
          </div>
        </div>
        <div class="terminal" ref="terminalEl">
          <div v-for="(line, idx) in logs" :key="idx" :class="line.type">{{ line.text }}</div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'

const STORAGE_KEY = 'cgtools_android_so_settings_v1'

const activeTab = ref('buildSo')
const isRunning = ref(false)
const collapsePathSection = ref(false)
const terminalEl = ref(null)
const logs = ref([])
const lastOutputs = ref(null)
let ws = null

const detected = reactive({
  windows: false,
  adbAvailable: false,
  projectRootExists: false,
  projectFileExists: false,
  engineRootExists: false,
  ueAppToolsExists: false,
  androidInjectDirExists: false,
  injectDemoExists: false,
  injectEntrySoExists: false,
})

const settings = reactive({
  projectRoot: 'C:\\CJGame\\PRE418',
  projectFile: 'C:\\CJGame\\PRE418\\Survive\\ShadowTrackerExtra.uproject',
  engineRoot: 'C:\\CJGame\\PRE418\\UE4181\\Engine',
  ueAppToolsExe: 'C:\\CJGame\\PRE418\\Survive\\Tools\\UEAppTools\\build\\Release\\UEAppTools.exe',
  androidInjectDir: 'C:\\CJGame\\PRE418\\Survive\\ExternalTools\\AndroidInject',
  config: 'Development',
  arch: 'arm64-v8a',
  cookFlavor: 'ETC2',
  archiveDir: '',
  apkPath: '',
  soPath: '',
  showInstallHint: true,
  packageName: 'com.tencent.tmgp.pubgmhd',
  launchActivity: 'com.epicgames.ue4.SplashActivity',
  aplLibraryName: 'my_inject_lib',
  aplFailMessage: 'library not loaded and required',
})

const injectToolsReady = computed(() => detected.androidInjectDirExists && detected.injectDemoExists && detected.injectEntrySoExists)

const quote = (text) => {
  if (!text) return '""'
  return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text
}

const expectedSoOutputPath = computed(() => {
  if (!settings.projectFile) return ''
  const projectDir = settings.projectFile.replace(/[\\/][^\\/]+$/, '')
  return `${projectDir}\\Intermediate\\Android\\APK\\jni\\${settings.arch}\\libUE4.so`
})

const aplSnippet = computed(() => {
  return `<soLoadLibrary>\n  <loadLibrary name="${settings.aplLibraryName}" failmsg="${settings.aplFailMessage}" />\n</soLoadLibrary>`
})

const commandPreview = computed(() => {
  if (activeTab.value === 'buildSo') {
    const runUat = `${settings.engineRoot}\\Build\\BatchFiles\\RunUAT.bat`
    const archiveArg = settings.archiveDir ? ` -archivedirectory=${quote(settings.archiveDir)}` : ''
    return `${quote(runUat)} -ScriptsForProject=${quote(settings.projectFile)} BuildCookRun -project=${quote(settings.projectFile)} -targetplatform=Android -clientconfig=${settings.config} -cookflavor=${settings.cookFlavor} -skipcook -stage -archive${archiveArg} -package -build -pak -nocompileeditor -NoDebugInfo -utf8output`
  }
  if (activeTab.value === 'replaceA') {
    return `${quote(settings.ueAppToolsExe)} -mode=replaceSo -platform=android -apkPath=${quote(settings.apkPath)} -soPath=${quote(settings.soPath)} -arch=${settings.arch}`
  }
  if (activeTab.value === 'injectB') {
    const comp = settings.launchActivity.includes('/') ? settings.launchActivity : `${settings.packageName}/${settings.launchActivity}`
    return [
      `adb push ${quote(settings.androidInjectDir + '\\inject_demo')} /data/local/tmp/`,
      `adb push ${quote(settings.androidInjectDir + '\\lib_inject_entry.so')} /data/local/tmp/`,
      `adb push ${quote(settings.soPath)} /data/local/tmp/libUE4.so`,
      `adb shell "run-as ${settings.packageName} sh -c 'cp /data/local/tmp/libUE4.so . && cp /data/local/tmp/inject_demo . && cp /data/local/tmp/lib_inject_entry.so . && chmod 777 ./inject_demo && chmod 777 ./lib_inject_entry.so'"`,
      `adb shell am start -n ${comp}`,
      `adb shell "run-as ${settings.packageName} sh -c './inject_demo ${settings.packageName} > /data/local/tmp/log_android_inject.txt'"`,
      'adb pull /data/local/tmp/log_android_inject.txt <local_path>',
    ].join('\n')
  }
  return aplSnippet.value
})

const saveSettings = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

const appendLog = (type, text) => {
  logs.value.push({ type, text })
  nextTick(() => {
    if (terminalEl.value) {
      terminalEl.value.scrollTop = terminalEl.value.scrollHeight
    }
  })
}

const clearLogs = () => {
  logs.value = []
}

const copyText = async (text) => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    document.body.removeChild(area)
  }
}

const copyPreview = async () => {
  await copyText(commandPreview.value)
  appendLog('info', '[info] Command copied.\n')
}

const copyAplTemplate = async () => {
  await copyText(aplSnippet.value)
  appendLog('info', '[info] APL snippet copied.\n')
}

const loadDefaults = async () => {
  try {
    const data = await $fetch('/api/android-so/defaults')
    settings.projectRoot = data.projectRoot || settings.projectRoot
    settings.projectFile = data.projectFile || settings.projectFile
    settings.engineRoot = data.engineRoot || settings.engineRoot
    settings.ueAppToolsExe = data.ueAppToolsExe || settings.ueAppToolsExe
    settings.androidInjectDir = data.androidInjectDir || settings.androidInjectDir

    Object.assign(detected, data.detected || {})
  } catch (error) {
    appendLog('stderr', `[error] Failed to load defaults: ${error.message}\n`)
  }
}

const loadSavedSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    Object.assign(settings, parsed)
  } catch {
    // ignore local parse errors
  }
}

const togglePathSection = () => {
  collapsePathSection.value = !collapsePathSection.value
}

const pickFolder = async (key) => {
  try {
    const res = await $fetch('/api/system/folder')
    if (res.success && res.path) {
      settings[key] = res.path
    }
  } catch (error) {
    appendLog('stderr', `[error] folder picker failed: ${error.message}\n`)
  }
}

const pickFile = async (key, filter) => {
  try {
    const res = await $fetch('/api/system/file', { query: { mode: 'open', filter } })
    if (res.success && res.path) {
      settings[key] = res.path
    }
  } catch (error) {
    appendLog('stderr', `[error] file picker failed: ${error.message}\n`)
  }
}

const ensureSocket = () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return Promise.resolve(ws)
  }
  return new Promise((resolve, reject) => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws/android-so`)

    socket.onopen = () => {
      ws = socket
      resolve(socket)
    }

    socket.onmessage = (event) => {
      let data = null
      try {
        data = JSON.parse(event.data)
      } catch {
        appendLog('stderr', `[error] invalid ws message: ${event.data}\n`)
        return
      }

      if (data.type === 'start') {
        isRunning.value = true
        appendLog('info', `[start] ${data.jobType}\n`)
      } else if (data.type === 'step') {
        appendLog('info', `[step] ${data.name}\n`)
      } else if (data.type === 'stdout') {
        appendLog('stdout', data.data)
      } else if (data.type === 'stderr') {
        appendLog('stderr', data.data)
      } else if (data.type === 'error') {
        appendLog('stderr', `[error] ${data.data}\n`)
      } else if (data.type === 'end') {
        isRunning.value = false
        lastOutputs.value = data.outputs || null
        appendLog('info', `[end] exitCode=${data.exitCode}\n`)
        if (data.outputs?.soPath) {
          settings.soPath = data.outputs.soPath
        }
      }
    }

    socket.onerror = () => {
      reject(new Error('WebSocket connection failed.'))
    }

    socket.onclose = () => {
      ws = null
      isRunning.value = false
    }
  })
}

const buildPayload = () => {
  if (activeTab.value === 'buildSo') {
    return {
      projectRoot: settings.projectRoot,
      projectFile: settings.projectFile,
      engineRoot: settings.engineRoot,
      config: settings.config,
      arch: settings.arch,
      cookFlavor: settings.cookFlavor,
      archiveDir: settings.archiveDir || undefined,
    }
  }
  if (activeTab.value === 'replaceA') {
    return {
      apkPath: settings.apkPath,
      soPath: settings.soPath,
      arch: settings.arch,
      ueAppToolsExe: settings.ueAppToolsExe,
      showInstallHint: settings.showInstallHint,
    }
  }
  return {
    packageName: settings.packageName,
    androidInjectDir: settings.androidInjectDir,
    soPath: settings.soPath,
    launchActivity: settings.launchActivity,
  }
}

const runActive = async () => {
  if (activeTab.value === 'guideC') {
    return
  }
  try {
    const socket = await ensureSocket()
    const payload = buildPayload()
    const jobType = activeTab.value
    appendLog('info', `[run] ${jobType}\n`)
    socket.send(JSON.stringify({ action: 'run', jobType, payload }))
  } catch (error) {
    appendLog('stderr', `[error] unable to start run: ${error.message}\n`)
  }
}

const terminateRun = () => {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return
  }
  ws.send(JSON.stringify({ action: 'terminate' }))
}

watch(settings, saveSettings, { deep: true })

onMounted(async () => {
  await loadDefaults()
  loadSavedSettings()
})
</script>

<style scoped>
.tab-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-btn {
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--control-stroke);
  background: var(--control-fill);
  color: var(--text-primary);
  font-size: 13px;
  padding: 0 12px;
  cursor: pointer;
}

.tab-btn.active {
  background: rgba(96, 205, 255, 0.12);
  border-color: var(--accent-default);
  color: var(--accent-default);
}

.env-chip {
  border: 1px solid var(--control-stroke);
  border-radius: 12px;
  height: 24px;
  line-height: 22px;
  padding: 0 10px;
  font-size: 12px;
}

.env-chip.ok {
  color: #79d98a;
}

.env-chip.bad {
  color: #ff9aa4;
}

.field-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-row {
  display: grid;
  grid-template-columns: 210px 1fr auto;
  gap: 8px;
  align-items: center;
}

.field-row.compact {
  grid-template-columns: 210px 220px;
}

.field-row label {
  color: var(--text-secondary);
  font-size: 13px;
}

.path-input {
  width: 100%;
}

.hint-line {
  font-size: 12px;
  color: var(--text-secondary);
}

.hint-line.warn {
  color: #ffca7a;
}

.check-line {
  display: flex;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.preview-area {
  width: 100%;
  min-height: 120px;
  background: #121212;
  color: #d9d9d9;
  border: 1px solid var(--control-stroke);
  border-radius: 6px;
  padding: 10px;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px;
  resize: vertical;
}

.action-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.outputs-box {
  margin-top: 12px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.terminal-wrap {
  min-height: 260px;
}

.terminal .info {
  color: #7ecbff;
}

.terminal .stdout {
  color: #d0d0d0;
  white-space: pre-wrap;
}

.terminal .stderr {
  color: #ff9aa4;
  white-space: pre-wrap;
}

.guide-box {
  margin-top: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.02);
}

.guide-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.guide-box ol {
  margin: 0;
  padding-left: 20px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}
</style>
