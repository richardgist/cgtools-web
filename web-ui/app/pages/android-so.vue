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
            <button
              v-for="tab in visibleWorkflowTabs"
              :key="tab.key"
              class="tab-btn"
              :class="{ active: activeTab === tab.key }"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
            </button>
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
        <div
          class="card-header collapsible-header"
          role="button"
          tabindex="0"
          :aria-expanded="String(!collapsePathSection)"
          @click="togglePathSection"
          @keydown.enter.prevent="togglePathSection"
          @keydown.space.prevent="togglePathSection"
        >
          <span class="accordion-title">
            <span class="accordion-arrow" :class="{ open: !collapsePathSection }"></span>
            <span>Shared Paths</span>
          </span>
          <div class="terminal-actions">
            <button class="fluent-btn sub" @click.stop="refreshStatus">Refresh Status</button>
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
        <div
          class="card-header collapsible-header"
          role="button"
          tabindex="0"
          :aria-expanded="String(!collapseSettingsSection)"
          @click="toggleSettingsSection"
          @keydown.enter.prevent="toggleSettingsSection"
          @keydown.space.prevent="toggleSettingsSection"
        >
          <span class="accordion-title">
            <span class="accordion-arrow" :class="{ open: !collapseSettingsSection }"></span>
            <span>Current Step Settings</span>
          </span>
        </div>
        <div class="card-body" v-if="!collapseSettingsSection">
          <div v-if="activeTab === 'updateCodeAssets'" class="field-grid">
            <div class="version-update-card">
              <div class="field-row textarea-row">
                <label>Version Text</label>
                <textarea
                  v-model="settings.versionUpdateText"
                  class="fluent-input path-input version-textarea"
                  placeholder="【CG】每日转测试版本（MergedP4Head：5996891，MergedSvnHead：1466919，P4Merge：5996991-5997884，SVNMerge：1466941-1466969）"
                ></textarea>
              </div>
              <div class="field-row">
                <label>P4 Safe Paths</label>
                <input :value="SAFE_PATHS_INI_PATH" class="fluent-input path-input" readonly />
              </div>
              <div class="hint-line">Safe paths are loaded from INI. Use <code>+Paths=</code> for update dirs and <code>+ExpandChildren=</code> for dirs that must be split by child directory.</div>
              <label class="check-line">
                <input v-model="settings.p4Parallel" type="checkbox" />
                Sync P4 safe paths in parallel
              </label>
              <label class="check-line">
                <input v-model="settings.versionUpdateDryRun" type="checkbox" />
                Dry run only
              </label>
              <div class="hint-line">
                Parsed: P4 <code>{{ parsedVersionUpdate.mergedP4Head || '-' }}</code>,
                SVN <code>{{ parsedVersionUpdate.mergedSvnHead || '-' }}</code>,
                P4Merge <code>{{ parsedVersionUpdate.p4Merge.join(', ') || '-' }}</code>,
                SVNMerge <code>{{ parsedVersionUpdate.svnMerge.join(', ') || '-' }}</code>
              </div>
              <div class="hint-line warn">Update runs as three nodes: assets by P4 first, project SVN second, then ReplaceManager SVN. P4 paths come only from the INI config; dirs listed in <code>+ExpandChildren</code> are split by subdir, and the outer <code>{{ sharedPaths.projectFile.replace(/[\\/][^\\/]+$/, '') }}</code> directory is never synced directly.</div>
            </div>
          </div>

          <div v-else-if="activeTab === 'buildSo'" class="field-grid">
            <div class="field-row compact">
              <label>Build Mode</label>
              <select v-model="settings.buildMode" class="fluent-select">
                <option value="full">Full Build SO</option>
                <option value="rebuildOnly">Rebuild SO Only</option>
              </select>
            </div>
            <div v-if="settings.buildMode === 'full'" class="build-reminder-card">
              <div class="build-reminder-header">
                <div>
                  <div class="build-reminder-step">Step 0</div>
                  <div class="build-reminder-title">Auto Update DefaultEngine.ini Before Build</div>
                </div>
                <button class="fluent-btn sub" @click="copySelectedIniSnippet">Copy ABI Snippet</button>
              </div>
              <div class="build-reminder-text">
                Run will update <code>{{ defaultEngineIniPath }}</code> before building so the selected Android ABI is the only enabled ABI.
              </div>
              <pre class="build-reminder-code">{{ selectedIniSnippet }}</pre>
            </div>
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
              <input v-model="settings.logPath" class="fluent-input path-input" :placeholder="activeBuildLogPlaceholder" />
            </div>
            <div class="field-row compact">
              <label>Max Parallel Actions (optional)</label>
              <input v-model.number="settings.maxParallelActions" class="fluent-input" type="number" min="1" max="128" placeholder="8" />
            </div>
            <div class="hint-line">Build uses UnrealBuildTool direct mode (not UAT BuildCookRun).</div>
            <div v-if="settings.buildMode === 'full'" class="hint-line">Full mode updates ABI config, prepares ReplaceManager, generates manifest, then builds SO. ReplaceManager clean is a separate manual step.</div>
            <div v-else class="hint-line warn">Rebuild-only mode skips ABI config, ReplaceManager, and manifest. Use it after a full Build SO has already succeeded.</div>
            <div class="hint-line">Shipping config will auto append <code>-ShippingDev</code>.</div>
            <div class="hint-line">Expected output: <code>{{ expectedSoOutputPath }}</code></div>
          </div>

          <div v-else-if="activeTab === 'cleanReplaceManager'" class="field-grid">
            <div class="hint-line warn">
              This runs ReplaceManager <code>clean</code> only. Use it when you are done with the current logging/build/replace loop and want to restore ReplaceManager state.
            </div>
            <div class="hint-line">
              Project root: <code>{{ settings.projectRoot }}</code>
            </div>
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
              <label>Remote Path (direct adb mode only)</label>
              <input v-model="settings.pushRemotePath" class="fluent-input path-input" placeholder="/data/local/tmp/" :disabled="settings.pushUseRunAs" />
            </div>
            <label class="check-line">
              <input v-model="settings.pushUseRunAs" type="checkbox" />
              Use run-as (copy from /data/local/tmp into app sandbox path)
            </label>
            <div class="field-row" v-if="settings.pushUseRunAs">
              <label>Package Name</label>
              <input v-model="settings.pushPackageName" class="fluent-input path-input" placeholder="com.tencent.tmgp.pubgmhd" />
            </div>
            <label class="check-line" v-if="settings.pushUseRunAs">
              <input v-model="settings.pushLaunchAfterPush" type="checkbox" />
              Launch package after SO push
            </label>
            <div v-if="settings.pushUseRunAs" class="hint-line">
              Run-as mode runs push, sandbox copy, file verification, and optional package launch in one click.
            </div>
            <div v-else class="hint-line warn">
              Direct adb mode is enabled, so preview only shows one push step. Enable <code>Use run-as</code> to generate the phone-side copy and verify steps.
            </div>
            <div class="hint-line">SO will always be renamed to <code>libUE4.so</code> at target path.</div>
          </div>

          <div v-else-if="activeTab === 'deleteSo'" class="field-grid">
            <div class="field-row">
              <label>Package Name</label>
              <input v-model="settings.deletePackageName" class="fluent-input path-input" placeholder="com.tencent.tmgp.pubgmhd" />
            </div>
            <label class="check-line">
              <input v-model="settings.deleteTempSo" type="checkbox" />
              Also delete <code>/data/local/tmp/libUE4.so</code>
            </label>
            <div class="hint-line">
              Deletes the run-as replacement at <code>app_lib/libUE4.so</code>, then verifies it no longer exists.
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
        <div
          class="card-header collapsible-header"
          role="button"
          tabindex="0"
          :aria-expanded="String(!collapseCommandSteps)"
          @click="toggleCommandSteps"
          @keydown.enter.prevent="toggleCommandSteps"
          @keydown.space.prevent="toggleCommandSteps"
        >
          <span class="accordion-title">
            <span class="accordion-arrow" :class="{ open: !collapseCommandSteps }"></span>
            <span>Command Preview</span>
          </span>
          <div class="terminal-actions">
            <button v-if="runLogDir" class="fluent-btn sub" @click.stop="openLocalPath(runLogDir, 'folder')">Open Run Logs</button>
          </div>
        </div>
        <div class="card-body">
          <template v-if="!collapseCommandSteps">
            <div v-if="workflowNodes.length" class="workflow-flow">
              <div
                v-for="(node, index) in workflowNodes"
                :key="node.key"
                class="workflow-node-wrap"
              >
                <div
                  class="workflow-node"
                  :class="`workflow-node--${node.status}`"
                  :title="node.name"
                >
                  <div class="workflow-node-top">
                    <span class="workflow-node-dot">{{ node.statusIcon }}</span>
                    <span class="workflow-node-step">Step {{ index + 1 }}</span>
                  </div>
                  <div class="workflow-node-name">{{ node.name }}</div>
                  <div class="workflow-node-footer">
                    <div class="workflow-node-meta">
                      <span class="workflow-node-status">{{ node.statusLabel }}</span>
                      <span v-if="node.elapsedLabel" class="workflow-node-duration">{{ node.elapsedLabel }}</span>
                    </div>
                    <button
                      v-if="node.logPath"
                      class="workflow-log-btn"
                      @click.stop="openLocalPath(node.logPath)"
                    >
                      Log
                    </button>
                  </div>
                </div>
                <div v-if="index < workflowNodes.length - 1" class="workflow-edge"></div>
              </div>
            </div>
            <div v-if="commandPreviewSteps.length" class="preview-steps">
              <div v-for="(step, index) in commandPreviewSteps" :key="`${activeTab}-${index}-${step.name}`" class="preview-step-card">
                <div class="preview-step-header">
                  <div>
                    <div class="preview-step-index">Step {{ index + 1 }}</div>
                    <div class="preview-step-name">{{ step.name }}</div>
                  </div>
                  <button class="fluent-btn sub" @click="copyPreviewStep(step)">Copy</button>
                </div>
                <pre class="preview-step-command">{{ step.display }}</pre>
              </div>
            </div>
            <div v-else class="hint-line">No commands available for the current tab.</div>
          </template>
          <div v-else class="preview-collapsed-summary">
            <span>{{ commandPreviewSteps.length }} steps hidden</span>
          </div>
          <div class="action-row">
            <button class="fluent-btn" @click="copyPreview">{{ activeTab === 'guideC' ? 'Copy APL Snippet' : 'Copy All Commands' }}</button>
            <button class="fluent-btn primary" @click="runActive" :disabled="isRunning || activeTab === 'guideC'">Run</button>
            <button class="fluent-btn danger" @click="terminateRun" :disabled="!isRunning">Stop</button>
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

const LEGACY_STORAGE_KEY = 'cgtools_android_so_settings_v1'
const STORAGE_KEY = 'cgtools_android_so_profiles_v2'
const DEFAULT_PROJECT_ROOT = 'C:\\CJGame\\PRE418'
const SAFE_PATHS_INI_PATH = 'web-ui/server/config/android-so-update-paths.ini'
const REPLACE_MANAGER_SOURCE_DIR = 'I:\\cgtools\\ReplaceManager'
const REPLACE_MANAGER_DIR = `${REPLACE_MANAGER_SOURCE_DIR}\\RevertTool`
const REPLACE_MANAGER_TOOL = `${REPLACE_MANAGER_DIR}\\ReplaceManagerTool.py`
const SETTINGS_KEYS = [
  'projectRoot',
  'buildMode',
  'versionUpdateText',
  'p4Parallel',
  'versionUpdateDryRun',
  'config',
  'arch',
  'logPath',
  'maxParallelActions',
  'apkPath',
  'soPath',
  'pushRemotePath',
  'pushUseRunAs',
  'pushPackageName',
  'pushLaunchAfterPush',
  'deletePackageName',
  'deleteTempSo',
  'showInstallHint',
  'packageName',
  'launchActivity',
  'aplLibraryName',
  'aplFailMessage',
]

const activeTab = ref('updateCodeAssets')
const isRunning = ref(false)
const collapsePathSection = ref(true)
const collapseSettingsSection = ref(true)
const collapseCommandSteps = ref(true)
const terminalEl = ref(null)
const logs = ref([])
const lastOutputs = ref(null)
const stepStates = ref({})
const stepStartedAt = ref({})
const stepDurations = ref({})
const stepLogPaths = ref({})
const activeStepName = ref('')
const runLogDir = ref('')
const nowMs = ref(Date.now())
const projectRootDraft = ref(DEFAULT_PROJECT_ROOT)
const projectRootOptions = ref([DEFAULT_PROJECT_ROOT])
let ws = null
let profileStore = { activeProjectRoot: '', profiles: {} }
let activeProjectRootKey = ''
let isApplyingSettings = false
let detectionRequestId = 0
let elapsedTimer = null

const normalizeWindowsPath = (value) => String(value || '').trim().replace(/\//g, '\\')

const stripTrailingSeparators = (value) => {
  const normalized = normalizeWindowsPath(value)
  if (!normalized) return ''
  if (/^[A-Za-z]:\\?$/.test(normalized)) {
    return `${normalized.slice(0, 2)}\\`
  }
  return normalized.replace(/[\\]+$/, '')
}

const isPathInsideProjectRoot = (path, projectRoot) => {
  const normalizedPath = stripTrailingSeparators(path).toLowerCase()
  const normalizedRoot = stripTrailingSeparators(projectRoot).toLowerCase()
  if (!normalizedPath || !normalizedRoot) return false
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}\\`)
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

const getAndroidBinaryArchName = (arch) => {
  if (arch === 'arm64-v8a') return 'arm64'
  if (arch === 'armeabi-v7a') return 'armv7'
  return 'x64'
}

const buildLegacyDefaultSoPath = (projectFile, arch, projectRoot) => {
  const projectDir = resolveProjectDir(projectFile, projectRoot)
  if (!projectDir) return ''
  return `${projectDir}\\Intermediate\\Android\\APK\\jni\\${arch || 'arm64-v8a'}\\libUE4.so`
}

const buildDefaultSoPath = (projectFile, config, arch, projectRoot) => {
  const projectDir = resolveProjectDir(projectFile, projectRoot)
  if (!projectDir) return ''
  const targetName = projectFile ? projectFile.replace(/^.*[\\/]/, '').replace(/\.uproject$/i, '') : 'ShadowTrackerExtra'
  const archName = getAndroidBinaryArchName(arch || 'arm64-v8a')
  return `${projectDir}\\Binaries\\Android\\${targetName}-${archName}-es2.so`
}

const buildDefaultLogPath = (projectFile, config, arch, projectRoot) => {
  const projectDir = resolveProjectDir(projectFile, projectRoot)
  if (!projectDir) return ''
  return `${projectDir}\\Saved\\Logs\\Build\\AndroidSO_${config || 'Development'}_${arch || 'arm64-v8a'}.log`
}

const buildDefaultRebuildLogPath = (projectFile, config, arch, projectRoot) => {
  const projectDir = resolveProjectDir(projectFile, projectRoot)
  if (!projectDir) return ''
  return `${projectDir}\\Saved\\Logs\\Build\\AndroidSO_Rebuild_${config || 'Development'}_${arch || 'arm64-v8a'}.log`
}

const createDefaultSettings = (projectRoot = DEFAULT_PROJECT_ROOT) => {
  const sharedPaths = deriveSharedPaths(projectRoot)
  return {
    projectRoot: sharedPaths.projectRoot,
    buildMode: 'full',
    versionUpdateText: '',
    p4Parallel: true,
    versionUpdateDryRun: false,
    config: 'Development',
    arch: 'arm64-v8a',
    logPath: '',
    maxParallelActions: null,
    apkPath: '',
    soPath: buildDefaultSoPath(sharedPaths.projectFile, 'Development', 'arm64-v8a', sharedPaths.projectRoot),
    pushRemotePath: '/data/local/tmp/',
    pushUseRunAs: true,
    pushPackageName: 'com.tencent.tmgp.pubgmhd',
    pushLaunchAfterPush: true,
    deletePackageName: 'com.tencent.tmgp.pubgmhd',
    deleteTempSo: true,
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
const visibleWorkflowTabs = [
  { key: 'updateCodeAssets', label: '1) Update Code/Assets' },
  { key: 'buildSo', label: '2) Build SO' },
  { key: 'cleanReplaceManager', label: '3) Clean ReplaceManager' },
  { key: 'pushSo', label: '4) Push SO' },
  { key: 'deleteSo', label: '5) Delete SO' },
]

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

  if (profile?.pushUseRunAs === false && profile?.pushLaunchAfterPush === undefined) {
    sanitized.pushUseRunAs = true
    sanitized.pushLaunchAfterPush = true
  }
  if (!['full', 'rebuildOnly'].includes(sanitized.buildMode)) {
    sanitized.buildMode = 'full'
  }
  sanitized.versionUpdateText = sanitized.versionUpdateText || ''
  sanitized.p4Parallel = sanitized.p4Parallel !== false
  sanitized.versionUpdateDryRun = sanitized.versionUpdateDryRun === true

  sanitized.projectRoot = resolvedProjectRoot
  const sharedPaths = deriveSharedPaths(resolvedProjectRoot)
  const legacyDefaultSoPath = buildLegacyDefaultSoPath(sharedPaths.projectFile, sanitized.arch, sanitized.projectRoot)
  if (!sanitized.soPath || sanitized.soPath === legacyDefaultSoPath || !isPathInsideProjectRoot(sanitized.soPath, sanitized.projectRoot)) {
    sanitized.soPath = buildDefaultSoPath(sharedPaths.projectFile, sanitized.config, sanitized.arch, sanitized.projectRoot)
  }

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
const defaultEngineIniPath = computed(() => joinWindowsPath(settings.projectRoot, 'Survive', 'Config', 'DefaultEngine.ini'))
const defaultBuildLogPath = computed(() => buildDefaultLogPath(sharedPaths.value.projectFile, settings.config, settings.arch, settings.projectRoot))
const defaultRebuildLogPath = computed(() => buildDefaultRebuildLogPath(sharedPaths.value.projectFile, settings.config, settings.arch, settings.projectRoot))
const activeBuildLogPlaceholder = computed(() => settings.buildMode === 'rebuildOnly' ? defaultRebuildLogPath.value : defaultBuildLogPath.value)
const defaultSoPath = computed(() => buildDefaultSoPath(sharedPaths.value.projectFile, settings.config, settings.arch, settings.projectRoot))

const quote = (text) => {
  if (!text) return '""'
  return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text
}

const createPreviewStep = (name, command, cwd) => ({
  name,
  command,
  display: cwd ? `(cwd=${cwd}) ${command}` : command,
})

const createStepKey = (step, index) => `${index}:${step.name}`

const getStepKeysByName = (name) => commandPreviewSteps.value
  .map((step, index) => ({ key: createStepKey(step, index), name: step.name }))
  .filter((item) => item.name === name)
  .map((item) => item.key)

const setStepStatusByName = (name, status) => {
  const keys = getStepKeysByName(name)
  if (keys.length === 0) return
  stepStates.value = {
    ...stepStates.value,
    ...Object.fromEntries(keys.map((key) => [key, status])),
  }
}

const setStepStartedByName = (name, startedAtMs = Date.now()) => {
  const keys = getStepKeysByName(name)
  if (keys.length === 0) return
  stepStartedAt.value = {
    ...stepStartedAt.value,
    ...Object.fromEntries(keys.map((key) => [key, startedAtMs])),
  }
}

const setStepDurationByName = (name, durationMs) => {
  const resolvedDurationMs = Number(durationMs)
  if (!Number.isFinite(resolvedDurationMs)) return
  const keys = getStepKeysByName(name)
  if (keys.length === 0) return
  stepDurations.value = {
    ...stepDurations.value,
    ...Object.fromEntries(keys.map((key) => [key, Math.max(0, resolvedDurationMs)])),
  }
}

const setStepLogPathByName = (name, logPath) => {
  if (!logPath) return
  const keys = getStepKeysByName(name)
  if (keys.length === 0) return
  stepLogPaths.value = {
    ...stepLogPaths.value,
    ...Object.fromEntries(keys.map((key) => [key, logPath])),
  }
}

const resetWorkflowState = () => {
  stepStates.value = Object.fromEntries(
    commandPreviewSteps.value.map((step, index) => [createStepKey(step, index), 'pending']),
  )
  stepStartedAt.value = {}
  stepDurations.value = {}
  stepLogPaths.value = {}
  activeStepName.value = ''
}

const getWorkflowStatusMeta = (status) => {
  if (status === 'running') return { label: 'Running', icon: '>' }
  if (status === 'success') return { label: 'Done', icon: 'OK' }
  if (status === 'failed') return { label: 'Failed', icon: '!' }
  if (status === 'stopped') return { label: 'Stopped', icon: 'X' }
  return { label: 'Pending', icon: '-' }
}

const formatDuration = (durationMs) => {
  const resolvedDurationMs = Number(durationMs)
  if (!Number.isFinite(resolvedDurationMs) || resolvedDurationMs < 0) return ''
  if (resolvedDurationMs < 1000) {
    return `${Math.max(1, Math.round(resolvedDurationMs))}ms`
  }

  const seconds = resolvedDurationMs / 1000
  if (seconds < 60) {
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`
}

const getStepElapsedLabel = (key, status) => {
  const durationMs = stepDurations.value[key]
  if (Number.isFinite(Number(durationMs))) {
    return formatDuration(durationMs)
  }

  const startedAtMs = stepStartedAt.value[key]
  if (status === 'running' && Number.isFinite(Number(startedAtMs))) {
    return formatDuration(nowMs.value - startedAtMs)
  }

  return ''
}

const ensureElapsedTimer = () => {
  if (elapsedTimer) return
  elapsedTimer = window.setInterval(() => {
    nowMs.value = Date.now()
  }, 500)
}

const stopElapsedTimer = () => {
  if (!elapsedTimer) return
  window.clearInterval(elapsedTimer)
  elapsedTimer = null
}

const openLocalPath = async (path, mode = 'path') => {
  if (!path) return
  try {
    const res = await $fetch('/api/system/open', {
      method: 'POST',
      body: { path, mode },
    })
    if (!res?.success) {
      appendLog('stderr', `[error] open failed: ${res?.error || path}\n`)
    }
  } catch (error) {
    appendLog('stderr', `[error] open failed: ${error.message}\n`)
  }
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

const getDefaultEngineIniAndroidAbiSettings = (arch) => ({
  bBuildForArmV7: arch === 'armeabi-v7a' ? 'True' : 'False',
  bBuildForArm64: arch === 'arm64-v8a' ? 'True' : 'False',
  bBuildForX86: 'False',
  bBuildForX8664: arch === 'x86_64' ? 'True' : 'False',
})

const parseBuildVersionUpdateText = (text) => {
  const normalized = String(text || '').replace(/[，,]/g, ' ')
  const numberOf = (label) => normalized.match(new RegExp(`${label}\\s*[:：]\\s*(\\d+)`, 'i'))?.[1] || ''
  const listOf = (label) => (normalized.match(new RegExp(`${label}\\s*[:：]\\s*([\\d\\s\\-－–—]+)`, 'i'))?.[1] || '')
    .split(/[\s\-－–—]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  return {
    mergedP4Head: numberOf('MergedP4Head'),
    mergedSvnHead: numberOf('MergedSvnHead'),
    p4Merge: listOf('P4Merge'),
    svnMerge: listOf('SVNMerge'),
  }
}

const parsedVersionUpdate = computed(() => parseBuildVersionUpdateText(settings.versionUpdateText))

const selectedIniSnippet = computed(() => {
  const entries = getDefaultEngineIniAndroidAbiSettings(settings.arch)
  return [
    '[/Script/AndroidRuntimeSettings.AndroidRuntimeSettings]',
    ...Object.entries(entries).map(([key, value]) => `${key}=${value}`),
  ].join('\n')
})

const buildVersionUpdatePreviewSteps = () => {
  const parsed = parsedVersionUpdate.value
  const projectDir = sharedPaths.value.projectFile.replace(/[\\/][^\\/]+$/, '')
  const p4PathLabel = `${SAFE_PATHS_INI_PATH} (+Paths / +ExpandChildren)`
  const replaceManagerCommand = settings.versionUpdateDryRun
    ? `[dry-run] svn update ${quote(REPLACE_MANAGER_SOURCE_DIR)} --non-interactive`
    : `svn update ${quote(REPLACE_MANAGER_SOURCE_DIR)} --non-interactive`

  return [
    createPreviewStep(
      'Update Assets (P4)',
      [
        `safe paths: ${p4PathLabel}`,
        parsed.mergedP4Head ? `p4 sync <safe-path>\\...@${parsed.mergedP4Head}` : 'p4 base: <MergedP4Head missing, skip base sync>',
        ...(parsed.p4Merge.length ? parsed.p4Merge.map((change) => `p4 sync <safe-path>\\...@=${change}`) : ['p4 merges: <P4Merge missing, skip single changes>']),
        settings.p4Parallel ? 'parallel: enabled for multiple safe paths' : 'parallel: disabled',
        settings.versionUpdateDryRun ? 'dry-run: enabled, commands will only be printed' : 'dry-run: disabled',
      ].join('\n'),
      settings.projectRoot,
    ),
    createPreviewStep(
      'Update SVN',
      [
        `update paths: ${SAFE_PATHS_INI_PATH} ([SVN] +UpdatePath)`,
        parsed.mergedSvnHead ? `svn update -r ${parsed.mergedSvnHead} <svn-update-path> --non-interactive` : 'svn base: <MergedSvnHead missing, skip update>',
        ...(parsed.svnMerge.length ? parsed.svnMerge.map((revision) => `svn merge -c ${revision} <matched-svn-url> <matched-svn-update-path> --non-interactive`) : ['svn merges: <SVNMerge missing, skip merges>']),
        settings.versionUpdateDryRun ? 'dry-run: enabled, commands will only be printed' : 'dry-run: disabled',
      ].join('\n'),
      projectDir,
    ),
    createPreviewStep('Update ReplaceManager', replaceManagerCommand, REPLACE_MANAGER_SOURCE_DIR),
  ]
}

const buildBuildPreviewSteps = () => {
  const projectFile = sharedPaths.value.projectFile
  const engineRoot = sharedPaths.value.engineRoot
  const ubtExe = `${engineRoot}\\Binaries\\DotNET\\UnrealBuildTool.exe`
  const targetName = projectFile ? projectFile.replace(/^.*[\\/]/, '').replace(/\.uproject$/i, '') : 'ShadowTrackerExtra'
  const projectDir = projectFile ? projectFile.replace(/[\\/][^\\/]+$/, '') : settings.projectRoot
  const shippingDevArg = settings.config === 'Shipping' ? ' -ShippingDev' : ''
  const archArg = archToUbtArg(settings.arch)
  const resolvedLogPath = settings.logPath?.trim() ? settings.logPath.trim() : defaultBuildLogPath.value
  const parallelArg = Number.isInteger(settings.maxParallelActions) && settings.maxParallelActions > 0 ? ` -MaxParallelActions=${settings.maxParallelActions}` : ''
  const baseCommand = `${quote(ubtExe)} ${targetName} Android ${settings.config} -Project=${quote(projectFile)} ${quote(projectFile)} -NoUBTMakefiles -remoteini=${quote(projectDir)} -skipdeploy -BuildPipeline= ${archArg}${shippingDevArg} -forceframepointer -noxge`
  const replaceCommand = `python ${quote(REPLACE_MANAGER_TOOL)} ${quote(REPLACE_MANAGER_SOURCE_DIR)} ${quote(settings.projectRoot)} restore`
  const iniCommand = `cgtools:update-default-engine-ini -Path=${quote(defaultEngineIniPath.value)} ${Object.entries(getDefaultEngineIniAndroidAbiSettings(settings.arch)).map(([key, value]) => `-${key}=${value}`).join(' ')}`
  const manifestCommand = `${baseCommand} -generatemanifest${parallelArg} -log=${quote(resolvedLogPath)} -NoHotReload`
  const buildCommand = `${baseCommand}${parallelArg} -log=${quote(resolvedLogPath)} -NoHotReload`

  return [
    createPreviewStep('Update DefaultEngine.ini Android ABI', iniCommand, projectDir),
    createPreviewStep('Prepare ReplaceManager patch', replaceCommand, REPLACE_MANAGER_DIR),
    createPreviewStep('Generate UBT manifest', manifestCommand, settings.projectRoot),
    createPreviewStep('Build Android SO with UBT', buildCommand, settings.projectRoot),
  ]
}

const buildCleanReplaceManagerPreviewSteps = () => {
  const cleanCommand = `python ${quote(REPLACE_MANAGER_TOOL)} ${quote(REPLACE_MANAGER_SOURCE_DIR)} ${quote(settings.projectRoot)} clean`

  return [
    createPreviewStep('Clean ReplaceManager state', cleanCommand, REPLACE_MANAGER_DIR),
  ]
}

const buildRebuildPreviewSteps = () => {
  const projectFile = sharedPaths.value.projectFile
  const engineRoot = sharedPaths.value.engineRoot
  const ubtExe = `${engineRoot}\\Binaries\\DotNET\\UnrealBuildTool.exe`
  const targetName = projectFile ? projectFile.replace(/^.*[\\/]/, '').replace(/\.uproject$/i, '') : 'ShadowTrackerExtra'
  const projectDir = projectFile ? projectFile.replace(/[\\/][^\\/]+$/, '') : settings.projectRoot
  const shippingDevArg = settings.config === 'Shipping' ? ' -ShippingDev' : ''
  const archArg = archToUbtArg(settings.arch)
  const resolvedLogPath = settings.logPath?.trim() ? settings.logPath.trim() : defaultRebuildLogPath.value
  const parallelArg = Number.isInteger(settings.maxParallelActions) && settings.maxParallelActions > 0 ? ` -MaxParallelActions=${settings.maxParallelActions}` : ''
  const buildCommand = `${quote(ubtExe)} ${targetName} Android ${settings.config} -Project=${quote(projectFile)} ${quote(projectFile)} -NoUBTMakefiles -remoteini=${quote(projectDir)} -skipdeploy -BuildPipeline= ${archArg}${shippingDevArg} -forceframepointer -noxge${parallelArg} -log=${quote(resolvedLogPath)} -NoHotReload`

  return [
    createPreviewStep('Rebuild Android SO with UBT', buildCommand, settings.projectRoot),
  ]
}

const buildPushPreviewSteps = (soPath) => {
  const remotePath = settings.pushRemotePath?.trim() || '/data/local/tmp/'
  const normalized = remotePath.replace(/\\/g, '/')
  const remoteFile = normalized.endsWith('/')
    ? `${normalized}libUE4.so`
    : (normalized.toLowerCase().endsWith('.so') ? `${normalized.replace(/\/[^/]*$/, '')}/libUE4.so` : `${normalized}/libUE4.so`)
  if (settings.pushUseRunAs) {
    const packageName = settings.pushPackageName?.trim() || 'com.tencent.tmgp.pubgmhd'
    return [
      createPreviewStep('Force-stop package before SO push', `adb shell am force-stop ${packageName}`),
      createPreviewStep('Push target libUE4.so to temp path', `adb push ${quote(soPath)} /data/local/tmp/libUE4.so`),
      createPreviewStep('Ensure app_lib exists', `adb shell run-as ${packageName} mkdir -p app_lib`),
      createPreviewStep('Copy SO into app_lib', `adb shell run-as ${packageName} cp /data/local/tmp/libUE4.so app_lib/libUE4.so`),
      createPreviewStep('Verify libUE4.so in app_lib', `adb shell run-as ${packageName} ls -l app_lib/libUE4.so`),
      ...(settings.pushLaunchAfterPush ? [
        createPreviewStep('Launch package after SO push', `adb shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`),
      ] : []),
    ]
  }
  return [
    createPreviewStep('Push SO via adb', `adb push ${quote(soPath)} ${quote(remoteFile)}`),
  ]
}

const buildDeletePreviewSteps = () => {
  const packageName = settings.deletePackageName?.trim() || 'com.tencent.tmgp.pubgmhd'
  return [
    createPreviewStep('Delete libUE4.so from app_lib', `adb shell run-as ${packageName} rm -f app_lib/libUE4.so`),
    createPreviewStep(
      'Verify app_lib libUE4.so deleted',
      `adb shell "run-as ${packageName} sh -c 'if [ -e app_lib/libUE4.so ]; then echo still exists: app_lib/libUE4.so; exit 1; fi; echo deleted: app_lib/libUE4.so'"`,
    ),
    ...(settings.deleteTempSo !== false ? [
      createPreviewStep('Delete temp libUE4.so', 'adb shell rm -f /data/local/tmp/libUE4.so'),
    ] : []),
  ]
}

const commandPreviewSteps = computed(() => {
  if (activeTab.value === 'updateCodeAssets') {
    return buildVersionUpdatePreviewSteps()
  }
  if (activeTab.value === 'buildSo') {
    return settings.buildMode === 'rebuildOnly' ? buildRebuildPreviewSteps() : buildBuildPreviewSteps()
  }
  if (activeTab.value === 'cleanReplaceManager') {
    return buildCleanReplaceManagerPreviewSteps()
  }
  if (activeTab.value === 'replaceA') {
    return [
      createPreviewStep(
        'Replace SO in APK',
        `${quote(sharedPaths.value.ueAppToolsExe)} -mode=replaceSo -platform=android -apkPath=${quote(settings.apkPath)} -soPath=${quote(settings.soPath)} -arch=${settings.arch}`,
      ),
    ]
  }
  if (activeTab.value === 'injectB') {
    const comp = settings.launchActivity.includes('/') ? settings.launchActivity : `${settings.packageName}/${settings.launchActivity}`
    return [
      createPreviewStep('Force-stop package before runtime file push', `adb shell am force-stop ${settings.packageName}`),
      createPreviewStep('Push inject_demo', `adb push ${quote(sharedPaths.value.androidInjectDir + '\\inject_demo')} /data/local/tmp/`),
      createPreviewStep('Push lib_inject_entry.so', `adb push ${quote(sharedPaths.value.androidInjectDir + '\\lib_inject_entry.so')} /data/local/tmp/`),
      createPreviewStep('Push target libUE4.so', `adb push ${quote(settings.soPath)} /data/local/tmp/libUE4.so`),
      createPreviewStep('Prepare log file', 'adb shell touch /data/local/tmp/log_android_inject.txt'),
      createPreviewStep(
        'Copy runtime files into app sandbox',
        `adb shell "run-as ${settings.packageName} sh -c 'cp /data/local/tmp/libUE4.so . && cp /data/local/tmp/inject_demo . && cp /data/local/tmp/lib_inject_entry.so . && chmod 777 ./inject_demo && chmod 777 ./lib_inject_entry.so'"`,
      ),
      createPreviewStep('Launch game activity', `adb shell am start -n ${comp}`),
      createPreviewStep(
        'Execute injector',
        `adb shell "run-as ${settings.packageName} sh -c './inject_demo ${settings.packageName} > /data/local/tmp/log_android_inject.txt'"`,
      ),
      createPreviewStep('Pull injector log', 'adb pull /data/local/tmp/log_android_inject.txt <local_path>'),
    ]
  }
  if (activeTab.value === 'pushSo') {
    return buildPushPreviewSteps(settings.soPath)
  }
  if (activeTab.value === 'deleteSo') {
    return buildDeletePreviewSteps()
  }
  return [
    createPreviewStep('APL snippet', aplSnippet.value),
  ]
})

const commandPreview = computed(() => commandPreviewSteps.value.map((step) => step.command).join('\n'))

const workflowNodes = computed(() => commandPreviewSteps.value.map((step, index) => {
  const key = createStepKey(step, index)
  const status = stepStates.value[key] || 'pending'
  const meta = getWorkflowStatusMeta(status)
  return {
    key,
    name: step.name,
    logPath: stepLogPaths.value[key] || '',
    status,
    statusLabel: meta.label,
    statusIcon: meta.icon,
    elapsedLabel: getStepElapsedLabel(key, status),
  }
}))

const saveCurrentProfile = () => {
  if (isApplyingSettings) return

  const snapshot = sanitizeSettingsProfile(cloneSettings(), settings.projectRoot || DEFAULT_PROJECT_ROOT)
  activeProjectRootKey = getProjectProfileKey(snapshot.projectRoot)
  profileStore.activeProjectRoot = snapshot.projectRoot
  profileStore.profiles[activeProjectRootKey] = snapshot
  persistProfileStore()
}

const resolveLogType = (type, text) => {
  const value = String(text || '').trimStart().toLowerCase()
  if (value.startsWith('[warning]')) return 'warning'
  if (value.startsWith('[error]') || value.startsWith('[spawn error]') || value.startsWith('[cleanup error]')) return 'error'
  if (value.startsWith('[terminated]')) return 'warning'
  if (value.startsWith('[end] exitcode=0') || value.includes(' success') || value.includes('succeeded')) return 'success'
  if (value.startsWith('[info]') || value.startsWith('[start]') || value.startsWith('[step]') || value.startsWith('[logs]') || value.startsWith('[run]') || value.startsWith('[stop]') || value.startsWith('[end]')) return 'info'
  if (type === 'stderr') return 'error'
  return type || 'stdout'
}

const appendLog = (type, text) => {
  logs.value.push({ type: resolveLogType(type, text), text })
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
  appendLog('info', `[info] ${activeTab.value === 'guideC' ? 'APL snippet' : 'All commands'} copied.\n`)
}

const copyPreviewStep = async (step) => {
  await copyText(step.command)
  appendLog('info', `[info] Step copied: ${step.name}\n`)
}

const copySelectedIniSnippet = async () => {
  await copyText(selectedIniSnippet.value)
  appendLog('info', '[info] DefaultEngine.ini ABI snippet copied.\n')
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

const toggleSettingsSection = () => {
  collapseSettingsSection.value = !collapseSettingsSection.value
}

const toggleCommandSteps = () => {
  collapseCommandSteps.value = !collapseCommandSteps.value
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
        lastOutputs.value = null
        runLogDir.value = data.runLogDir || ''
        appendLog('info', `[start] ${data.jobType}\n`)
        if (runLogDir.value) {
          appendLog('info', `[logs] ${runLogDir.value}\n`)
        }
      } else if (data.type === 'step') {
        activeStepName.value = data.name || ''
        setStepLogPathByName(data.name, data.logPath)
        setStepStartedByName(data.name)
        setStepStatusByName(data.name, 'running')
        ensureElapsedTimer()
        appendLog('info', `[step] ${data.name}\n`)
      } else if (data.type === 'stepEnd') {
        setStepLogPathByName(data.name, data.logPath)
        setStepDurationByName(data.name, data.durationMs)
        setStepStatusByName(data.name, data.exitCode === -1 ? 'stopped' : (data.exitCode === 0 ? 'success' : 'failed'))
        if (activeStepName.value === data.name) {
          activeStepName.value = ''
        }
      } else if (data.type === 'stdout') {
        if (!activeStepName.value) {
          appendLog('stdout', data.data)
        }
      } else if (data.type === 'stderr') {
        if (!activeStepName.value || String(data.data || '').startsWith('[terminated]')) {
          appendLog('stderr', data.data)
        }
      } else if (data.type === 'error') {
        if (activeStepName.value) {
          setStepStatusByName(activeStepName.value, 'failed')
        }
        appendLog('stderr', `[error] ${data.data}\n`)
      } else if (data.type === 'end') {
        isRunning.value = false
        lastOutputs.value = data.outputs || null
        if (data.exitCode === -1 && activeStepName.value) {
          setStepStatusByName(activeStepName.value, 'stopped')
        }
        activeStepName.value = ''
        stopElapsedTimer()
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
      stopElapsedTimer()
    }
  })
}

const buildPayload = () => {
  if (activeTab.value === 'updateCodeAssets') {
    return {
      projectRoot: settings.projectRoot,
      versionUpdateText: settings.versionUpdateText,
      svnUpdatePath: sharedPaths.value.projectFile.replace(/[\\/][^\\/]+$/, ''),
      p4Parallel: settings.p4Parallel !== false,
      dryRun: settings.versionUpdateDryRun === true,
    }
  }
  if (activeTab.value === 'buildSo') {
    return {
      projectRoot: settings.projectRoot,
      projectFile: sharedPaths.value.projectFile,
      engineRoot: sharedPaths.value.engineRoot,
      defaultEngineIniPath: defaultEngineIniPath.value,
      config: settings.config,
      arch: settings.arch,
      logPath: settings.logPath?.trim() || undefined,
      maxParallelActions: Number.isInteger(settings.maxParallelActions) && settings.maxParallelActions > 0 ? settings.maxParallelActions : undefined,
    }
  }
  if (activeTab.value === 'cleanReplaceManager') {
    return {
      projectRoot: settings.projectRoot,
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
      launchAfterPush: settings.pushUseRunAs ? !!settings.pushLaunchAfterPush : false,
    }
  }
  if (activeTab.value === 'deleteSo') {
    return {
      packageName: settings.deletePackageName?.trim() || undefined,
      deleteTempSo: settings.deleteTempSo !== false,
    }
  }
  return {
    packageName: settings.packageName,
    androidInjectDir: sharedPaths.value.androidInjectDir,
    soPath: settings.soPath,
    launchActivity: settings.launchActivity,
  }
}

const getVersionUpdateSvnWarningPaths = () => [
  joinWindowsPath(settings.projectRoot, 'Survive'),
  joinWindowsPath(settings.projectRoot, 'UE4181', 'Engine', 'Source'),
]

const confirmUpdateCodeAssetsRun = () => {
  if (activeTab.value !== 'updateCodeAssets' || settings.versionUpdateDryRun === true) {
    return true
  }

  const svnPaths = getVersionUpdateSvnWarningPaths()
    .map((item) => `- ${item}`)
    .join('\n')
  return window.confirm([
    '即将更新代码/资源。',
    '',
    '注意：更新前会处理 SVN 工作副本，本地未提交的 SVN 修改可能会被 revert 或被后续 update/merge 覆盖。',
    '请先检查下面这些 SVN 路径里是否有需要保留的代码：',
    svnPaths,
    '',
    '确认不需要保留本地修改后，再继续执行。',
  ].join('\n'))
}

const runActive = async () => {
  if (activeTab.value === 'guideC') {
    return
  }
  if (!confirmUpdateCodeAssetsRun()) {
    appendLog('info', '[run] canceled before update; user should review SVN local changes first.\n')
    return
  }
  try {
    const socket = await ensureSocket()
    const payload = buildPayload()
    const jobType = activeTab.value === 'buildSo' && settings.buildMode === 'rebuildOnly' ? 'rebuildSo' : activeTab.value
    runLogDir.value = ''
    resetWorkflowState()
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
  appendLog('info', '[stop] requested\n')
  if (activeStepName.value) {
    setStepStatusByName(activeStepName.value, 'stopped')
  }
  ws.send(JSON.stringify({ action: 'terminate' }))
}

watch(
  () => [sharedPaths.value.projectFile, settings.config, settings.arch, settings.projectRoot],
  ([projectFile, config, arch, projectRoot], previousValues) => {
    const [previousProjectFile = projectFile, previousConfig = config, previousArch = arch, previousProjectRoot = projectRoot] = previousValues || []
    const previousDefaultSoPath = buildDefaultSoPath(previousProjectFile, previousConfig, previousArch, previousProjectRoot)
    const previousLegacyDefaultSoPath = buildLegacyDefaultSoPath(previousProjectFile, previousArch, previousProjectRoot)

    if (!settings.soPath || settings.soPath === previousDefaultSoPath || settings.soPath === previousLegacyDefaultSoPath) {
      settings.soPath = buildDefaultSoPath(projectFile, config, arch, projectRoot)
    }
  },
)

watch(settings, saveCurrentProfile, { deep: true })

watch(commandPreview, () => {
  if (!isRunning.value) {
    resetWorkflowState()
  }
})

onMounted(async () => {
  profileStore = readProfileStore()
  const initialProjectRoot = profileStore.activeProjectRoot || DEFAULT_PROJECT_ROOT
  await applyProjectRootChange(initialProjectRoot, { skipSaveCurrent: true })
})

onBeforeUnmount(() => {
  stopElapsedTimer()
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

.field-row.textarea-row {
  align-items: start;
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

.version-update-card {
  border: 1px solid rgba(96, 205, 255, 0.32);
  border-radius: 8px;
  background: rgba(96, 205, 255, 0.06);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.version-textarea {
  min-height: 86px;
  resize: vertical;
}

.p4-paths-textarea {
  min-height: 58px;
  resize: vertical;
}

.build-reminder-card {
  border: 1px solid rgba(255, 202, 122, 0.45);
  border-radius: 8px;
  background: rgba(255, 202, 122, 0.08);
  padding: 12px;
}

.build-reminder-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.build-reminder-step {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #ffca7a;
}

.build-reminder-title {
  margin-top: 2px;
  font-size: 15px;
  font-weight: 700;
  color: #ffe0ad;
}

.build-reminder-text {
  margin-top: 10px;
  font-size: 13px;
  color: #ffe8c2;
}

.build-reminder-code {
  margin: 10px 0 0;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 202, 122, 0.25);
  background: rgba(0, 0, 0, 0.28);
  color: #fff3de;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px;
  white-space: pre-wrap;
}

.check-line {
  display: flex;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.collapsible-header {
  cursor: pointer;
  user-select: none;
  transition: background 120ms ease, color 120ms ease;
}

.collapsible-header:hover {
  background: rgba(255, 255, 255, 0.025);
}

.collapsible-header:focus-visible {
  outline: 1px solid rgba(96, 205, 255, 0.65);
  outline-offset: -1px;
}

.accordion-title {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.accordion-arrow {
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 6px solid var(--text-secondary);
  transition: transform 120ms ease, border-left-color 120ms ease;
}

.collapsible-header:hover .accordion-arrow,
.accordion-arrow.open {
  border-left-color: var(--text-primary);
}

.accordion-arrow.open {
  transform: rotate(90deg);
}

.workflow-flow {
  display: flex;
  gap: 0;
  overflow-x: auto;
  padding: 4px 0 14px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.workflow-node-wrap {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.workflow-node {
  width: 190px;
  min-height: 92px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.035);
  padding: 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
}

.workflow-node-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.workflow-node-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 12px;
  line-height: 1;
  font-weight: 700;
}

.workflow-node-step {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.workflow-node-name {
  margin-top: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.25;
  min-height: 34px;
  overflow-wrap: anywhere;
}

.workflow-node-footer {
  margin-top: 8px;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.workflow-node-status {
  font-size: 12px;
  color: var(--text-secondary);
}

.workflow-node-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.workflow-node-duration {
  width: fit-content;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.11);
  background: rgba(0, 0, 0, 0.16);
  color: #c9d3d8;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 11px;
  line-height: 16px;
  padding: 0 6px;
}

.workflow-log-btn {
  height: 24px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
  font-size: 12px;
  padding: 0 8px;
  cursor: pointer;
}

.workflow-log-btn:hover {
  border-color: rgba(96, 205, 255, 0.65);
  color: #8bdbff;
}

.workflow-edge {
  width: 34px;
  height: 1px;
  background: rgba(255, 255, 255, 0.22);
  position: relative;
}

.workflow-edge::after {
  content: '';
  position: absolute;
  right: 0;
  top: -4px;
  border-left: 6px solid rgba(255, 255, 255, 0.22);
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
}

.workflow-node--running {
  border-color: #60cdff;
  background: rgba(96, 205, 255, 0.12);
  box-shadow: 0 0 0 1px rgba(96, 205, 255, 0.16);
}

.workflow-node--success {
  border-color: rgba(121, 217, 138, 0.75);
  background: rgba(121, 217, 138, 0.12);
}

.workflow-node--failed {
  border-color: rgba(255, 110, 122, 0.85);
  background: rgba(255, 110, 122, 0.12);
}

.workflow-node--stopped {
  border-color: rgba(255, 202, 122, 0.75);
  background: rgba(255, 202, 122, 0.11);
}

.workflow-node--running .workflow-node-dot,
.workflow-node--running .workflow-node-status {
  color: #8bdbff;
}

.workflow-node--success .workflow-node-dot,
.workflow-node--success .workflow-node-status {
  color: #79d98a;
}

.workflow-node--failed .workflow-node-dot,
.workflow-node--failed .workflow-node-status {
  color: #ff8f9a;
}

.workflow-node--stopped .workflow-node-dot,
.workflow-node--stopped .workflow-node-status {
  color: #ffca7a;
}

.preview-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-collapsed-summary {
  min-height: 42px;
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.018);
  color: var(--text-secondary);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
}

.preview-collapsed-summary span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.preview-step-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  padding: 10px;
}

.preview-step-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.preview-step-index {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}

.preview-step-name {
  margin-top: 2px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.preview-step-command {
  margin: 10px 0 0;
  padding: 10px;
  border-radius: 6px;
  background: #121212;
  color: #d9d9d9;
  border: 1px solid var(--control-stroke);
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
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
  color: #68c7ff;
  white-space: pre-wrap;
}

.terminal .stdout {
  color: #d0d0d0;
  white-space: pre-wrap;
}

.terminal .success {
  color: #65d68a;
  white-space: pre-wrap;
}

.terminal .warning {
  color: #ffd166;
  white-space: pre-wrap;
}

.terminal .error {
  color: #ff6b7a;
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
