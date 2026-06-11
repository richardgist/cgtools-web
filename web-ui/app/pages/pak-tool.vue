<template>
  <div class="page active" style="display: flex;">
    <div class="standard-page-header">
      <h1 class="header-title">Pak Tool</h1>
      <div class="header-controls">
        <div class="env-chip" :class="status?.detected?.exeExists ? 'ok' : 'bad'">
          entry: {{ status?.detected?.exeExists ? 'ok' : 'missing' }}
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
              <label>启动入口</label>
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
              {{ isLaunching ? '启动中' : '启动 CookAndPakAsset' }}
            </button>
            <button class="fluent-btn" :disabled="isLaunching" @click="resetDefault">恢复默认 Root</button>
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
              <span>Do.bat</span>
              <strong>{{ status?.detected?.batExists ? 'ok' : 'optional' }}</strong>
            </div>
            <div class="status-item" :class="status?.detected?.tempPaksDirExists ? 'ok' : 'warn'">
              <span>Temp/Paks</span>
              <strong>{{ status?.detected?.tempPaksDirExists ? 'ready' : 'after first run' }}</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="fluent-card">
        <div class="card-header">
          <span>Pak 推送</span>
          <div class="inline-actions">
            <button class="fluent-btn sub" :disabled="!canFetchRemoteVersion" @click="fetchRemoteVersion">
              {{ isFetchingRemoteVersion ? '获取中' : '获取版本' }}
            </button>
            <button class="fluent-btn sub" :disabled="isBusyWithPak" @click="clearPakSelections">清空选择</button>
          </div>
        </div>
        <div class="card-body">
          <div class="field-grid">
            <div class="field-row">
              <label>包名</label>
              <input v-model="packageName" class="fluent-input path-input" placeholder="com.tencent.tmgp.pubgmhd" />
              <input v-model="deviceSerial" class="fluent-input device-input" placeholder="设备 serial，可空" />
            </div>
            <div class="field-row">
              <label>远端目录</label>
              <input :value="remoteSavedPaksDir" class="fluent-input path-input" readonly />
              <button class="fluent-btn sub" :disabled="isLoadingRemoteList || !packageName.trim()" @click="fetchRemotePakList">
                {{ isLoadingRemoteList ? '读取中' : '读取手机列表' }}
              </button>
            </div>
            <div class="field-row">
              <label>单文件目标名</label>
              <input v-model="pakTargetName" class="fluent-input path-input" placeholder="例如 game_patch_1.37.0.12050.pak" />
              <div class="inline-actions">
                <button class="fluent-btn sub" :disabled="!status?.latestGeneratedPak" @click="useSourcePakName">用源名称</button>
              </div>
            </div>
            <div class="field-row hint-row">
              <span></span>
              <div class="field-hint">只选 1 个本地 Pak 时会使用上面的目标名；多选或拖拽时优先保留 game/core/tex_patch_ 类型，无前缀时默认补 game_patch_。若同目录存在同名 .sig，会一起推送。</div>
            </div>
          </div>

          <div class="push-layout">
            <div class="push-column">
              <div class="panel-title">
                <span>直接拖拽推送</span>
                <button class="fluent-btn sub" :disabled="!droppedFiles.length || isPushingDroppedPaks" @click="droppedFiles = []">清空</button>
              </div>
              <div
                class="pak-drop-zone"
                :class="{ active: isDragOver, disabled: isBusyWithPak }"
                @dragover.prevent="onDragOver"
                @dragleave.prevent="onDragLeave"
                @drop.prevent="onDropPakFiles"
              >
                <div class="drop-mark">PAK</div>
                <div class="drop-copy">
                  <strong>{{ isDragOver ? '松开后加入推送列表' : '把 .pak 文件拖到这里' }}</strong>
                  <span>可同时拖入多个 Pak；同名 .sig 一起拖入时会自动配对。</span>
                </div>
              </div>
              <div class="pak-list compact-list" v-if="droppedPakFiles.length">
                <div v-for="file in droppedPakFiles" :key="file.name" class="pak-list-row">
                  <div class="pak-name">{{ file.name }}</div>
                  <div class="pak-meta" :class="file.hasSig ? 'sig-ok' : 'sig-missing'">
                    {{ file.hasSig ? '+sig' : 'no sig' }} · {{ formatBytes(file.size) }}
                  </div>
                </div>
              </div>
              <div v-else class="empty-state">尚未拖入 Pak。</div>
              <button class="fluent-btn primary full-width" :disabled="!canPushDroppedPaks" @click="pushDroppedPaks">
                {{ isPushingDroppedPaks ? '推送中' : droppedPushButtonText }}
              </button>
            </div>

            <div class="push-column">
              <div class="panel-title">
                <span>目录选择推送</span>
                <div class="inline-actions">
                  <button class="fluent-btn sub plus-btn" :disabled="isBusyWithPak" @click="pickPakDirectory">+</button>
                  <button class="fluent-btn sub" :disabled="!localPakDirectory || isLoadingLocalPaks" @click="loadLocalPakDirectory">
                    {{ isLoadingLocalPaks ? '扫描中' : '重扫' }}
                  </button>
                </div>
              </div>
              <div class="directory-line">
                <span>{{ localPakDirectory || status?.tempPaksDir || '未选择目录' }}</span>
              </div>
              <div class="selection-tools">
                <button class="fluent-btn sub" :disabled="!availableLocalPaks.length" @click="selectAllLocalPaks">全选</button>
                <button class="fluent-btn sub" :disabled="!selectedLocalPakPaths.length" @click="selectedLocalPakPaths = []">取消</button>
                <button class="fluent-btn sub" :disabled="!status?.latestGeneratedPak" @click="selectLatestGeneratedPak">选择最新生成</button>
              </div>
              <div class="pak-list selectable-list" v-if="availableLocalPaks.length">
                <label v-for="file in availableLocalPaks" :key="file.path" class="pak-check-row">
                  <input v-model="selectedLocalPakPaths" type="checkbox" :value="file.path" />
                  <div class="pak-name">{{ file.name }}</div>
                  <div class="pak-meta">{{ file.hasSig ? 'sig' : 'no sig' }}</div>
                </label>
              </div>
              <div v-else class="empty-state">目录中没有可选 Pak。</div>
              <button class="fluent-btn primary full-width" :disabled="!canPushSelectedLocalPaks" @click="pushSelectedLocalPaks">
                {{ isPushingLocalPaks ? '推送中' : `推送选中的 ${selectedLocalPakFiles.length || 0} 个 Pak` }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="fluent-card">
        <div class="card-header">
          <span>手机 Pak 列表</span>
          <div class="inline-actions">
            <button class="fluent-btn sub" :disabled="isLoadingRemoteList || !packageName.trim()" @click="fetchRemotePakList">
              {{ isLoadingRemoteList ? '读取中' : '刷新列表' }}
            </button>
            <button class="fluent-btn danger" :disabled="!canDeleteRemotePaks" @click="deleteSelectedRemotePaks">
              {{ isDeletingRemotePaks ? '删除中' : `删除选中 ${selectedRemotePakNames.length || 0}` }}
            </button>
          </div>
        </div>
        <div class="card-body">
          <div v-if="remotePakFiles.length" class="remote-list">
            <label v-for="name in remotePakFiles" :key="name" class="pak-check-row remote">
              <input v-model="selectedRemotePakNames" type="checkbox" :value="name" />
              <button class="pak-name copy-name" type="button" title="复制 Pak 名称" @click.stop="copyPakName(name)">
                {{ name }}
              </button>
              <div class="pak-meta">{{ parsePakVersion(name) || '-' }}</div>
            </label>
          </div>
          <div v-else class="empty-state">还没有读取手机 Pak 列表。</div>
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
const DEFAULT_PATCH_PREFIX = 'game_patch_'
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
const pakTargetName = ref('game_patch_0.0.0.0.pak')
const packageName = ref(DEFAULT_PACKAGE_NAME)
const deviceSerial = ref('')

const isDragOver = ref(false)
const droppedFiles = ref([])
const localPakDirectory = ref('')
const localPakFiles = ref([])
const selectedLocalPakPaths = ref([])
const remotePakFiles = ref([])
const selectedRemotePakNames = ref([])
const isLoadingLocalPaks = ref(false)
const isPushingLocalPaks = ref(false)
const isPushingDroppedPaks = ref(false)
const isLoadingRemoteList = ref(false)
const isDeletingRemotePaks = ref(false)

const normalizeRoot = (value) => {
  const normalized = String(value || '').trim().replace(/\//g, '\\')
  if (!normalized) return DEFAULT_PROJECT_ROOT
  if (/^[A-Za-z]:\\?$/.test(normalized)) return `${normalized.slice(0, 2)}\\`
  return normalized.replace(/[\\]+$/, '')
}

const normalizedProjectRoot = computed(() => normalizeRoot(projectRoot.value))
const derivedExePath = computed(() => `${normalizedProjectRoot.value}\\Survive\\Paktools\\CookAndPakAsset\\Do.bat`)
const remoteSavedPaksDir = computed(() => {
  const resolvedPackageName = packageName.value.trim() || DEFAULT_PACKAGE_NAME
  return `/sdcard/Android/data/${resolvedPackageName}/files/UE4Game/${DEFAULT_GAME_NAME}/${DEFAULT_GAME_NAME}/Saved/Paks`
})
const canFetchRemoteVersion = computed(() => {
  return !isFetchingRemoteVersion.value
    && !!packageName.value.trim()
})
const isBusyWithPak = computed(() => {
  return isPushingPak.value
    || isPushingLocalPaks.value
    || isPushingDroppedPaks.value
    || isDeletingRemotePaks.value
})
const latestGeneratedPakItem = computed(() => {
  const latest = status.value?.latestGeneratedPak
  if (!latest?.pakPath) return null
  return {
    name: latest.sourcePakName,
    path: latest.pakPath,
    size: 0,
    mtimeMs: 0,
    hasSig: true,
    source: 'latest',
  }
})
const availableLocalPaks = computed(() => {
  const seen = new Set()
  const result = []
  const add = (file) => {
    if (!file?.path) return
    const key = file.path.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    result.push(file)
  }
  add(latestGeneratedPakItem.value)
  for (const file of localPakFiles.value) add({ ...file, source: 'directory' })
  return result
})
const selectedLocalPakFiles = computed(() => {
  const selected = new Set(selectedLocalPakPaths.value.map((item) => String(item).toLowerCase()))
  return availableLocalPaks.value.filter((file) => selected.has(file.path.toLowerCase()))
})
const droppedPakFiles = computed(() => {
  const sigNames = new Set(
    droppedFiles.value
      .filter((file) => file.name.toLowerCase().endsWith('.sig'))
      .map((file) => file.name.toLowerCase()),
  )
  return droppedFiles.value
    .filter((file) => file.name.toLowerCase().endsWith('.pak'))
    .map((file) => ({
      name: file.name,
      size: file.size,
      hasSig: sigNames.has(`${file.name.replace(/\.pak$/i, '')}.sig`.toLowerCase()),
    }))
})
const droppedSigCount = computed(() => droppedPakFiles.value.filter((file) => file.hasSig).length)
const droppedPushButtonText = computed(() => {
  const pakCount = droppedPakFiles.value.length || 0
  const sigCount = droppedSigCount.value
  return sigCount > 0
    ? `推送拖拽的 ${pakCount} 个 Pak（含 ${sigCount} 个 sig）`
    : `推送拖拽的 ${pakCount} 个 Pak`
})
const canPushSelectedLocalPaks = computed(() => {
  return !isPushingLocalPaks.value
    && selectedLocalPakFiles.value.length > 0
    && !!packageName.value.trim()
})
const canPushDroppedPaks = computed(() => {
  return !isPushingDroppedPaks.value
    && droppedPakFiles.value.length > 0
    && !!packageName.value.trim()
})
const canDeleteRemotePaks = computed(() => {
  return !isDeletingRemotePaks.value
    && selectedRemotePakNames.value.length > 0
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

const copyText = async (text) => {
  const value = String(text || '')
  if (!value) return false
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return true
  }

  if (typeof document === 'undefined') {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  return copied
}

const copyPakName = async (name) => {
  try {
    const copied = await copyText(name)
    appendLog(copied ? 'info' : 'stderr', copied
      ? `[copy] 已复制 Pak 名称：${name}\n`
      : `[copy] 复制失败：${name}\n`)
  } catch (error) {
    appendLog('stderr', `[copy] 复制失败：${getErrorMessage(error)}\n`)
  }
}

const getErrorMessage = (error, fallback = '未知错误') => {
  return error?.data?.statusMessage || error?.statusMessage || error?.message || fallback
}

const formatBytes = (value) => {
  const size = Number(value || 0)
  if (size <= 0) return '-'
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const parsePakVersion = (fileName) => {
  const matches = [...String(fileName || '').matchAll(/(\d+\.\d+\.\d+\.\d+)/g)]
  return matches.at(-1)?.[1] || ''
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
    const res = await $fetch('/api/system/folder', {
      query: { path: normalizedProjectRoot.value },
    })
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

const formatMountablePatchName = (fileName) => {
  const sourceName = String(fileName || '0.0.0.0.pak').trim()
  const baseName = sourceName.replace(/\.pak$/i, '').replace(/\.sig$/i, '')
  if (/^(?:game|core|tex)_patch_/i.test(baseName)) {
    return `${baseName}.pak`
  }
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
      appendLog('info', `[start] CookAndPakAsset 已启动 pid=${res.pid || '-'}\n`)
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
    pakTargetName.value = formatMountablePatchName(status.value.latestGeneratedPak.sourcePakName)
  }
}

const applyVersionToPakName = (fileName, version) => {
  const sourceName = formatMountablePatchName(fileName || status.value?.latestGeneratedPak?.sourcePakName || '0.0.0.0.pak')
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
    remotePakFiles.value = Array.isArray(res.pakFiles) ? res.pakFiles : []
    appendLog('info', `[version] 手机 ${res.remoteDir} 出现最多版本：${selectedVersion}（${selectedCount || '-'} 个 pak），已回填：${pakTargetName.value}\n`)
    appendLog('info', remotePakFiles.value.length
      ? `[version] 已读取到 ${remotePakFiles.value.length} 个 pak：\n${remotePakFiles.value.map((name) => `  ${name}`).join('\n')}\n`
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

const appendPushResults = (res) => {
  const files = Array.isArray(res.files) ? res.files : []
  if (files.length) {
    appendLog('info', `[push] ${files.length} 个 Pak -> ${res.remoteDir}\n${files.map((file) => {
      const sigText = file.hasSig && file.sourceSigName && file.targetSigName
        ? `\n  ${file.sourceSigName} -> ${file.targetSigName}`
        : ''
      return `  ${file.sourcePakName} -> ${file.targetPakName}${sigText}`
    }).join('\n')}\n`)
  } else {
    appendLog('info', `[push] ${res.sourcePakName} -> ${res.remoteDir}/${res.targetPakName}\n`)
  }
  for (const result of res.results || []) {
    appendLog(result.code === 0 ? 'info' : 'stderr', formatStepResult(result))
  }
  appendLog(res.success ? 'info' : 'stderr', res.success ? '[push] 推送完成。\n' : `[push] 推送失败 exitCode=${res.exitCode}\n`)
}

const pushSelectedLocalPaks = async () => {
  isPushingLocalPaks.value = true
  try {
    const selected = selectedLocalPakFiles.value
    const singleTargetName = selected.length === 1 ? pakTargetName.value : ''
    const res = await $fetch('/api/pak-tool/push-files', {
      method: 'POST',
      body: {
        files: selected.map((file) => ({
          path: file.path,
          targetPakName: singleTargetName || undefined,
        })),
        packageName: packageName.value,
        gameName: DEFAULT_GAME_NAME,
        deviceSerial: deviceSerial.value,
      },
    })

    appendPushResults(res)
    if (res.success) await fetchRemotePakList({ silent: true })
  } catch (error) {
    appendLog('stderr', `[error] 推送失败：${getErrorMessage(error)}\n`)
  } finally {
    isPushingLocalPaks.value = false
  }
}

const pushDroppedPaks = async () => {
  isPushingDroppedPaks.value = true
  try {
    const form = new FormData()
    for (const file of droppedFiles.value) {
      if (/\.(pak|sig)$/i.test(file.name)) {
        form.append('files', file, file.name)
      }
    }
    form.append('packageName', packageName.value)
    form.append('gameName', DEFAULT_GAME_NAME)
    form.append('deviceSerial', deviceSerial.value)

    const res = await $fetch('/api/pak-tool/push-upload', {
      method: 'POST',
      body: form,
    })

    appendPushResults(res)
    if (res.success) {
      droppedFiles.value = []
      await fetchRemotePakList({ silent: true })
    }
  } catch (error) {
    appendLog('stderr', `[error] 拖拽 Pak 推送失败：${getErrorMessage(error)}\n`)
  } finally {
    isPushingDroppedPaks.value = false
  }
}

const pickPakDirectory = async () => {
  try {
    const res = await $fetch('/api/system/folder', {
      query: { path: localPakDirectory.value || status.value?.tempPaksDir || normalizedProjectRoot.value },
    })
    if (res?.success && res.path) {
      localPakDirectory.value = res.path
      await loadLocalPakDirectory()
    }
  } catch (error) {
    appendLog('stderr', `[error] 选择 Pak 目录失败：${getErrorMessage(error)}\n`)
  }
}

const loadLocalPakDirectory = async () => {
  const directory = localPakDirectory.value || status.value?.tempPaksDir
  if (!directory) return
  isLoadingLocalPaks.value = true
  try {
    const res = await $fetch('/api/pak-tool/local-paks', {
      method: 'POST',
      body: { directory },
    })
    localPakDirectory.value = res.directory || directory
    localPakFiles.value = Array.isArray(res.files) ? res.files : []
    selectedLocalPakPaths.value = selectedLocalPakPaths.value.filter((selectedPath) => {
      return availableLocalPaks.value.some((file) => file.path.toLowerCase() === String(selectedPath).toLowerCase())
    })
    appendLog('info', `[local] ${localPakDirectory.value} 扫描到 ${localPakFiles.value.length} 个 Pak。\n`)
  } catch (error) {
    appendLog('stderr', `[error] 扫描 Pak 目录失败：${getErrorMessage(error)}\n`)
  } finally {
    isLoadingLocalPaks.value = false
  }
}

const selectAllLocalPaks = () => {
  selectedLocalPakPaths.value = availableLocalPaks.value.map((file) => file.path)
}

const selectLatestGeneratedPak = () => {
  const latest = latestGeneratedPakItem.value
  if (!latest) return
  selectedLocalPakPaths.value = [latest.path]
  pakTargetName.value = formatMountablePatchName(latest.name)
}

const fetchRemotePakList = async (options = {}) => {
  isLoadingRemoteList.value = true
  try {
    const res = await $fetch('/api/pak-tool/remote-list', {
      method: 'POST',
      body: {
        packageName: packageName.value,
        gameName: DEFAULT_GAME_NAME,
        deviceSerial: deviceSerial.value,
      },
    })
    remotePakFiles.value = Array.isArray(res.pakFiles) ? res.pakFiles : []
    selectedRemotePakNames.value = selectedRemotePakNames.value.filter((name) => remotePakFiles.value.includes(name))
    if (!options.silent) {
      appendLog('info', `[remote] ${res.remoteDir} 读取到 ${remotePakFiles.value.length} 个 Pak。\n`)
    }
  } catch (error) {
    appendLog('stderr', `[error] 读取手机 Pak 列表失败：${getErrorMessage(error)}\n`)
  } finally {
    isLoadingRemoteList.value = false
  }
}

const deleteSelectedRemotePaks = async () => {
  const fileNames = [...selectedRemotePakNames.value]
  if (!fileNames.length) return
  const confirmed = window.confirm(`确认删除手机 Saved/Paks 下的 ${fileNames.length} 个 Pak？同名 .sig 也会一起删除。`)
  if (!confirmed) return

  isDeletingRemotePaks.value = true
  try {
    const res = await $fetch('/api/pak-tool/delete-remote', {
      method: 'POST',
      body: {
        fileNames,
        packageName: packageName.value,
        gameName: DEFAULT_GAME_NAME,
        deviceSerial: deviceSerial.value,
      },
    })
    for (const result of res.results || []) {
      appendLog(result.code === 0 ? 'info' : 'stderr', formatStepResult(result))
    }
    appendLog(res.success ? 'info' : 'stderr', res.success
      ? `[delete] 已删除 ${fileNames.length} 个 Pak 及同名 sig。\n`
      : `[delete] 删除失败 exitCode=${res.exitCode}\n`)
    selectedRemotePakNames.value = []
    await fetchRemotePakList({ silent: true })
  } catch (error) {
    appendLog('stderr', `[error] 删除手机 Pak 失败：${getErrorMessage(error)}\n`)
  } finally {
    isDeletingRemotePaks.value = false
  }
}

const onDragOver = () => {
  if (!isBusyWithPak.value) {
    isDragOver.value = true
  }
}

const onDragLeave = () => {
  isDragOver.value = false
}

const onDropPakFiles = (event) => {
  isDragOver.value = false
  if (isBusyWithPak.value) return
  const incoming = Array.from(event.dataTransfer?.files || [])
    .filter((file) => /\.(pak|sig)$/i.test(file.name))
  if (!incoming.length) {
    appendLog('stderr', '[drop] 没有识别到 .pak 或 .sig 文件。\n')
    return
  }

  const byName = new Map(droppedFiles.value.map((file) => [file.name.toLowerCase(), file]))
  for (const file of incoming) {
    byName.set(file.name.toLowerCase(), file)
  }
  droppedFiles.value = [...byName.values()]
  appendLog('info', `[drop] 已加入 ${incoming.length} 个文件，当前 ${droppedPakFiles.value.length} 个 Pak 待推送。\n`)
}

const clearPakSelections = () => {
  droppedFiles.value = []
  selectedLocalPakPaths.value = []
  selectedRemotePakNames.value = []
}

const resetDefault = async () => {
  projectRoot.value = DEFAULT_PROJECT_ROOT
  saveProjectRoot({ silent: true })
  await refreshStatus()
}

const inferProjectRootFromLegacyExe = (exePath) => {
  const marker = '\\Survive\\Paktools\\CookAndPakAsset\\Do.bat'
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
  localPakDirectory.value = status.value?.tempPaksDir || ''
  await loadLocalPakDirectory()
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

.push-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  margin-top: 18px;
}

.push-column {
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.018);
  padding: 12px;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
}

.pak-drop-zone {
  display: flex;
  min-height: 118px;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border: 1px dashed rgba(127, 203, 255, 0.38);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(126, 203, 255, 0.08), rgba(121, 217, 138, 0.04)),
    rgba(255, 255, 255, 0.016);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.pak-drop-zone.active {
  border-color: #79d98a;
  background:
    linear-gradient(135deg, rgba(121, 217, 138, 0.12), rgba(126, 203, 255, 0.08)),
    rgba(255, 255, 255, 0.03);
}

.pak-drop-zone.disabled {
  opacity: 0.55;
}

.drop-mark {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 1px solid rgba(126, 203, 255, 0.32);
  border-radius: 8px;
  color: #7ecbff;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
}

.drop-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.drop-copy strong {
  color: var(--text-primary);
  font-size: 14px;
}

.drop-copy span {
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.directory-line {
  overflow: hidden;
  min-height: 34px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selection-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.pak-list,
.remote-list {
  display: flex;
  max-height: 260px;
  flex-direction: column;
  gap: 6px;
  overflow: auto;
  margin: 10px 0;
  padding-right: 2px;
}

.compact-list {
  max-height: 170px;
}

.pak-list-row,
.pak-check-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.pak-check-row {
  grid-template-columns: 18px minmax(0, 1fr) auto;
  cursor: pointer;
}

.pak-check-row.remote {
  grid-template-columns: 18px minmax(0, 1fr) 120px;
}

.pak-check-row input {
  margin: 0;
}

.pak-name {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-name {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  cursor: copy;
  font: inherit;
  padding: 0;
  text-align: left;
}

.copy-name:hover {
  color: #7ecbff;
}

.copy-name:focus-visible {
  outline: 1px solid rgba(126, 203, 255, 0.65);
  outline-offset: 2px;
}

.pak-meta {
  color: var(--text-tertiary);
  font-size: 11px;
  white-space: nowrap;
}

.pak-meta.sig-ok {
  color: #79d98a;
}

.pak-meta.sig-missing {
  color: #ffca7a;
}

.empty-state {
  display: flex;
  min-height: 42px;
  align-items: center;
  color: var(--text-tertiary);
  font-size: 12px;
}

.full-width {
  width: 100%;
  justify-content: center;
  margin-top: 8px;
}

.plus-btn {
  min-width: 34px;
  font-size: 18px;
  line-height: 1;
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

@media (max-width: 1180px) {
  .push-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .field-row,
  .hint-row {
    grid-template-columns: 1fr;
  }

  .device-input {
    width: 100%;
  }

  .pak-check-row.remote {
    grid-template-columns: 18px minmax(0, 1fr);
  }

  .pak-check-row.remote .pak-meta {
    display: none;
  }
}
</style>
