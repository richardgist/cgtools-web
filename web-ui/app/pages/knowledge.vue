<template>
  <div class="page active" style="display: flex;">
    <div class="standard-page-header">
      <h1 class="header-title">知识卡片</h1>
      <div class="header-controls">
        <span class="kc-badge">{{ filteredCards.length }} / {{ cards.length }} 张卡片</span>
        <button class="fluent-btn" @click="openCreateModal">新增卡片</button>
        <button class="fluent-btn" @click="openImportModal">📁 从文件夹导入</button>
        <button class="fluent-btn" @click="openDeduplicateModal" style="color: #e67e22;">🧹 清理冗余</button>
        <button class="fluent-btn" @click="rebuildIndex" :disabled="loading || rebuildingIndex">
          {{ rebuildingIndex ? '重建索引中...' : '刷新索引' }}
        </button>
        <button class="fluent-btn" @click="refreshCards" :disabled="loading || rebuildingIndex">
          {{ loading ? '加载中...' : '刷新' }}
        </button>
      </div>
    </div>

    <div class="kc-body">
      <!-- Sidebar Filters -->
      <aside class="kc-sidebar">
        <!-- Search -->
        <div class="kc-filter-section">
          <input
            v-model="searchText"
            class="fluent-input kc-search"
            placeholder="搜索标题、标签、内容..."
          />
        </div>

        <!-- Stats -->
        <div class="kc-stats-panel">
          <div class="kc-stat-row">
            <span class="kc-stat-label">总卡片数</span>
            <span class="kc-stat-value">{{ cards.length }}</span>
          </div>
          <div class="kc-stat-row">
            <span class="kc-stat-label">领域数</span>
            <span class="kc-stat-value">{{ Object.keys(domainCounts).length }}</span>
          </div>
          <div class="kc-stat-row">
            <span class="kc-stat-label">日期跨度</span>
            <span class="kc-stat-value">{{ uniqueDates }} 天</span>
          </div>
        </div>

        <!-- Domain Filter -->
        <div class="kc-filter-section">
          <div class="kc-filter-title kc-collapsible-title" @click="domainCollapsed = !domainCollapsed">
            <span>领域</span>
            <svg class="kc-collapse-icon" :class="{ rotated: !domainCollapsed }" viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
          </div>
          <div v-show="!domainCollapsed" class="kc-domain-tags">
            <span
              v-for="(count, domain) in domainCounts"
              :key="domain"
              class="kc-domain-tag"
              :class="{ active: activeDomains.has(String(domain)) }"
              :style="domainTagStyle(String(domain))"
              @click="toggleDomain(String(domain))"
            >
              {{ domain }} ({{ count }})
            </span>
          </div>
        </div>

        <!-- Difficulty Filter -->
        <div class="kc-filter-section">
          <div class="kc-filter-title">难度</div>
          <div class="kc-diff-filters">
            <button
              v-for="d in [1, 2, 3]"
              :key="d"
              class="kc-diff-btn"
              :class="{ active: activeDifficulties.has(d) }"
              @click="toggleDifficulty(d)"
            >
              {{ '⭐'.repeat(d) }}
            </button>
          </div>
        </div>

        <!-- Date Filter -->
        <div class="kc-filter-section">
          <div class="kc-filter-title">日期</div>
          <div class="kc-date-tabs">
            <button
              v-for="tab in dateTabOptions"
              :key="tab.key"
              class="kc-date-tab"
              :class="{ active: dateTabMode === tab.key }"
              @click="dateTabMode = tab.key"
            >{{ tab.label }}</button>
          </div>
          <div class="kc-date-filters">
            <span
              v-for="item in dateGroupItems"
              :key="item.key"
              class="kc-date-item"
              :class="{ active: activeDateKeys.has(item.key) }"
              @click="toggleDateKey(item.key)"
            >
              {{ item.label }} ({{ item.count }})
            </span>
          </div>
        </div>

        <!-- Tags Filter -->
        <div class="kc-filter-section">
          <div class="kc-filter-title">标签</div>
          <div class="kc-tag-cloud">
            <span
              v-for="(count, tag) in topTags"
              :key="tag"
              class="kc-tag-item"
              :class="{ active: activeTags.has(String(tag)) }"
              @click="toggleTag(String(tag))"
            >
              {{ tag }} ({{ count }})
            </span>
          </div>
        </div>

        <!-- Reset -->
        <div class="kc-filter-section">
          <button class="fluent-btn danger" style="width:100%;" @click="resetFilters">重置所有筛选</button>
        </div>
      </aside>

      <!-- Cards Grid -->
      <div class="kc-content">
        <div v-if="filteredCards.length > 0" class="kc-grid">
          <div
            v-for="card in filteredCards"
            :key="card.id"
            class="kc-card"
            @click="openCard(card)"
          >
            <div class="kc-card-header">
              <div class="kc-card-title">{{ card.title }}</div>
              <div class="kc-card-diff">{{ '⭐'.repeat(card.difficulty || 1) }}</div>
            </div>
            <div class="kc-card-meta">
              <span class="kc-card-domain" :style="{ background: getDomainColor(card.domain) }">{{ card.domain }}</span>
              <span class="kc-card-date">{{ card.date }}</span>
            </div>
            <div class="kc-card-summary">{{ card.summary || '' }}</div>
            <div class="kc-card-tags">
              <span v-for="tag in (card.tags || [])" :key="tag" class="kc-card-tag">{{ tag }}</span>
            </div>
          </div>
        </div>

        <div v-else class="kc-empty">
          <div class="kc-empty-icon">📭</div>
          <div class="kc-empty-text">{{ loading ? '加载中...' : '没有找到匹配的知识卡片' }}</div>
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <Teleport to="body">
      <div v-if="createModalVisible" class="kc-modal-overlay" @click.self="closeCreateModal">
        <div class="kc-modal kc-create-modal">
          <button class="kc-modal-close" @click="closeCreateModal">×</button>
          <h2 class="kc-modal-title">粘贴卡片全文并创建</h2>
          <p class="kc-create-hint">
            支持粘贴包含 frontmatter（如 id/title/date/tags）的完整 Markdown 内容，提交后会写入卡片目录并自动刷新索引。
          </p>
          <textarea
            v-model="newCardMarkdown"
            class="kc-create-textarea"
            placeholder="请粘贴完整知识卡片内容..."
          />
          <label class="kc-create-overwrite">
            <input v-model="createAllowOverwrite" type="checkbox" />
            id 已存在时允许覆盖
          </label>
          <div v-if="createCardError" class="kc-create-error">{{ createCardError }}</div>
          <div class="kc-create-actions">
            <button class="fluent-btn" @click="closeCreateModal">取消</button>
            <button class="fluent-btn" :disabled="createSubmitting" @click="submitCreateCard">
              {{ createSubmitting ? '创建中...' : '创建卡片' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Detail Modal -->
    <Teleport to="body">
      <div v-if="selectedCard" class="kc-modal-overlay" @click.self="closeModal">
        <div class="kc-modal">
          <button class="kc-modal-close" @click="closeModal">×</button>
          <h2 class="kc-modal-title">{{ selectedCard.title }}</h2>
          <div class="kc-modal-meta">
            <span class="kc-card-domain" :style="{ background: getDomainColor(selectedCard.domain) }">{{ selectedCard.domain }}</span>
            <span class="kc-card-diff">{{ String.fromCodePoint(0x2B50).repeat(selectedCard.difficulty || 1) }}</span>
            <span class="kc-card-date">{{ selectedCard.date }}</span>
            <span v-if="selectedCard.source" class="kc-modal-source">Source: {{ selectedCard.source }}</span>
            <button
              v-if="!editingCard"
              class="fluent-btn kc-edit-btn"
              style="margin-left: auto;"
              @click="startEditCard"
            >
              Edit
            </button>
            <template v-else>
              <button class="fluent-btn kc-edit-btn" style="margin-left: auto;" @click="cancelEditCard" :disabled="savingCardEdit">Cancel</button>
              <button class="fluent-btn primary kc-edit-btn" @click="saveCardEdit" :disabled="savingCardEdit">
                {{ savingCardEdit ? 'Saving...' : 'Save' }}
              </button>
            </template>
            <button class="fluent-btn danger kc-delete-btn" @click="confirmDeleteCard" :disabled="deleting">
              {{ deleting ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
          <div class="kc-card-tags" style="margin-bottom:16px;">
            <span v-for="tag in (selectedCard.tags || [])" :key="tag" class="kc-card-tag">{{ tag }}</span>
          </div>
          <div v-if="cardContentLoading" class="kc-modal-loading">Loading content...</div>
          <div v-else-if="editingCard">
            <textarea
              v-model="editingCardMarkdown"
              class="kc-edit-textarea"
              placeholder="Please edit card markdown body..."
            />
            <div v-if="editCardError" class="kc-create-error">{{ editCardError }}</div>
          </div>
          <div v-else class="kc-modal-body" v-html="cardContentHtml"></div>
        </div>
      </div>
    </Teleport>

    <!-- Delete Confirm Modal -->
    <Teleport to="body">
      <div v-if="deleteConfirmVisible" class="kc-modal-overlay" @click.self="cancelDelete">
        <div class="kc-modal kc-confirm-modal">
          <h2 class="kc-modal-title">确认删除</h2>
          <p class="kc-confirm-text">确定要删除卡片 <strong>{{ deleteTargetCard?.title }}</strong>（{{ deleteTargetCard?.id }}）吗？此操作不可撤销。</p>
          <div class="kc-create-actions">
            <button class="fluent-btn" @click="cancelDelete">取消</button>
            <button class="fluent-btn danger" :disabled="deleting" @click="executeDelete">
              {{ deleting ? '删除中...' : '确认删除' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Deduplicate Modal -->
    <Teleport to="body">
      <div v-if="deduplicateModalVisible" class="kc-modal-overlay" @click.self="closeDeduplicateModal">
        <div class="kc-modal kc-create-modal" style="max-width: 720px;">
          <button class="kc-modal-close" @click="closeDeduplicateModal">×</button>
          <h2 class="kc-modal-title">🧹 清理冗余卡片</h2>

          <div v-if="deduplicateLoading" class="kc-modal-loading">正在扫描重复卡片...</div>

          <div v-else-if="deduplicateGroups.length === 0 && !deduplicateError" style="padding: 24px 0; text-align: center; color: #27ae60;">
            <p style="font-size: 1.2em;">✅ 没有发现重复卡片，数据很干净！</p>
          </div>

          <div v-else>
            <div v-if="deduplicateError" class="kc-create-error">{{ deduplicateError }}</div>

            <p class="kc-create-hint" style="margin-bottom: 12px;">
              发现 <strong>{{ deduplicateGroups.length }}</strong> 组重复，共 <strong style="color: #e74c3c;">{{ deduplicateTotalCount }}</strong> 张冗余卡片。
              每组保留 ID 最小的（最早创建的），其余将被删除。
            </p>

            <!-- Select/Deselect All -->
            <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 12px;">
              <label style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 0.9em;">
                <input type="checkbox" :checked="allDuplicatesSelected" @change="toggleSelectAllDuplicates" />
                全选 / 全不选
              </label>
              <span style="font-size: 0.85em; color: #888;">已选 {{ selectedDuplicateIds.size }} 张待删除</span>
            </div>

            <div class="kc-import-result-list" style="max-height: 400px; overflow-y: auto;">
              <div v-for="(group, gi) in deduplicateGroups" :key="gi" class="kc-dedup-group">
                <div class="kc-dedup-group-title">
                  📄 {{ group.title }} <span style="color: #888; font-size: 0.85em;">({{ group.duplicates.length + 1 }} 张)</span>
                </div>
                <div class="kc-dedup-item keep">
                  <span class="kc-dedup-icon">✅</span>
                  <span class="kc-dedup-id">{{ group.keep.id }}</span>
                  <span class="kc-dedup-label">保留</span>
                </div>
                <div v-for="dup in group.duplicates" :key="dup.id" class="kc-dedup-item duplicate">
                  <label style="display: flex; align-items: center; gap: 6px; width: 100%; cursor: pointer;">
                    <input type="checkbox" :checked="selectedDuplicateIds.has(dup.id)" @change="toggleDuplicateSelection(dup.id)" />
                    <span class="kc-dedup-icon">🗑️</span>
                    <span class="kc-dedup-id">{{ dup.id }}</span>
                    <span class="kc-dedup-label" style="color: #e74c3c;">冗余</span>
                  </label>
                </div>
              </div>
            </div>

            <div v-if="deduplicateResult" class="kc-import-summary" style="margin-top: 12px;">
              ✅ 已删除 <strong>{{ deduplicateResult.deleted }}</strong> 张冗余卡片
              <span v-if="deduplicateResult.notFound.length > 0" style="color: #f0ad4e;">，{{ deduplicateResult.notFound.length }} 张未找到</span>
            </div>
          </div>

          <div class="kc-create-actions">
            <button class="fluent-btn" @click="closeDeduplicateModal">关闭</button>
            <button
              v-if="deduplicateGroups.length > 0 && !deduplicateResult"
              class="fluent-btn danger"
              :disabled="deduplicateDeleting || selectedDuplicateIds.size === 0"
              @click="executeDeduplicateDelete"
            >
              {{ deduplicateDeleting ? '删除中...' : `🗑️ 删除选中的 ${selectedDuplicateIds.size} 张冗余卡片` }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Import Folder Modal -->
    <Teleport to="body">
      <div v-if="importModalVisible" class="kc-modal-overlay" @click.self="closeImportModal">
        <div class="kc-modal kc-create-modal">
          <button class="kc-modal-close" @click="closeImportModal">×</button>
          <h2 class="kc-modal-title">📁 文件导入与序号整理</h2>
          <p class="kc-create-hint">
            支持拖入 .md 文件、选择单个文件或选择整个文件夹导入。推算当天的最新卡片序号，<strong>自动处理卡片 ID</strong>，最后同步上传到云端系统。
          </p>

          <!-- 拖拽区域 -->
          <div
            class="kc-drop-zone"
            :class="{ 'kc-drop-zone-active': isDragOver, 'kc-drop-zone-disabled': importSubmitting }"
            @dragover.prevent="onDragOver"
            @dragleave.prevent="onDragLeave"
            @drop.prevent="onDropFiles"
          >
            <div class="kc-drop-zone-content">
              <span class="kc-drop-zone-icon">{{ isDragOver ? '📥' : '📄' }}</span>
              <span class="kc-drop-zone-text">
                {{ isDragOver ? '松开鼠标以导入文件' : '将 .md 文件拖到此处' }}
              </span>
              <span class="kc-drop-zone-hint">或点击下方按钮选择文件/文件夹</span>
            </div>
          </div>

          <!-- 已拖入的待导入文件列表 -->
          <div v-if="droppedFiles.length > 0 && importResults.length === 0" class="kc-dropped-files-preview">
            <div class="kc-dropped-files-header">
              <span>已选择 {{ droppedFiles.length }} 个 .md 文件</span>
              <button class="fluent-btn fluent-btn-sm" @click="droppedFiles = []">清空</button>
            </div>
            <div class="kc-dropped-files-list">
              <div v-for="(f, idx) in droppedFiles" :key="idx" class="kc-dropped-file-item">
                📄 {{ f.filename }}
              </div>
            </div>
            <button
              class="fluent-btn primary"
              style="margin-top: 8px; width: 100%;"
              :disabled="importSubmitting"
              @click="handleDroppedFilesImport"
            >
              {{ importSubmitting ? '导入中...' : `🚀 导入这 ${droppedFiles.length} 个文件` }}
            </button>
          </div>

          <label class="kc-create-overwrite">
            <input v-model="importAllowOverwrite" type="checkbox" />
            冲突时覆盖云端数据 (若不勾选，则为本地冲突文件分配全新的序号并重命名)
          </label>
          <div v-if="importError" class="kc-create-error">{{ importError }}</div>

          <!-- Import Results -->
          <div v-if="importResults.length > 0" class="kc-import-results">
            <div class="kc-import-summary">
              共 {{ importTotalFiles }} 个文件：
              <span class="kc-import-stat success">✅ 导入 {{ importedCount }}</span>
              <span class="kc-import-stat warning">⏭ 跳过 {{ skippedCount }}</span>
              <span v-if="errorsCount > 0" class="kc-import-stat error">❌ 失败 {{ errorsCount }}</span>
            </div>
            <div class="kc-import-result-list">
              <div
                v-for="(result, idx) in importResults"
                :key="idx"
                class="kc-import-result-item"
                :class="result.status"
              >
                <span class="kc-import-result-icon">
                  {{ result.status === 'imported' ? '✅' : result.status === 'overwritten' ? '🔄' : result.status === 'skipped' ? '⏭' : '❌' }}
                </span>
                <span class="kc-import-result-name">{{ result.filename }}</span>
                <span v-if="result.id" class="kc-import-result-id">{{ result.id }}</span>
                <span v-if="result.message" class="kc-import-result-msg">{{ result.message }}</span>
              </div>
            </div>
          </div>

          <p v-if="!hasDirectoryPickerAPI" class="kc-create-hint" style="color: #f0ad4e; font-size: 0.85em; margin-top: 8px;">
            ⚠️ 当前浏览器不支持目录读写 API，将使用兼容模式：可正常导入云端，但无法自动重命名本地文件。
          </p>
          <!-- Hidden fallback input for browsers without showDirectoryPicker -->
          <input
            ref="folderInputRef"
            type="file"
            webkitdirectory
            directory
            multiple
            style="display: none;"
            @change="handleFolderInputChange"
          />
          <!-- Hidden input for selecting individual files -->
          <input
            ref="fileInputRef"
            type="file"
            multiple
            accept=".md"
            style="display: none;"
            @change="handleFileInputChange"
          />
          <div class="kc-create-actions">
            <button class="fluent-btn" @click="closeImportModal">关闭</button>
            <button
              class="fluent-btn"
              :disabled="importSubmitting"
              @click="quickSyncMissingCards('all-missing')"
            >
              {{ importSubmitting ? '刷新中...' : '只刷未入库（全部）' }}
            </button>
            <button
              class="fluent-btn"
              :disabled="importSubmitting"
              @click="quickSyncMissingCards('today-missing')"
            >
              {{ importSubmitting ? '刷新中...' : '只刷今天未入库' }}
            </button>
            <button class="fluent-btn" :disabled="importSubmitting" @click="fileInputRef?.click()">
              {{ importSubmitting ? '处理中...' : '📄 选择文件' }}
            </button>
            <button class="fluent-btn primary" :disabled="importSubmitting" @click="handleDirectoryImport">
              {{ importSubmitting ? '整理并上传中...' : '📂 选择文件夹' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'

interface KnowledgeCard {
  id: string
  title: string
  domain: string
  difficulty: number
  date: string
  tags: string[]
  summary: string
  source?: string
}

type QuickSyncMode = 'all-missing' | 'today-missing'
type FolderActionMode = 'full-import' | QuickSyncMode

const CARD_ID_PATTERN = /^KC-\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{3}$/

const cards = ref<KnowledgeCard[]>([])
const loading = ref(false)
const rebuildingIndex = ref(false)
const domainCollapsed = ref(true)
const searchText = ref('')
const activeDomains = ref(new Set<string>())
const activeDifficulties = ref(new Set<number>())
const activeDateKeys = ref(new Set<string>())
const dateTabMode = ref<'year' | 'month' | 'week' | 'day'>('month')
const dateTabOptions = [
  { key: 'year' as const, label: '年' },
  { key: 'month' as const, label: '月' },
  { key: 'week' as const, label: '周' },
  { key: 'day' as const, label: '日' },
]

// 切换维度时自动清除日期筛选
watch(dateTabMode, () => {
  activeDateKeys.value = new Set()
})
const activeTags = ref(new Set<string>())

const selectedCard = ref<KnowledgeCard | null>(null)
const cardContentHtml = ref('')
const cardContentLoading = ref(false)
const cardRawMarkdown = ref('')
const editingCard = ref(false)
const editingCardMarkdown = ref('')
const savingCardEdit = ref(false)
const editCardError = ref('')
const createModalVisible = ref(false)
const newCardMarkdown = ref('')
const createSubmitting = ref(false)
const createCardError = ref('')
const createAllowOverwrite = ref(false)

// Delete state
const deleting = ref(false)
const deleteConfirmVisible = ref(false)
const deleteTargetCard = ref<KnowledgeCard | null>(null)

// Deduplicate state
interface DedupGroup {
  title: string
  keep: KnowledgeCard
  duplicates: KnowledgeCard[]
}
const deduplicateModalVisible = ref(false)
const deduplicateLoading = ref(false)
const deduplicateError = ref('')
const deduplicateGroups = ref<DedupGroup[]>([])
const deduplicateTotalCount = ref(0)
const deduplicateDeleting = ref(false)
const deduplicateResult = ref<{ deleted: number; notFound: string[] } | null>(null)
const selectedDuplicateIds = ref(new Set<string>())

const allDuplicatesSelected = computed(() => {
  if (deduplicateGroups.value.length === 0) return false
  let total = 0
  for (const g of deduplicateGroups.value) {
    total += g.duplicates.length
  }
  return total > 0 && selectedDuplicateIds.value.size === total
})

// Import folder state
const importModalVisible = ref(false)
const importAllowOverwrite = ref(false)
const importSubmitting = ref(false)
const importError = ref('')
const importResults = ref<{ filename: string; id: string; status: string; message?: string }[]>([])
const importTotalFiles = ref(0)
const importedCount = ref(0)
const skippedCount = ref(0)
const errorsCount = ref(0)
const folderInputRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const hasDirectoryPickerAPI = ref(typeof window !== 'undefined' && 'showDirectoryPicker' in window)
const pendingFolderAction = ref<FolderActionMode>('full-import')
const isDragOver = ref(false)
const droppedFiles = ref<{ filename: string; content: string }[]>([])

// Domain colors
const DOMAIN_COLORS: Record<string, string> = {
  'UE4': '#6C5CE7',
  'C++': '#E17055',
  'Web': '#00B894',
  'Git': '#FDCB6E',
  'Python': '#0984E3',
  '工具链': '#74B9FF',
  '引擎': '#A29BFE',
  '编辑器': '#FD79A8',
  '编辑器工具': '#FD79A8',
}
const DEFAULT_COLOR = '#60CDFF'

function getDomainColor(domain: string): string {
  return DOMAIN_COLORS[domain] || DEFAULT_COLOR
}

function domainTagStyle(domain: string) {
  const color = getDomainColor(domain)
  const isActive = activeDomains.value.has(domain)
  return {
    background: `${color}${isActive ? '44' : '22'}`,
    color: color,
    borderColor: isActive ? `${color}88` : 'transparent',
  }
}

// Computed stats
const domainCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const c of cards.value) {
    const d = c.domain || '未分类'
    counts[d] = (counts[d] || 0) + 1
  }
  return counts
})

const uniqueDates = computed(() => {
  const dates = new Set(cards.value.map(c => c.date))
  return dates.size
})

/** 获取 ISO 周编号 */
function getISOWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  // 计算 ISO 周: 参考 https://en.wikipedia.org/wiki/ISO_week_date
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1
  const weekDay = d.getDay() || 7 // Monday=1 ... Sunday=7
  const weekNum = Math.ceil((dayOfYear - weekDay + 10) / 7)
  // 处理跨年：week可能为0或53+
  if (weekNum < 1) {
    return `${d.getFullYear() - 1}-W53`
  }
  if (weekNum > 52) {
    const dec28 = new Date(d.getFullYear(), 11, 28)
    const maxWeek = Math.ceil((Math.floor((dec28.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1 - ((dec28.getDay() || 7)) + 10) / 7)
    if (weekNum > maxWeek) {
      return `${d.getFullYear() + 1}-W01`
    }
  }
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

/** 获取周的日期范围标签 */
function getWeekRangeLabel(weekKey: string): string {
  // weekKey 格式: 2026-W09
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return weekKey
  const year = Number(match[1])
  const week = Number(match[2])
  // 根据 ISO week 反算周一日期
  const jan4 = new Date(year, 0, 4)
  const jan4Day = jan4.getDay() || 7
  const mondayOfWeek1 = new Date(jan4.getTime() - (jan4Day - 1) * 86400000)
  const monday = new Date(mondayOfWeek1.getTime() + (week - 1) * 7 * 86400000)
  const sunday = new Date(monday.getTime() + 6 * 86400000)
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  return `${fmt(monday)}~${fmt(sunday)}`
}

/** 将卡片日期转换为各维度的 key */
function getDateKey(dateStr: string, mode: 'year' | 'month' | 'week' | 'day'): string {
  if (!dateStr) return ''
  switch (mode) {
    case 'year': return dateStr.slice(0, 4) // 2026
    case 'month': return dateStr.slice(0, 7) // 2026-02
    case 'week': return getISOWeekKey(dateStr) // 2026-W09
    case 'day': return dateStr // 2026-02-26
  }
}

/** 根据当前 tab 模式生成分组列表 */
const dateGroupItems = computed(() => {
  const mode = dateTabMode.value
  const counts: Record<string, number> = {}
  for (const c of cards.value) {
    const key = getDateKey(c.date, mode)
    if (!key) continue
    counts[key] = (counts[key] || 0) + 1
  }
  return Object.entries(counts)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, count]) => {
      let label = key
      if (mode === 'year') {
        label = `${key}年`
      } else if (mode === 'month') {
        label = key // 2026-02
      } else if (mode === 'week') {
        label = `${key} (${getWeekRangeLabel(key)})`
      }
      // day: 直接显示日期
      return { key, label, count }
    })
})

const topTags = computed(() => {
  const counts: Record<string, number> = {}
  for (const c of cards.value) {
    for (const t of (c.tags || [])) {
      counts[t] = (counts[t] || 0) + 1
    }
  }
  // Sort by count, take top 30
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30)
  return Object.fromEntries(sorted)
})

// Filtered cards
const filteredCards = computed(() => {
  return cards.value.filter(card => {
    // Search
    if (searchText.value) {
      const s = searchText.value.toLowerCase()
      const searchable = `${card.title} ${card.domain} ${(card.tags || []).join(' ')} ${card.summary || ''} ${card.source || ''}`.toLowerCase()
      if (!searchable.includes(s)) return false
    }
    // Domain
    if (activeDomains.value.size > 0 && !activeDomains.value.has(card.domain)) return false
    // Difficulty
    if (activeDifficulties.value.size > 0 && !activeDifficulties.value.has(card.difficulty)) return false
    // Date (multi-dimension)
    if (activeDateKeys.value.size > 0) {
      const cardKey = getDateKey(card.date, dateTabMode.value)
      if (!activeDateKeys.value.has(cardKey)) return false
    }
    // Tags
    if (activeTags.value.size > 0) {
      const cardTags = new Set(card.tags || [])
      let hasMatch = false
      for (const t of activeTags.value) {
        if (cardTags.has(t)) { hasMatch = true; break }
      }
      if (!hasMatch) return false
    }
    return true
  })
})

// Toggle filters
function toggleDomain(domain: string) {
  const s = new Set(activeDomains.value)
  if (s.has(domain)) s.delete(domain); else s.add(domain)
  activeDomains.value = s
}

function toggleDifficulty(d: number) {
  const s = new Set(activeDifficulties.value)
  if (s.has(d)) s.delete(d); else s.add(d)
  activeDifficulties.value = s
}

function toggleDateKey(key: string) {
  const s = new Set(activeDateKeys.value)
  if (s.has(key)) s.delete(key); else s.add(key)
  activeDateKeys.value = s
}

function toggleTag(tag: string) {
  const s = new Set(activeTags.value)
  if (s.has(tag)) s.delete(tag); else s.add(tag)
  activeTags.value = s
}

function resetFilters() {
  searchText.value = ''
  activeDomains.value = new Set()
  activeDifficulties.value = new Set()
  activeDateKeys.value = new Set()
  activeTags.value = new Set()
}

// Fetch cards
async function refreshCards() {
  loading.value = true
  try {
    const data = await $fetch<{ cards: KnowledgeCard[] }>('/api/knowledge')
    cards.value = data.cards || []
  } catch (e) {
    console.error('Failed to load cards:', e)
    cards.value = []
  } finally {
    loading.value = false
  }
}

async function rebuildIndex() {
  rebuildingIndex.value = true
  try {
    await $fetch('/api/knowledge/rebuild', { method: 'POST' })
    await refreshCards()
  } catch (e) {
    console.error('Failed to rebuild knowledge index:', e)
  } finally {
    rebuildingIndex.value = false
  }
}

function openCreateModal() {
  createModalVisible.value = true
  createCardError.value = ''
}

function closeCreateModal() {
  createModalVisible.value = false
  createCardError.value = ''
}

async function submitCreateCard() {
  const markdown = newCardMarkdown.value.trim()
  if (!markdown) {
    createCardError.value = '请输入卡片内容'
    return
  }

  createSubmitting.value = true
  createCardError.value = ''

  try {
    const data = await $fetch<{ id: string }>('/api/knowledge/create', {
      method: 'POST',
      body: {
        markdown,
        overwrite: createAllowOverwrite.value,
      },
    })

    await refreshCards()
    closeCreateModal()
    newCardMarkdown.value = ''
    createAllowOverwrite.value = false

    const createdCard = cards.value.find(card => card.id === data.id)
    if (createdCard) {
      await openCard(createdCard)
    }
  } catch (e: any) {
    createCardError.value = e?.data?.statusMessage || e?.message || '创建卡片失败'
  } finally {
    createSubmitting.value = false
  }
}

// Open card detail
async function openCard(card: KnowledgeCard) {
  selectedCard.value = card
  cardContentHtml.value = ''
  cardRawMarkdown.value = ''
  editingCard.value = false
  editingCardMarkdown.value = ''
  editCardError.value = ''
  cardContentLoading.value = true

  try {
    const data = await $fetch<{ markdown: string }>(`/api/knowledge/${card.id}`)
    cardRawMarkdown.value = data.markdown || ''
    cardContentHtml.value = markdownToHtml(data.markdown)
  } catch {
    cardRawMarkdown.value = ''
    cardContentHtml.value = '<p>加载内容失败</p>'
  } finally {
    cardContentLoading.value = false
  }
}

function closeModal() {
  selectedCard.value = null
  editingCard.value = false
  editingCardMarkdown.value = ''
  editCardError.value = ''
  savingCardEdit.value = false
}

function startEditCard() {
  if (!selectedCard.value) return
  editingCard.value = true
  editCardError.value = ''
  editingCardMarkdown.value = cardRawMarkdown.value || ''
}

function cancelEditCard() {
  editingCard.value = false
  editCardError.value = ''
  editingCardMarkdown.value = cardRawMarkdown.value || ''
}

async function saveCardEdit() {
  const card = selectedCard.value
  if (!card) return

  const markdown = editingCardMarkdown.value.trim()
  if (!markdown) {
    editCardError.value = '卡片内容不能为空'
    return
  }

  savingCardEdit.value = true
  editCardError.value = ''

  try {
    const data = await $fetch<{ markdown: string }>(`/api/knowledge/${card.id}`, {
      method: 'PUT',
      body: {
        markdown,
      },
    })

    cardRawMarkdown.value = data.markdown || markdown
    editingCardMarkdown.value = cardRawMarkdown.value
    cardContentHtml.value = markdownToHtml(cardRawMarkdown.value)
    editingCard.value = false

    await refreshCards()
    const latest = cards.value.find(item => item.id === card.id)
    if (latest) {
      selectedCard.value = latest
    }
  } catch (e: any) {
    editCardError.value = e?.data?.statusMessage || e?.message || '保存失败'
  } finally {
    savingCardEdit.value = false
  }
}

// Delete card
function confirmDeleteCard() {
  if (!selectedCard.value) return
  deleteTargetCard.value = selectedCard.value
  deleteConfirmVisible.value = true
}

function cancelDelete() {
  deleteConfirmVisible.value = false
  deleteTargetCard.value = null
}

async function executeDelete() {
  const card = deleteTargetCard.value
  if (!card) return

  deleting.value = true
  try {
    await $fetch(`/api/knowledge/${card.id}`, { method: 'DELETE' })
    deleteConfirmVisible.value = false
    deleteTargetCard.value = null
    selectedCard.value = null
    await refreshCards()
  } catch (e: any) {
    console.error('Failed to delete card:', e)
    alert(e?.data?.statusMessage || e?.message || '删除失败')
  } finally {
    deleting.value = false
  }
}

// Deduplicate
async function openDeduplicateModal() {
  deduplicateModalVisible.value = true
  deduplicateLoading.value = true
  deduplicateError.value = ''
  deduplicateGroups.value = []
  deduplicateTotalCount.value = 0
  deduplicateResult.value = null
  selectedDuplicateIds.value = new Set()

  try {
    const data = await $fetch<{
      groups: DedupGroup[]
      totalDuplicates: number
    }>('/api/knowledge/find-duplicates')
    deduplicateGroups.value = data.groups || []
    deduplicateTotalCount.value = data.totalDuplicates || 0

    // 默认全选所有冗余卡片
    const ids = new Set<string>()
    for (const g of data.groups || []) {
      for (const dup of g.duplicates) {
        ids.add(dup.id)
      }
    }
    selectedDuplicateIds.value = ids
  } catch (e: any) {
    deduplicateError.value = e?.data?.statusMessage || e?.message || '扫描失败'
  } finally {
    deduplicateLoading.value = false
  }
}

function closeDeduplicateModal() {
  deduplicateModalVisible.value = false
}

function toggleDuplicateSelection(id: string) {
  const s = new Set(selectedDuplicateIds.value)
  if (s.has(id)) {
    s.delete(id)
  } else {
    s.add(id)
  }
  selectedDuplicateIds.value = s
}

function toggleSelectAllDuplicates() {
  if (allDuplicatesSelected.value) {
    selectedDuplicateIds.value = new Set()
  } else {
    const ids = new Set<string>()
    for (const g of deduplicateGroups.value) {
      for (const dup of g.duplicates) {
        ids.add(dup.id)
      }
    }
    selectedDuplicateIds.value = ids
  }
}

async function executeDeduplicateDelete() {
  const ids = Array.from(selectedDuplicateIds.value)
  if (ids.length === 0) return

  deduplicateDeleting.value = true
  deduplicateError.value = ''

  try {
    const data = await $fetch<{
      deleted: number
      notFound: string[]
      cardsCount: number
    }>('/api/knowledge/batch-delete', {
      method: 'POST',
      body: { ids },
    })

    deduplicateResult.value = { deleted: data.deleted, notFound: data.notFound || [] }

    // 清除已删除的分组
    for (const g of deduplicateGroups.value) {
      g.duplicates = g.duplicates.filter(d => !selectedDuplicateIds.value.has(d.id))
    }
    deduplicateGroups.value = deduplicateGroups.value.filter(g => g.duplicates.length > 0)
    selectedDuplicateIds.value = new Set()

    await refreshCards()
  } catch (e: any) {
    deduplicateError.value = e?.data?.statusMessage || e?.message || '删除失败'
  } finally {
    deduplicateDeleting.value = false
  }
}

function getTodayPrefix() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const MM = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `KC-${yyyy}-${MM}-${dd}-`
}

function extractCardIdFromMarkdown(filename: string, content: string) {
  const normalized = content.replace(/^\ufeff/, '')
  const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)

  let idFromMeta = ''
  if (match) {
    const idMatch = match[1].match(/^id\s*:\s*(.+)$/m)
    if (idMatch) {
      idFromMeta = idMatch[1].trim().replace(/^['"]|['"]$/g, '')
    }
  }

  const idFromFileName = filename.replace(/\.md$/i, '')
  if (idFromMeta && CARD_ID_PATTERN.test(idFromMeta)) return idFromMeta
  if (CARD_ID_PATTERN.test(idFromFileName)) return idFromFileName
  return ''
}

function isTodayCardId(id: string) {
  const normalized = id.replace(/_/g, '-')
  return normalized.startsWith(getTodayPrefix())
}

function updateImportSummary(results: { status: string }[], totalFiles: number) {
  importTotalFiles.value = totalFiles
  importedCount.value = results.filter(r => r.status === 'imported' || r.status === 'overwritten').length
  skippedCount.value = results.filter(r => r.status === 'skipped').length
  errorsCount.value = results.filter(r => r.status === 'error').length
}

async function collectMdFilesFromDirectoryHandle(dirHandle: any) {
  const files: { filename: string; content: string }[] = []
  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.md')) continue
    const file = await entry.getFile()
    files.push({ filename: entry.name, content: await file.text() })
  }
  return files
}

async function collectMdFilesFromFileList(files: FileList) {
  const items: { filename: string; content: string }[] = []
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (!file.name.toLowerCase().endsWith('.md')) continue
    items.push({ filename: file.name, content: await file.text() })
  }
  return items
}

async function quickSyncMissingCards(mode: QuickSyncMode) {
  if (!(window as any).showDirectoryPicker) {
    pendingFolderAction.value = mode
    folderInputRef.value?.click()
    return
  }

  importSubmitting.value = true
  importError.value = ''
  importResults.value = []

  try {
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' })
    const localFiles = await collectMdFilesFromDirectoryHandle(dirHandle)
    await syncMissingCardsFromLocalFiles(localFiles, mode)
  } catch (e: any) {
    if (e.name === 'AbortError') {
      importError.value = '文件操作已取消'
    } else {
      importError.value = '操作出错: ' + (e.message || String(e))
    }
  } finally {
    importSubmitting.value = false
  }
}

async function syncMissingCardsFromLocalFiles(
  localFiles: { filename: string; content: string }[],
  mode: QuickSyncMode
) {
  const indexData = await $fetch<{ version: number, cards: any[] }>('/api/knowledge')
  const existingIds = new Set(indexData.cards?.map(card => String(card.id || '')) || [])
  const queuedIds = new Set<string>()

  const filePayloads: { filename: string, content: string }[] = []
  const resultsPreview: { status: string, filename: string, message: string, id: string }[] = []

  for (const localFile of localFiles) {
    const id = extractCardIdFromMarkdown(localFile.filename, localFile.content)
    if (!id) {
      resultsPreview.push({
        status: 'skipped',
        id: '',
        filename: localFile.filename,
        message: '缺少合法卡片 ID（需 frontmatter.id 或文件名符合 KC-YYYY-MM-DD-NNN）',
      })
      continue
    }

    if (mode === 'today-missing' && !isTodayCardId(id)) {
      resultsPreview.push({
        status: 'skipped',
        id,
        filename: localFile.filename,
        message: '不是今天的卡片，已跳过',
      })
      continue
    }

    if (existingIds.has(id)) {
      resultsPreview.push({
        status: 'skipped',
        id,
        filename: localFile.filename,
        message: '卡片已在数据库中，已跳过',
      })
      continue
    }

    if (queuedIds.has(id)) {
      resultsPreview.push({
        status: 'skipped',
        id,
        filename: localFile.filename,
        message: '本地目录中有重复 ID，已跳过',
      })
      continue
    }

    queuedIds.add(id)
    filePayloads.push({
      filename: `${id}.md`,
      content: localFile.content,
    })
  }

  await uploadFilePayloads(filePayloads, resultsPreview, {
    overwrite: false,
    totalFiles: localFiles.length,
    emptyMessage: mode === 'today-missing' ? '今天没有需要补刷的卡片' : '本地没有需要补刷的卡片',
  })
}

// Import folder
function openImportModal() {
  importModalVisible.value = true
  importError.value = ''
  pendingFolderAction.value = 'full-import'
  importResults.value = []
  importTotalFiles.value = 0
  importedCount.value = 0
  skippedCount.value = 0
  errorsCount.value = 0
}

function closeImportModal() {
  importModalVisible.value = false
  importError.value = ''
  pendingFolderAction.value = 'full-import'
  isDragOver.value = false
  droppedFiles.value = []
}

async function handleDirectoryImport() {
  // 如果不支持 showDirectoryPicker，使用 input fallback
  if (!(window as any).showDirectoryPicker) {
    pendingFolderAction.value = 'full-import'
    folderInputRef.value?.click()
    return
  }

  importSubmitting.value = true
  importError.value = ''
  importResults.value = []

  try {
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    
    // 获取当天的前缀
    const dDate = new Date()
    const yyyy = dDate.getFullYear()
    const MM = String(dDate.getMonth() + 1).padStart(2, '0')
    const dd = String(dDate.getDate()).padStart(2, '0')
    const prefix = `KC-${yyyy}-${MM}-${dd}-`

    // 获取云端卡片列表
    const indexData = await $fetch<{ version: number, cards: any[] }>('/api/knowledge')
    const existingIds = new Set(indexData.cards?.map(c => c.id) || [])
    
    let maxSeq = 0
    for (const id of existingIds) {
      if (id.startsWith(prefix)) {
        const parts = id.split('-')
        const seq = parseInt(parts[parts.length - 1], 10)
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq
        }
      }
    }
    
    const filePayloads: { filename: string, content: string }[] = []
    const resultsPreview: { status: string, filename: string, message: string, id: string }[] = []
    
    for await (const entry of (dirHandle as any).values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.md')) {
        const fileHandle = entry
        const file = await fileHandle.getFile()
        const content = await file.text()
        
        const normalized = content.replace(/^\ufeff/, '')
        const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)
        
        let existingFileId = ''
        if (match) {
          const idMatch = match[1].match(/^id\s*:\s*(.+)$/m)
          if (idMatch) {
            existingFileId = idMatch[1].trim().replace(/^['"]|['"]$/g, '')
          }
        }
        
        const baseNameId = file.name.replace(/\.md$/i, '')
        const CARD_ID_PATTERN = /^KC-\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{3}$/
        
        const effectiveId = existingFileId && CARD_ID_PATTERN.test(existingFileId) ? existingFileId 
            : (CARD_ID_PATTERN.test(baseNameId) ? baseNameId : '')
            
        let chosenId = effectiveId
        let needUpdateFile = false
        
        // 自动分配新序号：1.完全没序号 2.在云端存在且不想覆盖 3.前缀不对(跨天等，这里暂时只判断冲突)
        if (!chosenId || (existingIds.has(chosenId) && !importAllowOverwrite.value)) {
          maxSeq++
          chosenId = `${prefix}${String(maxSeq).padStart(3, '0')}`
          needUpdateFile = true
          existingIds.add(chosenId)
        } else if (chosenId !== existingFileId || entry.name !== `${chosenId}.md`) {
          // 有效序号，但文件名不同或内容 frontmatter 中不一致，则强制修复
          needUpdateFile = true
        }

        let newContent = content
        if (needUpdateFile) {
          if (!match) { // 无 frontmatter
            newContent = `---\nid: ${chosenId}\ntitle: ${baseNameId}\n---\n\n${normalized}`
          } else {
            const fmContent = match[1]
            const body = match[2]
            let newFm = fmContent
            if (/^id\s*:/m.test(fmContent)) {
              newFm = fmContent.replace(/^id\s*:.*$/m, `id: ${chosenId}`)
            } else {
              newFm = `id: ${chosenId}\n${fmContent}`
            }
            newContent = `---\n${newFm}\n---\n${body}`
          }
          
          try {
            if (entry.name !== `${chosenId}.md`) {
              // 重命名逻辑：新建 + 删除旧的
              const newFileHandle = await dirHandle.getFileHandle(`${chosenId}.md`, { create: true })
              const writable = await newFileHandle.createWritable()
              await writable.write(newContent)
              await writable.close()
              
              await dirHandle.removeEntry(entry.name)
              resultsPreview.push({ status: 'imported', id: chosenId, filename: entry.name, message: `已重命名为 ${chosenId}.md 并规范内容` })
            } else {
              // 修改同名文件
              const writable = await fileHandle.createWritable()
              await writable.write(newContent)
              await writable.close()
              resultsPreview.push({ status: 'imported', id: chosenId, filename: entry.name, message: `已更新文件内的 ID 为 ${chosenId}` })
            }
          } catch(err: any) {
             resultsPreview.push({ status: 'error', id: chosenId, filename: entry.name, message: `本地文件修改失败: ${err.message}` })
          }
        }
        
        filePayloads.push({ filename: `${chosenId}.md`, content: newContent })
      }
    }
    
    await uploadFilePayloads(filePayloads, resultsPreview)
  } catch (e: any) {
    if (e.name === 'AbortError') {
      importError.value = '文件操作已被取消'
    } else {
      importError.value = '操作出错: ' + (e.message || String(e))
    }
  } finally {
    importSubmitting.value = false
  }
}

// Fallback: 处理 <input webkitdirectory> 选择的文件
async function handleFolderInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  importSubmitting.value = true
  importError.value = ''
  importResults.value = []
  const actionMode = pendingFolderAction.value

  try {
    if (actionMode !== 'full-import') {
      const localFiles = await collectMdFilesFromFileList(files)
      await syncMissingCardsFromLocalFiles(localFiles, actionMode)
      return
    }

    // 获取当天的前缀
    const dDate = new Date()
    const yyyy = dDate.getFullYear()
    const MM = String(dDate.getMonth() + 1).padStart(2, '0')
    const dd = String(dDate.getDate()).padStart(2, '0')
    const prefix = `KC-${yyyy}-${MM}-${dd}-`

    // 获取云端卡片列表
    const indexData = await $fetch<{ version: number, cards: any[] }>('/api/knowledge')
    const existingIds = new Set(indexData.cards?.map(c => c.id) || [])

    let maxSeq = 0
    for (const id of existingIds) {
      if (id.startsWith(prefix)) {
        const parts = id.split('-')
        const seq = parseInt(parts[parts.length - 1], 10)
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq
        }
      }
    }

    const filePayloads: { filename: string, content: string }[] = []
    const resultsPreview: { status: string, filename: string, message: string, id: string }[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.name.toLowerCase().endsWith('.md')) continue

      const content = await file.text()
      const normalized = content.replace(/^\ufeff/, '')
      const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)

      let existingFileId = ''
      if (match) {
        const idMatch = match[1].match(/^id\s*:\s*(.+)$/m)
        if (idMatch) {
          existingFileId = idMatch[1].trim().replace(/^['"]|['"]$/g, '')
        }
      }

      const baseNameId = file.name.replace(/\.md$/i, '')
      const CARD_ID_PATTERN = /^KC-\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{3}$/

      const effectiveId = existingFileId && CARD_ID_PATTERN.test(existingFileId) ? existingFileId
          : (CARD_ID_PATTERN.test(baseNameId) ? baseNameId : '')

      let chosenId = effectiveId

      if (!chosenId || (existingIds.has(chosenId) && !importAllowOverwrite.value)) {
        maxSeq++
        chosenId = `${prefix}${String(maxSeq).padStart(3, '0')}`
        existingIds.add(chosenId)
      }

      // 在 fallback 模式下无法写回本地文件，仅构建上传内容
      let newContent = content
      if (!match) {
        newContent = `---\nid: ${chosenId}\ntitle: ${baseNameId}\n---\n\n${normalized}`
      } else {
        const fmContent = match[1]
        const body = match[2]
        let newFm = fmContent
        if (/^id\s*:/m.test(fmContent)) {
          newFm = fmContent.replace(/^id\s*:.*$/m, `id: ${chosenId}`)
        } else {
          newFm = `id: ${chosenId}\n${fmContent}`
        }
        newContent = `---\n${newFm}\n---\n${body}`
      }

      resultsPreview.push({ status: 'imported', id: chosenId, filename: file.name, message: `已分配 ID ${chosenId}（兼容模式，本地文件未修改）` })
      filePayloads.push({ filename: `${chosenId}.md`, content: newContent })
    }

    await uploadFilePayloads(filePayloads, resultsPreview)
  } catch (e: any) {
    importError.value = '操作出错: ' + (e.message || String(e))
  } finally {
    importSubmitting.value = false
    // 重置 input 以便下次可以再选同一文件夹
    pendingFolderAction.value = 'full-import'
    input.value = ''
  }
}

// 拖拽事件处理
function onDragOver(e: DragEvent) {
  if (importSubmitting.value) return
  isDragOver.value = true
}

function onDragLeave(e: DragEvent) {
  isDragOver.value = false
}

async function onDropFiles(e: DragEvent) {
  isDragOver.value = false
  if (importSubmitting.value) return
  
  const dt = e.dataTransfer
  if (!dt || !dt.files || dt.files.length === 0) return

  const mdFiles: { filename: string; content: string }[] = []
  for (let i = 0; i < dt.files.length; i++) {
    const file = dt.files[i]
    if (file.name.toLowerCase().endsWith('.md')) {
      mdFiles.push({ filename: file.name, content: await file.text() })
    }
  }

  if (mdFiles.length === 0) {
    importError.value = '没有找到 .md 文件，请拖入 Markdown 文件'
    return
  }

  // 追加到已拖入的文件列表（去重）
  const existingNames = new Set(droppedFiles.value.map(f => f.filename))
  for (const mf of mdFiles) {
    if (!existingNames.has(mf.filename)) {
      droppedFiles.value.push(mf)
      existingNames.add(mf.filename)
    }
  }
  importError.value = ''
}

// 处理拖入的文件批量导入
async function handleDroppedFilesImport() {
  if (droppedFiles.value.length === 0) return

  importSubmitting.value = true
  importError.value = ''
  importResults.value = []

  try {
    await importFilesFromList(droppedFiles.value)
    droppedFiles.value = []
  } catch (e: any) {
    importError.value = '操作出错: ' + (e.message || String(e))
  } finally {
    importSubmitting.value = false
  }
}

// 处理选择单独文件的 input change
async function handleFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  importSubmitting.value = true
  importError.value = ''
  importResults.value = []

  try {
    const mdFiles: { filename: string; content: string }[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.name.toLowerCase().endsWith('.md')) {
        mdFiles.push({ filename: file.name, content: await file.text() })
      }
    }
    await importFilesFromList(mdFiles)
  } catch (e: any) {
    importError.value = '操作出错: ' + (e.message || String(e))
  } finally {
    importSubmitting.value = false
    input.value = ''
  }
}

// 公共：从文件列表导入（用于拖拽和选择文件两种场景）
async function importFilesFromList(mdFiles: { filename: string; content: string }[]) {
  const dDate = new Date()
  const yyyy = dDate.getFullYear()
  const MM = String(dDate.getMonth() + 1).padStart(2, '0')
  const dd = String(dDate.getDate()).padStart(2, '0')
  const prefix = `KC-${yyyy}-${MM}-${dd}-`

  const indexData = await $fetch<{ version: number, cards: any[] }>('/api/knowledge')
  const existingIds = new Set(indexData.cards?.map(c => c.id) || [])

  let maxSeq = 0
  for (const id of existingIds) {
    if (id.startsWith(prefix)) {
      const parts = id.split('-')
      const seq = parseInt(parts[parts.length - 1], 10)
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq
      }
    }
  }

  const filePayloads: { filename: string, content: string }[] = []
  const resultsPreview: { status: string, filename: string, message: string, id: string }[] = []
  const CARD_ID_PATTERN = /^KC-\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{3}$/

  for (const mdFile of mdFiles) {
    const content = mdFile.content
    const normalized = content.replace(/^\ufeff/, '')
    const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)

    let existingFileId = ''
    if (match) {
      const idMatch = match[1].match(/^id\s*:\s*(.+)$/m)
      if (idMatch) {
        existingFileId = idMatch[1].trim().replace(/^['"]|['"]$/g, '')
      }
    }

    const baseNameId = mdFile.filename.replace(/\.md$/i, '')
    const effectiveId = existingFileId && CARD_ID_PATTERN.test(existingFileId) ? existingFileId
        : (CARD_ID_PATTERN.test(baseNameId) ? baseNameId : '')

    let chosenId = effectiveId

    if (!chosenId || (existingIds.has(chosenId) && !importAllowOverwrite.value)) {
      maxSeq++
      chosenId = `${prefix}${String(maxSeq).padStart(3, '0')}`
      existingIds.add(chosenId)
    }

    let newContent = content
    if (!match) {
      newContent = `---\nid: ${chosenId}\ntitle: ${baseNameId}\n---\n\n${normalized}`
    } else {
      const fmContent = match[1]
      const body = match[2]
      let newFm = fmContent
      if (/^id\s*:/m.test(fmContent)) {
        newFm = fmContent.replace(/^id\s*:.*$/m, `id: ${chosenId}`)
      } else {
        newFm = `id: ${chosenId}\n${fmContent}`
      }
      newContent = `---\n${newFm}\n---\n${body}`
    }

    resultsPreview.push({ status: 'imported', id: chosenId, filename: mdFile.filename, message: `已分配 ID ${chosenId}` })
    filePayloads.push({ filename: `${chosenId}.md`, content: newContent })
  }

  await uploadFilePayloads(filePayloads, resultsPreview)
}

// 公共：上传文件到云端
async function uploadFilePayloads(
  filePayloads: { filename: string, content: string }[],
  resultsPreview: { status: string, filename: string, message: string, id: string }[],
  options?: {
    overwrite?: boolean
    totalFiles?: number
    emptyMessage?: string
  }
) {
  if (filePayloads.length > 0) {
    const data = await $fetch<{
      ok: boolean
      imported: number
      skipped: number
      errors: number
      totalFiles: number
      cardsCount: number
      results: { filename: string; id: string; status: string; message?: string }[]
      message?: string
    }>('/api/knowledge/import-files', {
      method: 'POST',
      body: {
        files: filePayloads,
        overwrite: options?.overwrite ?? importAllowOverwrite.value,
      },
    })

    // 合并前端本地记录与服务端反馈
    const finalResults = [...resultsPreview]
    for (const r of data.results || []) {
      if (r.status !== 'imported' && r.status !== 'overwritten') {
        finalResults.push(r as any)
      } else if (!resultsPreview.find(p => p.id === r.id)) {
        finalResults.push(r as any)
      }
    }

    importResults.value = finalResults
    updateImportSummary(finalResults, options?.totalFiles ?? finalResults.length)
    if (data.message) importError.value = data.message

    if ((data.imported || 0) > 0) {
      await refreshCards()
    }
  } else {
    importResults.value = resultsPreview
    updateImportSummary(resultsPreview, options?.totalFiles ?? resultsPreview.length)
    importError.value = resultsPreview.length > 0 ? '' : (options?.emptyMessage ?? '没有找到需要导入的 .md 文件')
  }
}

// Simple Markdown -> HTML
function markdownToHtml(md: string): string {
  if (!md) return ''
  let html = md

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const l = lang || 'text'
    const escaped = code.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<pre><code class="language-${l}">${escaped}</code></pre>`
  })

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>')

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Blockquote
  html = html.replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>')

  // List items
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')

  // Paragraphs
  const lines = html.split('\n')
  const result: string[] = []
  for (const line of lines) {
    const stripped = line.trim()
    if (stripped && !stripped.startsWith('<')) {
      result.push(`<p>${stripped}</p>`)
    } else {
      result.push(line)
    }
  }
  html = result.join('\n')

  return html
}

// Keyboard
function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (deleteConfirmVisible.value) {
    cancelDelete()
    return
  }
  if (importModalVisible.value) {
    closeImportModal()
    return
  }
  if (createModalVisible.value) {
    closeCreateModal()
    return
  }
  if (selectedCard.value) {
    if (editingCard.value) {
      cancelEditCard()
      return
    }
    closeModal()
  }
}

onMounted(() => {
  refreshCards()
  document.addEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
.kc-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* Sidebar */
.kc-sidebar {
  width: 260px;
  background: var(--bg-nav);
  border-right: 1px solid var(--divider);
  padding: 16px;
  overflow-y: auto;
  flex-shrink: 0;
}

.kc-filter-section {
  margin-bottom: 20px;
}

.kc-filter-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
  font-weight: 600;
}

.kc-collapsible-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
  margin-bottom: 4px;
}
.kc-collapsible-title:hover {
  color: var(--text-secondary);
}

.kc-collapse-icon {
  transition: transform 0.2s;
  color: var(--text-tertiary);
}
.kc-collapse-icon.rotated {
  transform: rotate(180deg);
}

.kc-search {
  width: 100%;
}

/* Stats */
.kc-stats-panel {
  background: rgba(255,255,255,0.03);
  border-radius: var(--radius-md);
  padding: 12px;
  margin-bottom: 20px;
}

.kc-stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
  font-size: 12px;
}
.kc-stat-label { color: var(--text-tertiary); }
.kc-stat-value { color: var(--text-primary); font-weight: 600; }

/* Domain tags */
.kc-domain-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.kc-domain-tag {
  padding: 3px 10px;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}
.kc-domain-tag:hover {
  transform: scale(1.05);
}

/* Difficulty */
.kc-diff-filters {
  display: flex;
  gap: 8px;
}
.kc-diff-btn {
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--control-stroke);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}
.kc-diff-btn:hover { background: rgba(255,255,255,0.1); }
.kc-diff-btn.active {
  background: rgba(96, 205, 255, 0.15);
  border-color: var(--accent-default);
  color: var(--text-primary);
}

/* Date */
.kc-date-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 8px;
  background: rgba(255,255,255,0.04);
  border-radius: var(--radius-sm);
  padding: 2px;
}
.kc-date-tab {
  flex: 1;
  padding: 4px 0;
  border: none;
  border-radius: calc(var(--radius-sm) - 1px);
  background: transparent;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}
.kc-date-tab:hover {
  color: var(--text-secondary);
  background: rgba(255,255,255,0.06);
}
.kc-date-tab.active {
  background: rgba(96, 205, 255, 0.18);
  color: var(--accent-default);
}

.kc-date-filters {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
  padding-right: 2px;
}
.kc-date-item {
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: rgba(255,255,255,0.05);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kc-date-item:hover { background: rgba(255,255,255,0.1); }
.kc-date-item.active {
  background: rgba(96, 205, 255, 0.15);
  border-color: var(--accent-default);
  color: var(--accent-default);
}

/* Tags */
.kc-tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.kc-tag-item {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: rgba(255,255,255,0.05);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}
.kc-tag-item:hover { background: rgba(255,255,255,0.1); }
.kc-tag-item.active {
  background: rgba(96, 205, 255, 0.15);
  border-color: var(--accent-default);
  color: var(--accent-default);
}

/* Badge */
.kc-badge {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 14px;
  background: rgba(96, 205, 255, 0.12);
  color: var(--accent-default);
  font-weight: 600;
}

/* Content Grid */
.kc-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.kc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

/* Card */
.kc-card {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1.0);
  position: relative;
  overflow: hidden;
  user-select: text;
  -webkit-user-select: text;
}
.kc-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--accent-default), #A29BFE);
  opacity: 0;
  transition: opacity 0.3s;
}
.kc-card:hover {
  transform: translateY(-4px);
  border-color: #454545;
  box-shadow: var(--shadow-hover);
  background: var(--bg-card-hover);
}
.kc-card:hover::before { opacity: 1; }

.kc-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
}
.kc-card-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
  flex: 1;
  margin-right: 8px;
}
.kc-card-diff {
  font-size: 12px;
  white-space: nowrap;
  flex-shrink: 0;
}

.kc-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.kc-card-domain {
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
}
.kc-card-date {
  font-size: 11px;
  color: var(--text-tertiary);
}

.kc-card-summary {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.kc-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.kc-card-tag {
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 10px;
  background: rgba(255,255,255,0.06);
  color: var(--text-tertiary);
}

/* Empty */
.kc-empty {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-tertiary);
}
.kc-empty-icon { font-size: 48px; margin-bottom: 16px; }
.kc-empty-text { font-size: 16px; }

/* Modal */
.kc-modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  z-index: 2000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
  backdrop-filter: blur(4px);
  animation: kcFadeIn 0.2s ease;
}
@keyframes kcFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.kc-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 800px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 32px;
  position: relative;
  animation: kcSlideIn 0.3s ease;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  user-select: text;
  -webkit-user-select: text;
}
@keyframes kcSlideIn {
  from { opacity: 0; transform: translateY(20px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.kc-modal-close {
  position: absolute;
  top: 16px; right: 16px;
  width: 32px; height: 32px;
  border-radius: 50%;
  background: rgba(255,255,255,0.06);
  border: 1px solid var(--control-stroke);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  user-select: none;
  -webkit-user-select: none;
}
.kc-modal-close:hover {
  background: rgba(255, 99, 132, 0.15);
  color: var(--danger);
}

.kc-modal-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 8px;
  padding-right: 40px;
  color: var(--text-primary);
}

.kc-modal-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--divider);
}
.kc-modal-source {
  font-size: 12px;
  color: var(--text-tertiary);
}
.kc-modal-loading {
  color: var(--text-tertiary);
  font-size: 14px;
  padding: 20px 0;
}

.kc-create-modal {
  max-width: 900px;
}

.kc-create-hint {
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.kc-create-textarea {
  width: 100%;
  min-height: 360px;
  background: #121212;
  border: 1px solid var(--control-stroke);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  padding: 12px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}

.kc-create-overwrite {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}

.kc-create-error {
  margin-top: 10px;
  color: #ff99a4;
  font-size: 12px;
}

.kc-create-actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Modal body markdown */
.kc-modal-body :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 20px 0 8px;
}
.kc-modal-body :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent-default);
  margin: 18px 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--divider);
}
.kc-modal-body :deep(h4) {
  font-size: 14px;
  font-weight: 600;
  margin: 14px 0 6px;
  color: var(--text-primary);
}
.kc-modal-body :deep(p),
.kc-modal-body :deep(li) {
  color: var(--text-secondary);
  line-height: 1.7;
  margin-bottom: 6px;
  font-size: 14px;
}
.kc-modal-body :deep(strong) {
  color: var(--text-primary);
}
.kc-modal-body :deep(blockquote) {
  border-left: 3px solid var(--accent-default);
  padding: 8px 16px;
  margin: 12px 0;
  background: rgba(96, 205, 255, 0.05);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-secondary);
}
.kc-modal-body :deep(pre) {
  background: #0d0d0d;
  border: 1px solid #333;
  border-radius: var(--radius-sm);
  padding: 16px;
  margin: 12px 0;
  overflow-x: auto;
}
.kc-modal-body :deep(code) {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
}
.kc-modal-body :deep(p code),
.kc-modal-body :deep(li code) {
  background: rgba(96, 205, 255, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--accent-default);
}

/* Delete button in detail modal */
.kc-edit-btn {
  font-size: 12px;
  padding: 4px 12px;
}

.kc-delete-btn {
  margin-left: 4px;
  font-size: 12px;
  padding: 4px 12px;
}

.kc-edit-textarea {
  width: 100%;
  min-height: 380px;
  background: #121212;
  border: 1px solid var(--control-stroke);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  padding: 12px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}

/* Confirm modal */
.kc-confirm-modal {
  max-width: 460px;
}
.kc-confirm-text {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 20px;
}
.kc-confirm-text strong {
  color: var(--text-primary);
}

/* Import folder */
.kc-import-field {
  margin-bottom: 12px;
}
.kc-import-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  font-weight: 600;
}

/* Drop zone */
.kc-drop-zone {
  margin-top: 12px;
  border: 2px dashed var(--control-stroke);
  border-radius: var(--radius-md);
  padding: 24px 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background: rgba(255,255,255,0.02);
}
.kc-drop-zone:hover {
  border-color: var(--accent-default);
  background: rgba(var(--accent-default-rgb, 96, 165, 250), 0.05);
}
.kc-drop-zone-active {
  border-color: var(--accent-default) !important;
  background: rgba(var(--accent-default-rgb, 96, 165, 250), 0.1) !important;
  transform: scale(1.01);
}
.kc-drop-zone-disabled {
  opacity: 0.5;
  pointer-events: none;
}
.kc-drop-zone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.kc-drop-zone-icon {
  font-size: 28px;
}
.kc-drop-zone-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.kc-drop-zone-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* Dropped files preview */
.kc-dropped-files-preview {
  margin-top: 12px;
  border: 1px solid var(--control-stroke);
  border-radius: var(--radius-md);
  padding: 12px;
  background: rgba(46, 204, 113, 0.04);
}
.kc-dropped-files-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.fluent-btn-sm {
  padding: 2px 8px !important;
  font-size: 11px !important;
  min-width: auto !important;
}
.kc-dropped-files-list {
  max-height: 150px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.kc-dropped-file-item {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 3px 6px;
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.04);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kc-import-results {
  margin-top: 16px;
  border: 1px solid var(--control-stroke);
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.02);
  padding: 12px;
}

.kc-import-summary {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.kc-import-stat {
  font-weight: 600;
  font-size: 12px;
}
.kc-import-stat.success { color: #2ecc71; }
.kc-import-stat.warning { color: #f39c12; }
.kc-import-stat.error { color: #e74c3c; }

.kc-import-result-list {
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.kc-import-result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: rgba(255,255,255,0.03);
}
.kc-import-result-item.imported,
.kc-import-result-item.overwritten {
  background: rgba(46, 204, 113, 0.08);
}
.kc-import-result-item.skipped {
  background: rgba(243, 156, 18, 0.08);
}
.kc-import-result-item.error {
  background: rgba(231, 76, 60, 0.08);
}

.kc-import-result-icon {
  flex-shrink: 0;
}
.kc-import-result-name {
  color: var(--text-primary);
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
.kc-import-result-id {
  color: var(--accent-default);
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 11px;
}
.kc-import-result-msg {
  color: var(--text-tertiary);
  font-size: 11px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Deduplicate styles */
.kc-dedup-group {
  margin-bottom: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.kc-dedup-group-title {
  padding: 8px 12px;
  font-weight: 600;
  font-size: 0.9em;
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.kc-dedup-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 0.85em;
}
.kc-dedup-item.keep {
  background: rgba(46, 204, 113, 0.08);
}
.kc-dedup-item.duplicate {
  background: rgba(231, 76, 60, 0.05);
}
.kc-dedup-item.duplicate:hover {
  background: rgba(231, 76, 60, 0.1);
}
.kc-dedup-icon {
  flex-shrink: 0;
}
.kc-dedup-id {
  font-family: monospace;
  font-size: 0.9em;
  color: #aaa;
}
.kc-dedup-label {
  font-size: 0.8em;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(46, 204, 113, 0.15);
  color: #27ae60;
}
.kc-dedup-item.duplicate .kc-dedup-label {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
}
</style>
