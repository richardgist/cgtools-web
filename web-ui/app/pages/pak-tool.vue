<template>
  <div class="page active" style="display: flex;">
    <div class="standard-page-header">
      <h1 class="header-title">Pak Tool</h1>
      <div class="header-controls">
        <div class="env-chip" :class="status?.detected?.exeExists ? 'ok' : 'bad'">
          exe: {{ status?.detected?.exeExists ? 'ok' : 'missing' }}
        </div>
        <div class="env-chip" :class="status?.detected?.toolDirExists ? 'ok' : 'bad'">
          dir: {{ status?.detected?.toolDirExists ? 'ok' : 'missing' }}
        </div>
      </div>
    </div>

    <div class="page-content-scroll">
      <section class="fluent-card">
        <div class="card-header">
          <span>工具路径</span>
          <button class="fluent-btn sub" :disabled="isRefreshing" @click="refreshStatus">
            {{ isRefreshing ? '刷新中' : '刷新' }}
          </button>
        </div>
        <div class="card-body">
          <div class="field-grid">
            <div class="field-row">
              <label>项目 Root</label>
              <input v-model="projectRoot" class="fluent-input path-input" />
              <button class="fluent-btn sub" :disabled="isLaunching" @click="pickProjectRoot">浏览</button>
            </div>
            <div class="field-row">
              <label>已保存 Root</label>
              <select v-model="selectedProjectRoot" class="fluent-select path-input" :disabled="isLaunching" @change="switchSavedProjectRoot">
                <option v-for="root in savedProjectRoots" :key="root" :value="root">{{ root }}</option>
              </select>
              <div class="inline-actions">
                <button class="fluent-btn sub" :disabled="isLaunching" @click="saveProjectRoot">保存</button>
                <button class="fluent-btn sub danger-text" :disabled="isLaunching || savedProjectRoots.length <= 1" @click="deleteSelectedProjectRoot">删除</button>
              </div>
            </div>
            <div class="field-row">
              <label>PakToolPlus.exe</label>
              <input :value="status?.exePath || derivedExePath" class="fluent-input path-input" readonly />
              <button class="fluent-btn sub" :disabled="!status?.detected?.exeExists" @click="openPath(status?.exePath, 'path')">打开</button>
            </div>
            <div class="field-row">
              <label>工具目录</label>
              <input :value="status?.toolDir || ''" class="fluent-input path-input" readonly />
              <button class="fluent-btn sub" :disabled="!status?.detected?.toolDirExists" @click="openPath(status?.toolDir, 'folder')">打开</button>
            </div>
            <div class="field-row">
              <label>输出目录</label>
              <input :value="status?.tempPaksDir || ''" class="fluent-input path-input" readonly />
              <button class="fluent-btn sub" :disabled="!status?.detected?.tempPaksDirExists" @click="openPath(status?.tempPaksDir, 'folder')">打开</button>
            </div>
            <div class="field-row">
              <label>源码入口</label>
              <input :value="status?.mainPyPath || ''" class="fluent-input path-input" readonly />
              <button class="fluent-btn sub" :disabled="!status?.detected?.mainPyExists" @click="openPath(status?.mainPyPath, 'path')">打开</button>
            </div>
          </div>
        </div>
      </section>

      <section class="fluent-card">
        <div class="card-header">操作</div>
        <div class="card-body">
          <div class="action-row">
            <button class="fluent-btn primary" :disabled="isLaunching || !status?.detected?.exeExists" @click="launchTool">
              {{ isLaunching ? '启动中' : '启动 PakToolPlus' }}
            </button>
            <button class="fluent-btn" :disabled="isLaunching" @click="resetDefault">恢复默认 Root</button>
          </div>
          <div class="push-panel">
            <div class="field-grid">
              <div class="field-row">
                <label>源 Pak</label>
                <input :value="status?.latestGeneratedPak?.sourcePakName || '未找到生成的 pak'" class="fluent-input path-input" readonly />
                <button class="fluent-btn sub" :disabled="!status?.detected?.tempPaksDirExists" @click="openPath(status?.tempPaksDir, 'folder')">打开目录</button>
              </div>
              <div class="field-row">
                <label>手机文件名</label>
                <input v-model="pakTargetName" class="fluent-input path-input" placeholder="例如 ui_1.37.0.12050.pak" />
                <div class="inline-actions">
                  <button class="fluent-btn sub" :disabled="!status?.latestGeneratedPak" @click="useSourcePakName">用源名称</button>
                  <button class="fluent-btn sub" :disabled="!canFetchRemoteVersion" @click="fetchRemoteVersion">
                    {{ isFetchingRemoteVersion ? '获取中' : '获取版本' }}
                  </button>
                </div>
              </div>
              <div class="field-row hint-row">
                <span></span>
                <div class="field-hint">推送时会固定补成 tex_patch_ 前缀；多个 pak 建议写成 tex_patch_用途_版本.pak，版本必须放最后。</div>
              </div>
              <div class="field-row">
                <label>包名</label>
                <input v-model="packageName" class="fluent-input path-input" placeholder="com.tencent.tmgp.pubgmhd" />
                <input v-model="deviceSerial" class="fluent-input device-input" placeholder="设备 serial，可空" />
              </div>
              <div class="field-row">
                <label>远端目录</label>
                <input :value="remoteSavedPaksDir" class="fluent-input path-input" readonly />
                <button class="fluent-btn primary" :disabled="!canPushPak" @click="pushRenamedPak">
                  {{ isPushingPak ? '推送中' : '重命名并推送' }}
                </button>
              </div>
            </div>
          </div>
          <div class="status-grid">
            <div class="status-item" :class="status?.detected?.projectRootExists ? 'ok' : 'bad'">
              <span>Project Root</span>
              <strong>{{ status?.detected?.projectRootExists ? 'ok' : 'missing' }}</strong>
            </div>
            <div class="status-item" :class="status?.detected?.windows ? 'ok' : 'bad'">
              <span>Windows</span>
              <strong>{{ status?.detected?.windows ? 'ok' : 'missing' }}</strong>
            </div>
            <div class="status-item" :class="status?.detected?.batExists ? 'ok' : 'warn'">
              <span>PakToolPlus.bat</span>
              <strong>{{ status?.detected?.batExists ? 'ok' : 'optional' }}</strong>
            </div>
            <div class="status-item" :class="status?.detected?.tempPaksDirExists ? 'ok' : 'warn'">
              <span>Temp/Paks</span>
              <strong>{{ status?.detected?.tempPaksDirExists ? 'ready' : 'after first run' }}</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="fluent-card terminal-wrap">
        <div class="card-header">
          <span>状态日志</span>
          <button class="fluent-btn sub" @click="logs = []">清空</button>
        </div>
        <div class="terminal">
          <div v-for="(line, idx) in logs" :key="idx" :class="line.type">{{ line.text }}</div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'

const DEFAULT_PROJECT_ROOT = 'E:\\CJGame\\trunk'
const DEFAULT_PACKAGE_NAME = 'com.tencent.tmgp.pubgmhd'
const DEFAULT_GAME_NAME = 'ShadowTrackerExtra'
const DEFAULT_PATCH_PREFIX = 'tex_patch_'
const LEGACY_STORAGE_KEY = 'cgtools_pak_tool_plus_exe_v1'
const SINGLE_ROOT_STORAGE_KEY = 'cgtools_pak_tool_project_root_v1'
const ROOT_STORE_KEY = 'cgtools_pak_tool_project_root_profiles_v1'
const PUSH_SETTINGS_KEY = 'cgtools_pak_tool_push_settings_v1'

const projectRoot = ref(DEFAULT_PROJECT_ROOT)
const selectedProjectRoot = ref(DEFAULT_PROJECT_ROOT)
const savedProjectRoots = ref([DEFAULT_PROJECT_ROOT])
const status = ref(null)
const logs = ref([])
const isRefreshing = ref(false)
const isLaunching = ref(false)
const isPushingPak = ref(false)
const isFetchingRemoteVersion = ref(false)
const pakTargetName = ref('tex_patch_0.0.0.0.pak')
const packageName = ref(DEFAULT_PACKAGE_NAME)
const deviceSerial = ref('')

const normalizeRoot = (value) => {
  const normalized = String(value || '').trim().replace(/\//g, '\\')
  if (!normalized) return DEFAULT_PROJECT_ROOT
  if (/^[A-Za-z]:\\?$/.test(normalized)) return `${normalized.slice(0, 2)}\\`
  return normalized.replace(/[\\]+$/, '')
}

const normalizedProjectRoot = computed(() => normalizeRoot(projectRoot.value))
const derivedExePath = computed(() => `${normalizedProjectRoot.value}\\Survive\\Paktools\\CookAndPakAssetPlus\\PakToolPlus.exe`)
const remoteSavedPaksDir = computed(() => {
  const resolvedPackageName = packageName.value.trim() || DEFAULT_PACKAGE_NAME
  return `/sdcard/Android/data/${resolvedPackageName}/files/UE4Game/${DEFAULT_GAME_NAME}/${DEFAULT_GAME_NAME}/Saved/Paks`
})
const canPushPak = computed(() => {
  return !isPushingPak.value
    && !!status.value?.latestGeneratedPak
    && !!pakTargetName.value.trim()
    && !!packageName.value.trim()
})
const canFetchRemoteVersion = computed(() => {
  return !isFetchingRemoteVersion.value
    && !!packageName.value.trim()
})

const uniqueRoots = (roots) => {
  const seen = new Set()
  const result = []
  for (const root of roots) {
    const normalized = normalizeRoot(root)
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

const persistProjectRootStore = (activeRoot = normalizedProjectRoot.value) => {
  const activeProjectRoot = normalizeRoot(activeRoot)
  const projectRoots = uniqueRoots([activeProjectRoot, ...savedProjectRoots.value, DEFAULT_PROJECT_ROOT])
  savedProjectRoots.value = projectRoots
  selectedProjectRoot.value = activeProjectRoot
  localStorage.setItem(SINGLE_ROOT_STORAGE_KEY, activeProjectRoot)
  localStorage.setItem(ROOT_STORE_KEY, JSON.stringify({ activeProjectRoot, projectRoots }))
}

const appendLog = (type, text) => {
  logs.value.push({ type, text })
}

const getErrorMessage = (error, fallback = '未知错误') => {
  return error?.data?.statusMessage || error?.statusMessage || error?.message || fallback
}

const refreshStatus = async () => {
  isRefreshing.value = true
  try {
    status.value = await $fetch('/api/pak-tool/defaults', {
      query: { projectRoot: normalizedProjectRoot.value },
    })
    persistProjectRootStore(status.value.projectRoot)
    if (status.value.latestGeneratedPak && !pakTargetName.value.trim()) {
      pakTargetName.value = status.value.latestGeneratedPak.sourcePakName
    }
    appendLog('info', `[info] 已刷新：${status.value.projectRoot}\n`)
  } catch (error) {
    appendLog('stderr', `[error] 刷新失败：${getErrorMessage(error)}\n`)
  } finally {
    isRefreshing.value = false
  }
}

const pickProjectRoot = async () => {
  try {
    const res = await $fetch('/api/system/folder')
    if (res?.success && res.path) {
      projectRoot.value = res.path
      saveProjectRoot({ silent: true })
      await refreshStatus()
    }
  } catch (error) {
    appendLog('stderr', `[error] 选择目录失败：${getErrorMessage(error)}\n`)
  }
}

const openPath = async (path, mode) => {
  if (!path) return
  try {
    const res = await $fetch('/api/system/open', {
      method: 'POST',
      body: { path, mode },
    })
    appendLog(res?.success ? 'info' : 'stderr', res?.success
      ? `[info] 已打开：${res.path || path}\n`
      : `[error] 打开失败：${res?.error || path}\n`)
  } catch (error) {
    appendLog('stderr', `[error] 打开失败：${getErrorMessage(error)}\n`)
  }
}

const formatTexPatchName = (fileName) => {
  const sourceName = String(fileName || '0.0.0.0.pak').trim()
  const baseName = sourceName.replace(/\.pak$/i, '').replace(/\.sig$/i, '')
  const suffix = baseName.replace(/^(?:game|core|tex|test)_patch_/i, '') || '0.0.0.0'
  return `${DEFAULT_PATCH_PREFIX}${suffix}.pak`
}

const launchTool = async () => {
  isLaunching.value = true
  try {
    const res = await $fetch('/api/pak-tool/launch', {
      method: 'POST',
      body: { projectRoot: normalizedProjectRoot.value },
    })
    if (res?.success) {
      appendLog('info', `[start] PakToolPlus 已启动 pid=${res.pid || '-'}\n`)
    } else {
      appendLog('stderr', `[error] 启动失败：${res?.error || '未知错误'}\n`)
    }
  } catch (error) {
    appendLog('stderr', `[error] 启动失败：${getErrorMessage(error)}\n`)
  } finally {
    isLaunching.value = false
  }
}

const useSourcePakName = () => {
  if (status.value?.latestGeneratedPak?.sourcePakName) {
    pakTargetName.value = formatTexPatchName(status.value.latestGeneratedPak.sourcePakName)
  }
}

const applyVersionToPakName = (fileName, version) => {
  const sourceName = formatTexPatchName(fileName || status.value?.latestGeneratedPak?.sourcePakName || '0.0.0.0.pak')
  const baseName = sourceName.replace(/\.pak$/i, '')
  const nextBaseName = /\d+\.\d+\.\d+\.\d+/.test(baseName)
    ? baseName.replace(/\d+\.\d+\.\d+\.\d+/g, version)
    : `${baseName}_${version}`
  return `${nextBaseName}.pak`
}

const fetchRemoteVersion = async () => {
  isFetchingRemoteVersion.value = true
  try {
    const res = await $fetch('/api/pak-tool/remote-version', {
      method: 'POST',
      body: {
        packageName: packageName.value,
        gameName: DEFAULT_GAME_NAME,
        deviceSerial: deviceSerial.value,
      },
    })
    const selectedVersion = res.selectedVersion || res.latestVersion
    const selectedCount = Array.isArray(res.versions) ? res.versions.find((item) => item.version === selectedVersion)?.count : 0
    pakTargetName.value = applyVersionToPakName(pakTargetName.value, selectedVersion)
    appendLog('info', `[version] 手机 ${res.remoteDir} 出现最多版本：${selectedVersion}（${selectedCount || '-'} 个 pak），已回填：${pakTargetName.value}\n`)
    const pakFiles = Array.isArray(res.pakFiles) ? res.pakFiles : []
    appendLog('info', pakFiles.length
      ? `[version] 已读取到 ${pakFiles.length} 个 pak：\n${pakFiles.map((name) => `  ${name}`).join('\n')}\n`
      : '[version] Saved/Paks 下没有读取到 pak 文件。\n')
  } catch (error) {
    appendLog('stderr', `[error] 获取手机版本失败：${getErrorMessage(error)}\n`)
  } finally {
    isFetchingRemoteVersion.value = false
  }
}

const formatStepResult = (result) => {
  const stdout = result.stdout ? `\n${result.stdout.trimEnd()}` : ''
  const stderr = result.stderr ? `\n${result.stderr.trimEnd()}` : ''
  return `[step] ${result.name} exitCode=${result.code}${stdout}${stderr}\n`
}

const pushRenamedPak = async () => {
  isPushingPak.value = true
  try {
    const res = await $fetch('/api/pak-tool/push', {
      method: 'POST',
      body: {
        projectRoot: normalizedProjectRoot.value,
        targetPakName: pakTargetName.value,
        packageName: packageName.value,
        gameName: DEFAULT_GAME_NAME,
        deviceSerial: deviceSerial.value,
      },
    })

    appendLog('info', `[push] ${res.sourcePakName} -> ${res.remoteDir}/${res.targetPakName}\n`)
    for (const result of res.results || []) {
      appendLog(result.code === 0 ? 'info' : 'stderr', formatStepResult(result))
    }
    appendLog(res.success ? 'info' : 'stderr', res.success ? '[push] 推送完成。\n' : `[push] 推送失败 exitCode=${res.exitCode}\n`)
  } catch (error) {
    appendLog('stderr', `[error] 推送失败：${getErrorMessage(error)}\n`)
  } finally {
    isPushingPak.value = false
  }
}

const resetDefault = async () => {
  projectRoot.value = DEFAULT_PROJECT_ROOT
  saveProjectRoot({ silent: true })
  await refreshStatus()
}

const inferProjectRootFromLegacyExe = (exePath) => {
  const marker = '\\Survive\\Paktools\\CookAndPakAssetPlus\\PakToolPlus.exe'
  const normalized = String(exePath || '').trim().replace(/\//g, '\\')
  if (normalized.toLowerCase().endsWith(marker.toLowerCase())) {
    return normalized.slice(0, -marker.length)
  }
  return ''
}

const readProjectRootStore = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROOT_STORE_KEY) || '{}')
    const storedRoots = Array.isArray(parsed.projectRoots) ? parsed.projectRoots : []
    const storedActiveRoot = typeof parsed.activeProjectRoot === 'string' ? parsed.activeProjectRoot : ''
    const singleRoot = localStorage.getItem(SINGLE_ROOT_STORAGE_KEY) || ''
    const legacyRoot = inferProjectRootFromLegacyExe(localStorage.getItem(LEGACY_STORAGE_KEY))
    const activeProjectRoot = normalizeRoot(storedActiveRoot || singleRoot || legacyRoot || DEFAULT_PROJECT_ROOT)
    const projectRoots = uniqueRoots([activeProjectRoot, ...storedRoots, singleRoot, legacyRoot, DEFAULT_PROJECT_ROOT].filter(Boolean))
    return { activeProjectRoot, projectRoots }
  } catch {
    const singleRoot = localStorage.getItem(SINGLE_ROOT_STORAGE_KEY) || ''
    const legacyRoot = inferProjectRootFromLegacyExe(localStorage.getItem(LEGACY_STORAGE_KEY))
    const activeProjectRoot = normalizeRoot(singleRoot || legacyRoot || DEFAULT_PROJECT_ROOT)
    return {
      activeProjectRoot,
      projectRoots: uniqueRoots([activeProjectRoot, DEFAULT_PROJECT_ROOT]),
    }
  }
}

const saveProjectRoot = (options = {}) => {
  persistProjectRootStore(normalizedProjectRoot.value)
  if (!options.silent) {
    appendLog('info', `[info] 已保存 Root：${normalizedProjectRoot.value}\n`)
  }
}

const switchSavedProjectRoot = async () => {
  if (!selectedProjectRoot.value) return
  projectRoot.value = selectedProjectRoot.value
  persistProjectRootStore(selectedProjectRoot.value)
  await refreshStatus()
}

const deleteSelectedProjectRoot = async () => {
  const deleteRoot = normalizeRoot(selectedProjectRoot.value)
  const nextRoots = savedProjectRoots.value.filter((root) => root.toLowerCase() !== deleteRoot.toLowerCase())
  savedProjectRoots.value = nextRoots.length ? nextRoots : [DEFAULT_PROJECT_ROOT]
  const nextRoot = savedProjectRoots.value[0]
  projectRoot.value = nextRoot
  persistProjectRootStore(nextRoot)
  appendLog('info', `[info] 已删除 Root：${deleteRoot}\n`)
  await refreshStatus()
}

watch(projectRoot, (value) => {
  localStorage.setItem(SINGLE_ROOT_STORAGE_KEY, normalizeRoot(value))
})

watch([pakTargetName, packageName, deviceSerial], () => {
  localStorage.setItem(PUSH_SETTINGS_KEY, JSON.stringify({
    pakTargetName: pakTargetName.value,
    packageName: packageName.value,
    deviceSerial: deviceSerial.value,
  }))
})

onMounted(async () => {
  try {
    const pushSettings = JSON.parse(localStorage.getItem(PUSH_SETTINGS_KEY) || '{}')
    if (typeof pushSettings.pakTargetName === 'string') pakTargetName.value = pushSettings.pakTargetName
    if (typeof pushSettings.packageName === 'string') packageName.value = pushSettings.packageName
    if (typeof pushSettings.deviceSerial === 'string') deviceSerial.value = pushSettings.deviceSerial
  } catch {}

  const store = readProjectRootStore()
  savedProjectRoots.value = store.projectRoots
  selectedProjectRoot.value = store.activeProjectRoot
  projectRoot.value = store.activeProjectRoot
  persistProjectRootStore(store.activeProjectRoot)
  await refreshStatus()
})
</script>

<style scoped>
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
  grid-template-columns: 150px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.field-row label {
  color: var(--text-secondary);
  font-size: 13px;
}

.hint-row {
  grid-template-columns: 150px minmax(0, 1fr);
}

.field-hint {
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.path-input {
  width: 100%;
  min-width: 0;
}

.inline-actions {
  display: inline-flex;
  gap: 6px;
  justify-content: flex-end;
}

.push-panel {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.device-input {
  width: 220px;
  min-width: 0;
}

.danger-text {
  color: #ff9aa4;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.status-item {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.status-item span {
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-item strong {
  color: var(--text-primary);
  font-size: 12px;
  white-space: nowrap;
}

.status-item.ok strong {
  color: #79d98a;
}

.status-item.warn strong {
  color: #ffca7a;
}

.status-item.bad strong {
  color: #ff9aa4;
}

.terminal-wrap {
  min-height: 240px;
}

.terminal {
  min-height: 180px;
  padding: 12px 14px;
  background: #101010;
  color: #d0d0d0;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  user-select: text;
  white-space: pre-wrap;
}

.terminal .info {
  color: #7ecbff;
}

.terminal .stderr {
  color: #ff9aa4;
}

@media (max-width: 900px) {
  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>
