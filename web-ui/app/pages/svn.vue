<template>
  <div class="page active">
    <div class="standard-page-header">
      <h1 class="header-title">SVN Patch</h1>
    </div>

    <div class="page-content-scroll">
      <div class="svn-two-column-layout">
        <!-- Left Column: Settings & Generation -->
        <div class="fluent-card svn-card-left">
          <div class="card-header">路径与设置</div>
          <div class="card-body form-stack">
            <div class="input-group">
              <label>路径 A (源/基准)</label>
              <div style="display: flex; gap: 8px;">
                <input type="text" class="fluent-input" v-model="pathA" placeholder="SVN URL 或本地路径" style="flex: 1;">
                <button class="fluent-btn sub" @click="selectFolder('A')" title="选择文件夹">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </button>
              </div>
            </div>

            <div class="path-swap-container">
              <button class="swap-icon-btn" @click="swapPaths" title="交换路径">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="16 18 22 12 16 6"></polyline>
                  <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
              </button>
            </div>

            <div class="input-group">
              <label>路径 B (目标)</label>
              <div style="display: flex; gap: 8px;">
                <input type="text" class="fluent-input" v-model="pathB" placeholder="本地路径" style="flex: 1;">
                <button class="fluent-btn sub" @click="selectFolder('B')" title="选择文件夹">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    <line x1="12" y1="11" x2="12" y2="17"></line>
                    <line x1="9" y1="14" x2="15" y2="14"></line>
                  </svg>
                </button>
              </div>
            </div>

            <div class="input-group margin-top-md">
              <label>Revision / 提交号</label>
              <input type="text" class="fluent-input" v-model="revision" placeholder="例如: 12345">
            </div>

            <div class="checkbox-group">
              <label class="fluent-checkbox">
                <input type="checkbox" v-model="fromRepoRoot"> <span>从仓库根目录</span>
              </label>
              <label class="fluent-checkbox">
                <input type="checkbox" v-model="useParent"> <span>包含上级目录</span>
              </label>
            </div>

            <div class="action-bar align-left">
              <button class="fluent-btn sub" @click="viewLog" :disabled="isWorking">查看日志</button>
              <button class="fluent-btn primary" @click="generatePatch" :disabled="isWorking">
                {{ isGenerating ? '生成中...' : '生成 diff' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Right Column: Patch Actions & Log -->
        <div class="fluent-card svn-card-right">
          <div class="card-header">Patch 操作</div>
          <div class="card-body svn-actions-body">
            <div class="patch-actions-header">生成 patch 后可用</div>
            <div class="big-action-buttons">
              <button class="big-action-btn" @click="savePatch" :disabled="!patchContent || isWorking">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <div class="btn-text">
                  <span>保存</span>
                  <span>.patch</span>
                  <span>文件</span>
                </div>
              </button>
              <button class="big-action-btn" @click="applyPatch" :disabled="!patchContent || isWorking">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <div class="btn-text">
                  <span>{{ isApplying ? '应用中...' : '应用' }}</span>
                  <span>到路</span>
                  <span>径 B</span>
                </div>
              </button>
            </div>
            <div class="patch-actions-header" style="margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px;">SVN Merge（无需先生成 diff）</div>
            <div class="big-action-buttons">
              <button class="big-action-btn" @click="mergeDirect" :disabled="isWorking" style="flex: 1;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="18" cy="18" r="3"></circle>
                  <circle cx="6" cy="6" r="3"></circle>
                  <path d="M6 21V9a9 9 0 0 0 9 9"></path>
                </svg>
                <div class="btn-text">
                  <span>{{ isMerging ? '合并中...' : 'SVN Merge' }}</span>
                  <span>到路径 B</span>
                </div>
              </button>
            </div>

            <div class="log-container-mini flex-grow" id="svn-log" ref="logContainer">
              <div v-for="(log, idx) in logs" :key="idx" :class="log.type">{{ log.msg }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Apply History -->
      <div class="fluent-card margin-top-lg" v-if="applyHistory.length">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span>合并历史 ({{ applyHistory.length }})</span>
          <button class="fluent-btn sub" style="font-size: 11px; padding: 2px 10px;" @click="clearHistory">清空</button>
        </div>
        <div class="card-body" style="padding: 0;">
          <div class="history-list">
            <div v-for="(h, i) in applyHistory" :key="i" class="history-item" :class="h.status">
              <span class="history-icon">{{ h.status === 'success' ? '✅' : h.status === 'partial' ? '⚠️' : '❌' }}</span>
              <span class="history-rev">r{{ h.revision }}</span>
              <span class="history-paths" :title="`${h.source} → ${h.target}`">{{ shortenPath(h.source) }} → {{ shortenPath(h.target) }}</span>
              <span class="history-time">{{ h.time }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Output Bottom -->
      <div class="fluent-card svn-preview-card margin-top-lg">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span>预览输出</span>
          <span v-if="parsedFiles.length" style="font-size: 12px; color: var(--text-secondary);">共 {{ parsedFiles.length }} 个文件</span>
        </div>
        <div class="diff-files-container" v-if="parsedFiles.length">
          <div v-for="(file, fi) in parsedFiles" :key="fi" class="diff-file-block">
            <div class="diff-file-header" @click="file.collapsed = !file.collapsed">
              <svg :class="{ rotated: !file.collapsed }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="transition: transform 0.2s; flex-shrink: 0;">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
              <span class="diff-file-name">{{ file.name }}</span>
              <span class="diff-file-stats">
                <span class="diff-stat-add" v-if="file.adds">+{{ file.adds }}</span>
                <span class="diff-stat-del" v-if="file.dels">-{{ file.dels }}</span>
              </span>
            </div>
            <div class="diff-file-content terminal" v-show="!file.collapsed" v-html="file.html"></div>
          </div>
        </div>
        <div v-else class="diff-content terminal" style="padding: 24px; text-align: center; color: var(--text-secondary);">
          生成 diff 后将在此处按文件分组显示
        </div>
      </div>
    </div>

    <!-- Toast Notification -->
    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toast.show" class="toast-notification" :class="toast.type">
          {{ toast.msg }}
        </div>
      </Transition>
    </Teleport>

    <!-- Apply Confirm Dialog -->
    <Teleport to="body">
      <div v-if="showApplyConfirm" class="modal-overlay" @click.self="showApplyConfirm = false">
        <div class="modal-dialog">
          <div class="modal-title">确认应用 Patch</div>
          <div class="modal-body">将 Patch 应用到：<br><strong>{{ pathB }}</strong><br><br>此操作会修改目标目录中的文件。</div>
          <div class="modal-actions">
            <button class="fluent-btn sub" @click="showApplyConfirm = false">取消</button>
            <button class="fluent-btn primary" @click="doApply">确认应用</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Merge Confirm Dialog -->
    <Teleport to="body">
      <div v-if="showMergeConfirm" class="modal-overlay" @click.self="showMergeConfirm = false">
        <div class="modal-dialog">
          <div class="modal-title">确认 SVN Merge</div>
          <div class="modal-body">
            将 <strong>r{{ revision }}</strong> 从路径 A 合并到：<br><strong>{{ pathB }}</strong><br><br>
            使用 <code>svn merge -c {{ revision }}</code>，冲突将直接标记在文件中。
          </div>
          <div class="modal-actions">
            <button class="fluent-btn sub" @click="showMergeConfirm = false">取消</button>
            <button class="fluent-btn primary" @click="doMerge">确认合并</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'

const pathA = ref('')
const pathB = ref('')
const revision = ref('')
const fromRepoRoot = ref(false)
const useParent = ref(false)

const patchContent = ref('')
const isGenerating = ref(false)
const isApplying = ref(false)
const isMerging = ref(false)
const logs = ref([])
const logContainer = ref(null)
const showApplyConfirm = ref(false)
const showMergeConfirm = ref(false)

const toast = ref({ show: false, msg: '', type: 'info' })
let toastTimer = null
function showToast(msg, type = 'info', duration = 4000) {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { show: true, msg, type }
  toastTimer = setTimeout(() => { toast.value.show = false }, duration)
}

// Apply history
const applyHistory = ref([])
const HISTORY_KEY = 'cgtools_svn_apply_history'

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) applyHistory.value = JSON.parse(raw)
  } catch (e) {}
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(applyHistory.value))
}

function addHistory(rev, source, target, status) {
  const time = new Date().toLocaleString('zh-CN', { hour12: false })
  applyHistory.value.unshift({ revision: rev, source, target, status, time })
  // Keep max 100 entries
  if (applyHistory.value.length > 100) applyHistory.value.length = 100
  saveHistory()
}

function clearHistory() {
  applyHistory.value = []
  localStorage.removeItem(HISTORY_KEY)
}

function shortenPath(p) {
  if (!p) return ''
  const parts = p.replace(/\\/g, '/').split('/')
  return parts.length > 2 ? '...' + '/' + parts.slice(-2).join('/') : p
}

const isWorking = computed(() => isGenerating.value || isApplying.value || isMerging.value)

import { onMounted, watch } from 'vue'

// Load settings from localStorage
onMounted(() => {
  const savedSettings = localStorage.getItem('cgtools_svn_settings')
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings)
      pathA.value = parsed.pathA || ''
      pathB.value = parsed.pathB || ''
      fromRepoRoot.value = parsed.fromRepoRoot || false
      useParent.value = parsed.useParent || false
    } catch(e) {}
  }
  loadHistory()
})

// Save settings when changed
watch([pathA, pathB, fromRepoRoot, useParent], () => {
  localStorage.setItem('cgtools_svn_settings', JSON.stringify({
    pathA: pathA.value,
    pathB: pathB.value,
    fromRepoRoot: fromRepoRoot.value,
    useParent: useParent.value
  }))
})

async function selectFolder(target) {
  try {
    const res = await $fetch('/api/system/folder')
    if (res.success && res.path) {
      if (target === 'A') {
        pathA.value = res.path
      } else {
        pathB.value = res.path
      }
    }
  } catch (err) {
    alert('请求失败，请确保您在本地 Windows 环境运行此功能。')
  }
}

function setStatus(msg) {
  // Try to update global status bar if it exists via DOM
  const el = document.getElementById('status-text')
  if (el) el.textContent = msg
}

function svnLog(msg, type = 'normal') {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  logs.value.push({ msg: `[${timestamp}] ${msg}`, type });
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  })
}

function swapPaths() {
  const temp = pathA.value;
  pathA.value = pathB.value;
  pathB.value = temp;
}

// Parse diff content into per-file segments (use ref + watch so collapsed state is mutable)
const parsedFiles = ref([])

watch(patchContent, (val) => {
  if (!val) { parsedFiles.value = []; return }
  
  const lines = val.split('\n')
  const files = []
  let currentFile = null
  
  for (const line of lines) {
    if (line.startsWith('Index: ')) {
      if (currentFile) files.push(currentFile)
      const name = line.substring(7).trim()
      const shortName = name.split('/').pop() || name
      currentFile = {
        name: shortName,
        fullPath: name,
        lines: [],
        adds: 0,
        dels: 0,
        collapsed: true,
        html: ''
      }
      currentFile.lines.push(line)
      continue
    }
    
    if (!currentFile) {
      currentFile = { name: 'header', fullPath: '', lines: [], adds: 0, dels: 0, collapsed: true, html: '' }
    }
    
    currentFile.lines.push(line)
    if (line.startsWith('+') && !line.startsWith('+++')) currentFile.adds++
    if (line.startsWith('-') && !line.startsWith('---')) currentFile.dels++
  }
  
  if (currentFile && currentFile.lines.length > 0) files.push(currentFile)
  
  for (const f of files) {
    f.html = f.lines.map(line => {
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      if (line.startsWith('+') && !line.startsWith('+++')) return `<span class="diff-add">${escaped}</span>`
      if (line.startsWith('-') && !line.startsWith('---')) return `<span class="diff-del">${escaped}</span>`
      if (line.startsWith('@@')) return `<span class="diff-header">${escaped}</span>`
      if (line.startsWith('Index:') || line.startsWith('===')) return `<span class="diff-header">${escaped}</span>`
      return escaped
    }).join('\n')
  }
  
  parsedFiles.value = files.filter(f => f.name !== 'header' || f.lines.some(l => l.trim()))
})

async function viewLog() {
  if (!revision.value || !pathA.value) { 
    alert('请输入提交号和路径'); 
    return;
  }

  setStatus('获取日志...');
  svnLog(`获取 r${revision.value} 日志...`);
  isGenerating.value = true;

  try {
    const result = await $fetch(`/api/svn/log?revision=${revision.value}&url=${encodeURIComponent(pathA.value)}`, {
      method: 'POST'
    })
    
    if (result.success) {
      patchContent.value = result.log; // Shows log in diff output area
      svnLog('获取完成', 'info');
    } else {
      svnLog('失败: ' + result.error, 'stderr');
    }
  } catch (error) {
    svnLog(`请求出错: ${error.message}`, 'stderr')
  } finally {
    isGenerating.value = false;
    setStatus('就绪');
  }
}

async function generatePatch() {
  if (!revision.value || !pathA.value) { 
    alert('请输入提交号和路径'); 
    return;
  }

  setStatus('生成 Patch...');
  svnLog(`生成 r${revision.value} Patch...`);
  isGenerating.value = true;
  patchContent.value = '';

  try {
    const result = await $fetch('/api/svn/diff', {
      method: 'POST',
      body: {
        revision: revision.value,
        url: pathA.value,
        fromRepoRoot: fromRepoRoot.value,
        parentLevels: useParent.value ? 1 : 0
      }
    })

    if (result.success) {
      patchContent.value = result.content;
      svnLog(result.content ? `成功 (${result.content.length} bytes)` : '内容为空!', result.content ? 'info' : 'stderr');
    } else {
      svnLog('失败: ' + result.error, 'stderr');
    }
  } catch (error) {
    svnLog(`请求出错: ${error.message}`, 'stderr')
  } finally {
    isGenerating.value = false;
    setStatus('就绪');
  }
}

function savePatch() {
  if (!patchContent.value) return;
  const blob = new Blob([patchContent.value], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `patch_r${revision.value.replace(':', '_')}.patch`;
  a.click();
  svnLog('已下载');
}

async function applyPatch() {
  if (!patchContent.value) { 
    svnLog('没有可应用的 Patch 内容', 'stderr')
    showToast('没有可应用的 Patch 内容', 'error')
    return
  }
  if (!pathB.value) { 
    svnLog('请先填写目标路径 B', 'stderr')
    showToast('请先填写目标路径 B', 'error')
    return
  }
  showApplyConfirm.value = true
}

async function doApply() {
  showApplyConfirm.value = false

  setStatus('应用 Patch...')
  svnLog('⏳ 正在应用 Patch，请稍候...')
  showToast('⏳ 正在应用 Patch...', 'info', 10000)
  isApplying.value = true

  try {
    const result = await $fetch('/api/svn/apply', {
      method: 'POST',
      body: {
        patchContent: patchContent.value,
        targetDir: pathB.value,
        sourcePath: pathA.value,
        revision: revision.value
      }
    })

    if (result.success && result.partial) {
      const conflictCount = result.conflicts?.length || 0
      svnLog(`⚠️ 部分应用成功，${conflictCount} 处冲突。请检查目标目录下的 .rej 文件手动解决。\n` + (result.message || ''), 'warning')
      showToast(`⚠️ Patch 部分成功，${conflictCount} 处冲突，请检查 .rej 文件`, 'warning', 8000)
      addHistory(revision.value, pathA.value, pathB.value, 'partial')
    } else if (result.success) {
      svnLog('✅ 应用成功!\n' + (result.message || ''), 'info')
      showToast('✅ Patch 应用成功!', 'success', 5000)
      addHistory(revision.value, pathA.value, pathB.value, 'success')
    } else {
      svnLog('❌ 应用失败: ' + (result.message || '未知错误'), 'stderr')
      showToast('❌ 应用失败: ' + (result.message || '未知错误'), 'error', 6000)
      addHistory(revision.value, pathA.value, pathB.value, 'fail')
    }
  } catch (error) {
    const errMsg = error?.data?.message || error?.message || JSON.stringify(error) || '请求异常'
    svnLog('❌ 请求出错: ' + errMsg, 'stderr')
    showToast('❌ 请求出错: ' + errMsg, 'error', 6000)
  } finally {
    isApplying.value = false
    setStatus('就绪')
  }
}

function mergeDirect() {
  if (!revision.value) {
    svnLog('请先填写 Revision 提交号', 'stderr')
    showToast('请先填写 Revision 提交号', 'error')
    return
  }
  if (!pathA.value) {
    svnLog('请先填写路径 A（源）', 'stderr')
    showToast('请先填写路径 A（源）', 'error')
    return
  }
  if (!pathB.value) {
    svnLog('请先填写路径 B（目标）', 'stderr')
    showToast('请先填写路径 B（目标）', 'error')
    return
  }
  showMergeConfirm.value = true
}

async function doMerge() {
  showMergeConfirm.value = false

  setStatus('SVN Merge...')
  svnLog(`⏳ 正在执行 svn merge -c ${revision.value}，请稍候...`)
  showToast('⏳ 正在执行 SVN Merge...', 'info', 10000)
  isMerging.value = true

  try {
    const result = await $fetch('/api/svn/merge', {
      method: 'POST',
      body: {
        revision: revision.value,
        sourcePath: pathA.value,
        targetDir: pathB.value
      }
    })

    if (result.success && result.partial) {
      const conflictCount = result.conflicts?.length || 0
      svnLog(`⚠️ Merge 完成，${conflictCount} 个文件有冲突。请在目标文件中搜索 <<<<<<< 解决冲突。\n` + (result.message || ''), 'warning')
      showToast(`⚠️ Merge 有 ${conflictCount} 处冲突，请搜索 <<<<<<< 解决`, 'warning', 8000)
      addHistory(revision.value, pathA.value, pathB.value, 'partial')
    } else if (result.success && (result.updated?.length > 0)) {
      svnLog('✅ SVN Merge 成功!\n' + (result.message || ''), 'info')
      showToast('✅ SVN Merge 成功!', 'success', 5000)
      addHistory(revision.value, pathA.value, pathB.value, 'success')
    } else if (result.success) {
      svnLog('ℹ️ SVN Merge 完成，无文件变更。\n' + (result.message || ''), 'info')
      showToast('ℹ️ Merge 完成，无文件变更', 'info', 5000)
    } else {
      svnLog('❌ Merge 失败: ' + (result.message || '未知错误'), 'stderr')
      showToast('❌ Merge 失败: ' + (result.message || '未知错误'), 'error', 6000)
      addHistory(revision.value, pathA.value, pathB.value, 'fail')
    }
  } catch (error) {
    const errMsg = error?.data?.message || error?.message || JSON.stringify(error) || '请求异常'
    svnLog('❌ Merge 请求出错: ' + errMsg, 'stderr')
    showToast('❌ Merge 请求出错: ' + errMsg, 'error', 6000)
    addHistory(revision.value, pathA.value, pathB.value, 'fail')
  } finally {
    isMerging.value = false
    setStatus('就绪')
  }
}
</script>

<style scoped>
.diff-files-container {
  max-height: 600px;
  overflow-y: auto;
}

.diff-file-block {
  border-bottom: 1px solid var(--divider, rgba(255,255,255,0.06));
}

.diff-file-block:last-child {
  border-bottom: none;
}

.diff-file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  cursor: pointer;
  user-select: none;
  background: rgba(255,255,255,0.02);
  transition: background 0.15s;
}

.diff-file-header:hover {
  background: rgba(255,255,255,0.05);
}

.diff-file-header svg.rotated {
  transform: rotate(90deg);
}

.diff-file-name {
  font-family: 'Source Sans 3', monospace;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
  flex: 1;
}

.diff-file-stats {
  display: flex;
  gap: 8px;
  font-size: 12px;
  font-family: monospace;
}

.diff-stat-add {
  color: #4ec96e;
}

.diff-stat-del {
  color: #f85149;
}

.diff-file-content {
  padding: 8px 16px;
  font-size: 12px;
  line-height: 1.5;
  background: #0d0d0d;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
}

/* Toast Notification */
.toast-notification {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 9999;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  max-width: 420px;
  word-break: break-word;
}
.toast-notification.info {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
}
.toast-notification.success {
  background: linear-gradient(135deg, #16a34a, #15803d);
}
.toast-notification.error {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
}
.toast-notification.warning {
  background: linear-gradient(135deg, #d97706, #b45309);
}
.toast-enter-active { animation: toast-in 0.3s ease; }
.toast-leave-active { animation: toast-in 0.2s ease reverse; }
@keyframes toast-in {
  from { opacity: 0; transform: translateX(40px); }
  to { opacity: 1; transform: translateX(0); }
}

/* Modal Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-dialog {
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 24px;
  min-width: 360px;
  max-width: 460px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: #e0e0e0;
  margin-bottom: 12px;
}
.modal-body {
  font-size: 14px;
  color: #a0a0a0;
  line-height: 1.6;
  margin-bottom: 20px;
}
.modal-body strong {
  color: #60a5fa;
}
.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

/* History List */
.history-list {
  max-height: 280px;
  overflow-y: auto;
}
.history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  font-size: 13px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  transition: background 0.15s;
}
.history-item:hover {
  background: rgba(255,255,255,0.03);
}
.history-item:last-child {
  border-bottom: none;
}
.history-icon {
  flex-shrink: 0;
  font-size: 14px;
}
.history-rev {
  flex-shrink: 0;
  font-family: monospace;
  font-weight: 600;
  color: #60a5fa;
  min-width: 80px;
}
.history-paths {
  flex: 1;
  color: var(--text-secondary, #a0a0a0);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-time {
  flex-shrink: 0;
  color: var(--text-secondary, #a0a0a0);
  font-size: 11px;
  opacity: 0.7;
}
</style>
