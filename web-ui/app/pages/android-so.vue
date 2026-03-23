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
            <button class="tab-btn" :class="{ active: activeTab === 'pushSo' }" @click="activeTab = 'pushSo'">4) Push SO</button>
            <button class="tab-btn" :class="{ active: activeTab === 'guideC' }" @click="activeTab = 'guideC'">5) Plan C APL Guide</button>
          </div>
        </div>
      </section>

      <section class="fluent-card">
        <div class="card-header">Project Root</div>
        <div class="card-body">
          <div class="field-grid">
            <div class="field-row">
              <label>Root Profile</label>
              <select v-model="projectRootDraft" class="fluent-select" @change="applyProjectRootChange(projectRootDraft)">
                <option v-for="root in projectRootOptions" :key="root" :value="root">{{ root }}</option>
              </select>
              <button class="fluent-btn sub" @click="pickFolder('projectRoot')">Browse</button>
            </div>
          </div>
        </div>
      </section>

      <section class="fluent-card">
        <div class="card-header">
          <span>Shared Paths</span>
          <div class="terminal-actions">
            <button class="fluent-btn sub" @click="togglePathSection">{{ collapsePathSection ? 'Expand' : 'Collapse' }}</button>
            <button class="fluent-btn sub" @click="refreshStatus">Refresh Status</button>
          </div>
        </div>
        <div class="card-body" v-if="!collapsePathSection">
          <div class="field-grid">
            <div class="field-row">
              <label>Project File (.uproject)</label>
              <input :value="sharedPaths.projectFile" class="fluent-input path-input" readonly />
            </div>
            <div class="field-row">
              <label>Engine Root</label>
              <input :value="sharedPaths.engineRoot" class="fluent-input path-input" readonly />
            </div>
            <div class="field-row">
              <label>UEAppTools.exe</label>
              <input :value="sharedPaths.ueAppToolsExe" class="fluent-input path-input" readonly />
            </div>
            <div class="field-row">
              <label>AndroidInject Dir</label>
              <input :value="sharedPaths.androidInjectDir" class="fluent-input path-input" readonly />
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
            <div class="field-row">
              <label>Build Log Path (optional)</label>
              <input v-model="settings.logPath" class="fluent-input path-input" :placeholder="defaultBuildLogPath" />
            </div>
            <div class="field-row compact">
              <label>Max Parallel Actions (optional)</label>
              <input v-model.number="settings.maxParallelActions" class="fluent-input" type="number" min="1" max="128" placeholder="8" />
            </div>
            <div class="hint-line">Build uses UnrealBuildTool direct mode (not UAT BuildCookRun).</div>
            <div class="hint-line">Shipping config will auto append <code>-ShippingDev</code>.</div>
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

          <div v-else-if="activeTab === 'pushSo'" class="field-grid">
            <div class="field-row">
              <label>SO Path</label>
              <input v-model="settings.soPath" class="fluent-input path-input" />
              <button class="fluent-btn sub" @click="pickFile('soPath', 'so')">Browse</button>
            </div>
            <div class="field-row">
              <label>Remote Path (dir or .so file)</label>
              <input v-model="settings.pushRemotePath" class="fluent-input path-input" placeholder="/data/local/tmp/" />
            </div>
            <label class="check-line">
              <input v-model="settings.pushUseRunAs" type="checkbox" />
              Use run-as (copy from /data/local/tmp into app sandbox path)
            </label>
            <div class="field-row" v-if="settings.pushUseRunAs">
              <label>Package Name</label>
              <input v-model="settings.pushPackageName" class="fluent-input path-input" placeholder="com.tencent.tmgp.pubgmhd" />
            </div>
            <div class="hint-line">SO will always be renamed to <code>libUE4.so</code> at target path.</div>
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

const LEGACY_STORAGE_KEY = 'cgtools_android_so_settings_v1'
const STORAGE_KEY = 'cgtools_android_so_profiles_v2'
const DEFAULT_PROJECT_ROOT = 'C:\\CJGame\\PRE418'
const SETTINGS_KEYS = [
  'projectRoot',
  'config',
  'arch',
  'logPath',
  'maxParallelActions',
  'apkPath',
  'soPath',
  'pushRemotePath',
  'pushUseRunAs',
  'pushPackageName',
  'showInstallHint',
  'packageName',
  'launchActivity',
  'aplLibraryName',
  'aplFailMessage',
]

const activeTab = ref('buildSo')
const isRunning = ref(false)
const collapsePathSection = ref(false)
const terminalEl = ref(null)
const logs = ref([])
const lastOutputs = ref(null)
const projectRootDraft = ref(DEFAULT_PROJECT_ROOT)
const projectRootOptions = ref([DEFAULT_PROJECT_ROOT])
let ws = null
let profileStore = { activeProjectRoot: '', profiles: {} }
let activeProjectRootKey = ''
let isApplyingSettings = false
let detectionRequestId = 0

const normalizeWindowsPath = (value) => String(value || '').trim().replace(/\//g, '\\')

const stripTrailingSeparators = (value) => {
  const normalized = normalizeWindowsPath(value)
  if (!normalized) return ''
  if (/^[A-Za-z]:\\?$/.test(normalized)) {
    return `${normalized.slice(0, 2)}\\`
  }
  return normalized.replace(/[\\]+$/, '')
}

const joinWindowsPath = (...parts) => {
  const cleanedParts = parts
    .map((part, index) => {
      const normalized = normalizeWindowsPath(part)
      if (!normalized) return ''
      if (index === 0) return stripTrailingSeparators(normalized)
      return normalized.replace(/^[\\]+|[\\]+$/g, '')
    })
    .filter(Boolean)

  return cleanedParts.reduce((acc, part, index) => {
    if (index === 0) return part
    return acc.endsWith('\\') ? `${acc}${part}` : `${acc}\\${part}`
  }, '')
}

const normalizeProjectRoot = (value) => stripTrailingSeparators(value) || DEFAULT_PROJECT_ROOT

const getProjectProfileKey = (value) => normalizeProjectRoot(value).toLowerCase()

const deriveSharedPaths = (projectRoot) => {
  const resolvedProjectRoot = normalizeProjectRoot(projectRoot)
  return {
    projectRoot: resolvedProjectRoot,
    projectFile: joinWindowsPath(resolvedProjectRoot, 'Survive', 'ShadowTrackerExtra.uproject'),
    engineRoot: joinWindowsPath(resolvedProjectRoot, 'UE4181', 'Engine'),
    ueAppToolsExe: joinWindowsPath(resolvedProjectRoot, 'Survive', 'Tools', 'UEAppTools', 'build', 'Release', 'UEAppTools.exe'),
    androidInjectDir: joinWindowsPath(resolvedProjectRoot, 'Survive', 'ExternalTools', 'AndroidInject'),
  }
}

const resolveProjectDir = (projectFile, projectRoot) => {
  if (projectFile) {
    return projectFile.replace(/[\\/][^\\/]+$/, '')
  }
  return normalizeProjectRoot(projectRoot)
}

const buildDefaultSoPath = (projectFile, arch, projectRoot) => {
  const projectDir = resolveProjectDir(projectFile, projectRoot)
  if (!projectDir) return ''
  return `${projectDir}\\Intermediate\\Android\\APK\\jni\\${arch || 'arm64-v8a'}\\libUE4.so`
}

const buildDefaultLogPath = (projectFile, config, arch, projectRoot) => {
  const projectDir = resolveProjectDir(projectFile, projectRoot)
  if (!projectDir) return ''
  return `${projectDir}\\Saved\\Logs\\Build\\AndroidSO_${config || 'Development'}_${arch || 'arm64-v8a'}.log`
}

const createDefaultSettings = (projectRoot = DEFAULT_PROJECT_ROOT) => {
  const sharedPaths = deriveSharedPaths(projectRoot)
  return {
    projectRoot: sharedPaths.projectRoot,
    config: 'Development',
    arch: 'arm64-v8a',
    logPath: '',
    maxParallelActions: null,
    apkPath: '',
    soPath: buildDefaultSoPath(sharedPaths.projectFile, 'arm64-v8a', sharedPaths.projectRoot),
    pushRemotePath: '/data/local/tmp/',
    pushUseRunAs: false,
    pushPackageName: 'com.tencent.tmgp.pubgmhd',
    showInstallHint: true,
    packageName: 'com.tencent.tmgp.pubgmhd',
    launchActivity: 'com.epicgames.ue4.SplashActivity',
    aplLibraryName: 'my_inject_lib',
    aplFailMessage: 'library not loaded and required',
  }
}

const defaultDetectedState = () => ({
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

const detected = reactive(defaultDetectedState())
const settings = reactive(createDefaultSettings(DEFAULT_PROJECT_ROOT))

const cloneSettings = () => {
  const snapshot = {}
  for (const key of SETTINGS_KEYS) {
    snapshot[key] = settings[key]
  }
  return snapshot
}

const sanitizeSettingsProfile = (profile, fallbackRoot = DEFAULT_PROJECT_ROOT) => {
  const resolvedProjectRoot = normalizeProjectRoot(profile?.projectRoot || fallbackRoot)
  const defaults = createDefaultSettings(resolvedProjectRoot)
  const sanitized = { ...defaults }

  if (profile && typeof profile === 'object') {
    for (const key of SETTINGS_KEYS) {
      if (profile[key] !== undefined) {
        sanitized[key] = profile[key]
      }
    }
  }

  sanitized.projectRoot = resolvedProjectRoot
  sanitized.soPath = sanitized.soPath || buildDefaultSoPath(deriveSharedPaths(resolvedProjectRoot).projectFile, sanitized.arch, sanitized.projectRoot)

  return sanitized
}

const syncProjectRootOptions = () => {
  const roots = Object.values(profileStore.profiles || {})
    .map((profile) => normalizeProjectRoot(profile?.projectRoot || ''))
    .filter(Boolean)

  if (!roots.includes(settings.projectRoot)) {
    roots.push(settings.projectRoot)
  }
  if (!roots.includes(DEFAULT_PROJECT_ROOT)) {
    roots.push(DEFAULT_PROJECT_ROOT)
  }

  projectRootOptions.value = [...new Set(roots)]
}

const persistProfileStore = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profileStore))
  syncProjectRootOptions()
}

const readLegacyProfileStore = () => {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const profile = sanitizeSettingsProfile(parsed, parsed?.projectRoot || DEFAULT_PROJECT_ROOT)
    return {
      activeProjectRoot: profile.projectRoot,
      profiles: {
        [getProjectProfileKey(profile.projectRoot)]: profile,
      },
    }
  } catch {
    return null
  }
}

const readProfileStore = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return readLegacyProfileStore() || { activeProjectRoot: '', profiles: {} }
    }

    const parsed = JSON.parse(raw)
    const nextStore = { activeProjectRoot: '', profiles: {} }

    if (parsed?.profiles && typeof parsed.profiles === 'object') {
      for (const profile of Object.values(parsed.profiles)) {
        if (!profile || typeof profile !== 'object') continue
        const sanitizedProfile = sanitizeSettingsProfile(profile, profile.projectRoot || DEFAULT_PROJECT_ROOT)
        nextStore.profiles[getProjectProfileKey(sanitizedProfile.projectRoot)] = sanitizedProfile
      }
    }

    nextStore.activeProjectRoot = typeof parsed?.activeProjectRoot === 'string'
      ? normalizeProjectRoot(parsed.activeProjectRoot)
      : ''

    if (!nextStore.activeProjectRoot) {
      const firstProfile = Object.values(nextStore.profiles)[0]
      nextStore.activeProjectRoot = firstProfile?.projectRoot || ''
    }

    return nextStore
  } catch {
    return readLegacyProfileStore() || { activeProjectRoot: '', profiles: {} }
  }
}

const applySettingsProfile = (profile) => {
  isApplyingSettings = true
  Object.assign(settings, sanitizeSettingsProfile(profile, profile.projectRoot || DEFAULT_PROJECT_ROOT))
  projectRootDraft.value = settings.projectRoot
  isApplyingSettings = false
}

const injectToolsReady = computed(() => detected.androidInjectDirExists && detected.injectDemoExists && detected.injectEntrySoExists)
const sharedPaths = computed(() => deriveSharedPaths(settings.projectRoot))
const defaultBuildLogPath = computed(() => buildDefaultLogPath(sharedPaths.value.projectFile, settings.config, settings.arch, settings.projectRoot))
const defaultSoPath = computed(() => buildDefaultSoPath(sharedPaths.value.projectFile, settings.arch, settings.projectRoot))

const quote = (text) => {
  if (!text) return '""'
  return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text
}

const archToUbtArg = (arch) => {
  if (arch === 'arm64-v8a') return '-arm64'
  if (arch === 'armeabi-v7a') return '-armv7'
  if (arch === 'x86_64') return '-x64'
  return ''
}

const expectedSoOutputPath = computed(() => defaultSoPath.value)

const aplSnippet = computed(() => {
  return `<soLoadLibrary>\n  <loadLibrary name="${settings.aplLibraryName}" failmsg="${settings.aplFailMessage}" />\n</soLoadLibrary>`
})

const commandPreview = computed(() => {
  if (activeTab.value === 'buildSo') {
    const projectFile = sharedPaths.value.projectFile
    const engineRoot = sharedPaths.value.engineRoot
    const ubtExe = `${engineRoot}\\Binaries\\DotNET\\UnrealBuildTool.exe`
    const targetName = projectFile ? projectFile.replace(/^.*[\\/]/, '').replace(/\.uproject$/i, '') : 'ShadowTrackerExtra'
    const projectDir = projectFile ? projectFile.replace(/[\\/][^\\/]+$/, '') : settings.projectRoot
    const shippingDevArg = settings.config === 'Shipping' ? ' -ShippingDev' : ''
    const archArg = archToUbtArg(settings.arch)
    const resolvedLogPath = settings.logPath?.trim() ? settings.logPath.trim() : defaultBuildLogPath.value
    const parallelArg = Number.isInteger(settings.maxParallelActions) && settings.maxParallelActions > 0 ? ` -MaxParallelActions=${settings.maxParallelActions}` : ''

    return `${quote(ubtExe)} ${targetName} Android ${settings.config} -Project=${quote(projectFile)} -NoUBTMakefiles -remoteini=${quote(projectDir)} -skipdeploy -BuildPipeline= ${archArg}${shippingDevArg} -forceframepointer -noxge${parallelArg} -log=${quote(resolvedLogPath)} -NoHotReload`
  }
  if (activeTab.value === 'replaceA') {
    return `${quote(sharedPaths.value.ueAppToolsExe)} -mode=replaceSo -platform=android -apkPath=${quote(settings.apkPath)} -soPath=${quote(settings.soPath)} -arch=${settings.arch}`
  }
  if (activeTab.value === 'injectB') {
    const comp = settings.launchActivity.includes('/') ? settings.launchActivity : `${settings.packageName}/${settings.launchActivity}`
    return [
      `adb push ${quote(sharedPaths.value.androidInjectDir + '\\inject_demo')} /data/local/tmp/`,
      `adb push ${quote(sharedPaths.value.androidInjectDir + '\\lib_inject_entry.so')} /data/local/tmp/`,
      `adb push ${quote(settings.soPath)} /data/local/tmp/libUE4.so`,
      `adb shell "run-as ${settings.packageName} sh -c 'cp /data/local/tmp/libUE4.so . && cp /data/local/tmp/inject_demo . && cp /data/local/tmp/lib_inject_entry.so . && chmod 777 ./inject_demo && chmod 777 ./lib_inject_entry.so'"`,
      `adb shell am start -n ${comp}`,
      `adb shell "run-as ${settings.packageName} sh -c './inject_demo ${settings.packageName} > /data/local/tmp/log_android_inject.txt'"`,
      'adb pull /data/local/tmp/log_android_inject.txt <local_path>',
    ].join('\n')
  }
  if (activeTab.value === 'pushSo') {
    const remotePath = settings.pushRemotePath?.trim() || '/data/local/tmp/'
    const normalized = remotePath.replace(/\\/g, '/')
    const remoteFile = normalized.endsWith('/')
      ? `${normalized}libUE4.so`
      : (normalized.toLowerCase().endsWith('.so') ? `${normalized.replace(/\/[^/]*$/, '')}/libUE4.so` : `${normalized}/libUE4.so`)
    if (settings.pushUseRunAs) {
      const packageName = settings.pushPackageName?.trim() || 'com.tencent.tmgp.pubgmhd'
      const remoteDir = remoteFile.replace(/\/[^/]*$/, '')
      return [
        `adb push ${quote(settings.soPath)} /data/local/tmp/libUE4.so`,
        `adb shell "run-as ${packageName} sh -c 'mkdir -p ${remoteDir} && cp /data/local/tmp/libUE4.so ${remoteFile} && ls -l ${remoteFile}'"`,
      ].join('\n')
    }
    return `adb push ${quote(settings.soPath)} ${quote(remoteFile)}`
  }
  return aplSnippet.value
})

const saveCurrentProfile = () => {
  if (isApplyingSettings) return

  const snapshot = sanitizeSettingsProfile(cloneSettings(), settings.projectRoot || DEFAULT_PROJECT_ROOT)
  activeProjectRootKey = getProjectProfileKey(snapshot.projectRoot)
  profileStore.activeProjectRoot = snapshot.projectRoot
  profileStore.profiles[activeProjectRootKey] = snapshot
  persistProfileStore()
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

const refreshProjectDetection = async (projectRoot) => {
  const requestId = ++detectionRequestId

  try {
    const data = await $fetch('/api/android-so/defaults', {
      query: { projectRoot: normalizeProjectRoot(projectRoot) },
    })

    if (requestId !== detectionRequestId) {
      return null
    }

    Object.assign(detected, defaultDetectedState(), data.detected || {})
    return data
  } catch (error) {
    appendLog('stderr', `[error] Failed to load defaults: ${error.message}\n`)
    return null
  }
}

const applyProjectRootChange = async (nextRoot, options = {}) => {
  const resolvedProjectRoot = normalizeProjectRoot(nextRoot || settings.projectRoot || DEFAULT_PROJECT_ROOT)
  const nextProfileKey = getProjectProfileKey(resolvedProjectRoot)

  if (activeProjectRootKey === nextProfileKey && !options.forceDefaults) {
    if (settings.projectRoot !== resolvedProjectRoot) {
      settings.projectRoot = resolvedProjectRoot
    }
    projectRootDraft.value = resolvedProjectRoot
    saveCurrentProfile()
    await refreshProjectDetection(resolvedProjectRoot)
    return
  }

  if (!options.skipSaveCurrent && activeProjectRootKey) {
    saveCurrentProfile()
  }

  activeProjectRootKey = nextProfileKey
  profileStore.activeProjectRoot = resolvedProjectRoot

  const nextProfile = options.forceDefaults
    ? createDefaultSettings(resolvedProjectRoot)
    : sanitizeSettingsProfile(
      profileStore.profiles[nextProfileKey] || createDefaultSettings(resolvedProjectRoot),
      resolvedProjectRoot,
    )

  nextProfile.projectRoot = resolvedProjectRoot
  applySettingsProfile(nextProfile)
  saveCurrentProfile()
  await refreshProjectDetection(resolvedProjectRoot)
}

const refreshStatus = async () => {
  await refreshProjectDetection(settings.projectRoot)
}

const togglePathSection = () => {
  collapsePathSection.value = !collapsePathSection.value
}

const pickFolder = async (key) => {
  try {
    const res = await $fetch('/api/system/folder')
    if (res.success && res.path) {
      if (key === 'projectRoot') {
        projectRootDraft.value = res.path
        await applyProjectRootChange(res.path)
        return
      }
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
      projectFile: sharedPaths.value.projectFile,
      engineRoot: sharedPaths.value.engineRoot,
      config: settings.config,
      arch: settings.arch,
      logPath: settings.logPath?.trim() || undefined,
      maxParallelActions: Number.isInteger(settings.maxParallelActions) && settings.maxParallelActions > 0 ? settings.maxParallelActions : undefined,
    }
  }
  if (activeTab.value === 'replaceA') {
    return {
      apkPath: settings.apkPath,
      soPath: settings.soPath,
      arch: settings.arch,
      ueAppToolsExe: sharedPaths.value.ueAppToolsExe,
      showInstallHint: settings.showInstallHint,
    }
  }
  if (activeTab.value === 'pushSo') {
    return {
      soPath: settings.soPath,
      remotePath: settings.pushRemotePath?.trim() || '/data/local/tmp/',
      useRunAs: settings.pushUseRunAs,
      packageName: settings.pushUseRunAs ? (settings.pushPackageName?.trim() || undefined) : undefined,
    }
  }
  return {
    packageName: settings.packageName,
    androidInjectDir: sharedPaths.value.androidInjectDir,
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

watch(
  () => [sharedPaths.value.projectFile, settings.arch, settings.projectRoot],
  ([projectFile, arch, projectRoot], previousValues) => {
    const [previousProjectFile = projectFile, previousArch = arch, previousProjectRoot = projectRoot] = previousValues || []
    const previousDefaultSoPath = buildDefaultSoPath(previousProjectFile, previousArch, previousProjectRoot)

    if (!settings.soPath || settings.soPath === previousDefaultSoPath) {
      settings.soPath = buildDefaultSoPath(projectFile, arch, projectRoot)
    }
  },
)

watch(settings, saveCurrentProfile, { deep: true })

onMounted(async () => {
  profileStore = readProfileStore()
  const initialProjectRoot = profileStore.activeProjectRoot || DEFAULT_PROJECT_ROOT
  await applyProjectRootChange(initialProjectRoot, { skipSaveCurrent: true })
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
