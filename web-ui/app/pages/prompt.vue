<template>
  <div class="page active" style="display: flex; flex-direction: column;">
    <!-- 头部栏 -->
    <div class="standard-page-header" style="height: 60px; padding: 0 24px; border-bottom: 1px solid var(--divider);">
      <h1 class="header-title" style="font-size: 18px;">提示词管理器</h1>
      <div class="header-controls">
        <button class="fluent-btn primary" style="height: 30px; font-size: 12px; padding: 0 12px;" @click="createNewPrompt">
          + 新增提示词
        </button>
      </div>
    </div>

    <!-- 三栏式布局主体 -->
    <div class="prompt-workspace">
      <!-- 1. 左侧边栏 (Sidebar) -->
      <div class="sidebar-pane">
        <!-- 搜索框 -->
        <div class="sidebar-search">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            type="text" 
            class="fluent-input sidebar-search-input" 
            v-model="searchQuery" 
            placeholder="Search prompts..."
          />
        </div>

        <!-- PROMPTS 过滤菜单 -->
        <div class="menu-section">
          <div class="menu-section-header">
            <span>PROMPTS</span>
            <button class="add-section-btn" title="新建提示词" @click="createNewPrompt">+</button>
          </div>
          <div class="menu-items">
            <div 
              class="menu-item" 
              :class="{ active: filterType === 'all' }"
              @click="setFilter('all')"
            >
              <span class="menu-label">All Prompts</span>
              <span class="menu-count">{{ allPromptsCount }}</span>
            </div>
            <div 
              class="menu-item" 
              :class="{ active: filterType === 'favorite' }"
              @click="setFilter('favorite')"
            >
              <span class="menu-label">Favorites</span>
              <span class="menu-count">{{ favoriteCount }}</span>
            </div>
            <div 
              class="menu-item" 
              :class="{ active: filterType === 'locked' }"
              @click="setFilter('locked')"
            >
              <span class="menu-label">Locked</span>
              <span class="menu-count">{{ lockedCount }}</span>
            </div>
          </div>
        </div>

        <!-- FOLDERS 文件夹列表 -->
        <div class="menu-section">
          <div class="menu-section-header">
            <span>FOLDERS</span>
            <button class="add-section-btn" title="创建文件夹" @click="promptNewFolder">+</button>
          </div>
          <div class="menu-items">
            <div 
              v-for="folder in folders" 
              :key="folder.id" 
              class="menu-item folder-item" 
              :class="{ active: filterType === 'folder' && activeFolderId === folder.id }"
              @click="setFolderFilter(folder.id)"
            >
              <span class="menu-label text-truncate">{{ folder.name }}</span>
              <div class="item-actions">
                <span class="menu-count">{{ folder.count || 0 }}</span>
                <button v-if="folder.id !== '2d' && folder.id !== 'char' && folder.id !== 'scene' && folder.id !== 'effect'" class="delete-inline-btn" title="删除文件夹" @click.stop="deleteFolder(folder)">×</button>
              </div>
            </div>
            <div 
              class="menu-item folder-item" 
              :class="{ active: filterType === 'folder' && activeFolderId === 'unclassified' }"
              @click="setFolderFilter('unclassified')"
            >
              <span class="menu-label">未分类</span>
              <span class="menu-count">{{ unclassifiedCount }}</span>
            </div>
          </div>
        </div>

        <!-- TAGS 标签列表 -->
        <div class="menu-section">
          <div class="menu-section-header">
            <span>TAGS</span>
            <button class="add-section-btn" title="管理标签" @click="focusTagsInput">+</button>
          </div>
          <div class="menu-items tags-cloud">
            <span 
              v-for="tag in allTags" 
              :key="tag" 
              class="tag-badge-pill"
              :class="{ active: filterType === 'tag' && activeTag === tag }"
              @click="setTagFilter(tag)"
            >
              #{{ tag }}
            </span>
            <span v-if="allTags.length === 0" class="empty-hint">暂无标签</span>
          </div>
        </div>

        <!-- 底部 Settings 占位 -->
        <div class="sidebar-footer">
          <button class="fluent-btn sub w-full footer-settings-btn" @click="loadAllData">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Settings / Refresh
          </button>
        </div>
      </div>

      <!-- 2. 中间提示词列表栏 (Master List) -->
      <div class="list-pane">
        <!-- 列表工具栏 -->
        <div class="list-toolbar">
          <button class="list-action-btn" @click="toggleSelectMode">Select</button>
          <div class="list-sort-select">
            <span class="sort-label">Newest</span>
          </div>
        </div>

        <!-- 提示词卡片滚动区 -->
        <div class="list-scroll-container">
          <div 
            v-for="p in filteredPrompts" 
            :key="p.id" 
            class="prompt-list-item"
            :class="{ active: currentPrompt && currentPrompt.id === p.id }"
            @click="selectPrompt(p)"
          >
            <!-- 卡片彩色头部 -->
            <div class="item-header-bar">
              <span class="item-title text-truncate" :style="{ color: getFolderTitleColor(p.folderId) }">{{ p.name }}</span>
              <div class="item-header-actions" @click.stop>
                <!-- 快捷收藏 -->
                <button 
                  class="header-btn" 
                  :class="{ starred: p.favorite === 1 }"
                  title="收藏" 
                  @click="toggleFavorite(p)"
                >
                  ★
                </button>
                <!-- 快捷一键复制 -->
                <button 
                  class="header-btn copy-action" 
                  :class="{ copied: copiedId === p.id }"
                  title="复制提示词" 
                  @click="copyToClipboard(p.prompt, p.id)"
                >
                  {{ copiedId === p.id ? '✓' : '⎘' }}
                </button>
              </div>
            </div>
            <!-- 卡片主体内容预览 -->
            <div class="item-body-preview">
              <p class="preview-prompt code-font">{{ p.prompt }}</p>
              <div class="preview-footer" v-if="p.tags">
                <span v-for="t in p.tags.split(',')" :key="t" class="preview-tag">#{{ t }}</span>
              </div>
            </div>
          </div>

          <!-- 空列表提示 -->
          <div v-if="filteredPrompts.length === 0" class="list-empty-hint">
            暂无匹配的提示词条目
          </div>
        </div>
      </div>

      <!-- 3. 右侧编辑与详情栏 (Detail Pane) -->
      <div class="detail-pane">
        <div v-if="currentPrompt" class="detail-form-container">
          <!-- 标题 & 锁定开关 -->
          <div class="detail-row row-between">
            <div class="form-group flex-1">
              <label class="form-label-bold">Title</label>
              <input 
                type="text" 
                class="fluent-input detail-title-input" 
                v-model="detailForm.name" 
                :disabled="detailForm.locked === 1"
                placeholder="请输入提示词标题"
              />
            </div>
            <div class="lock-toggle-wrapper">
              <label class="form-label-bold">Lock</label>
              <button 
                class="lock-btn" 
                :class="{ locked: detailForm.locked === 1 }"
                @click="toggleFormLock"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
                  <template v-if="detailForm.locked === 1">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </template>
                  <template v-else>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                  </template>
                </svg>
                <span>{{ detailForm.locked === 1 ? 'Locked' : 'Unlocked' }}</span>
              </button>
            </div>
          </div>

          <!-- 文件夹归属 -->
          <div class="form-group">
            <label class="form-label-bold">Folder</label>
            <select 
              class="fluent-select detail-select" 
              v-model="detailForm.folderId"
              :disabled="detailForm.locked === 1"
            >
              <option :value="null">未分类 (Unclassified)</option>
              <option v-for="f in folders" :key="f.id" :value="f.id">
                {{ f.name }}
              </option>
            </select>
          </div>

          <!-- 提示词输入区 -->
          <div class="form-group relative">
            <div class="form-label-row">
              <label class="form-label-bold">Prompt</label>
              <button 
                class="detail-copy-btn" 
                :class="{ copied: copiedId === 'detail_p' }"
                @click="copyToClipboard(detailForm.prompt, 'detail_p')"
              >
                {{ copiedId === 'detail_p' ? '已复制 ✓' : '复制提示词' }}
              </button>
            </div>
            <textarea 
              class="fluent-textarea detail-textarea prompt-textarea-large code-font" 
              v-model="detailForm.prompt" 
              :disabled="detailForm.locked === 1"
              placeholder="制作一个绿幕背景的Q版史莱姆..."
            ></textarea>
            <div class="char-count">{{ detailForm.prompt?.length || 0 }} characters</div>
          </div>


          <!-- 备注/中文解释 -->
          <div class="form-group">
            <label class="form-label-bold">Notes</label>
            <textarea 
              class="fluent-textarea detail-textarea" 
              v-model="detailForm.notes" 
              rows="6"
              :disabled="detailForm.locked === 1"
              placeholder="Add extra details or context..."
            ></textarea>
          </div>

          <!-- 标签设置 -->
          <div class="form-group">
            <label class="form-label-bold">Tags</label>
            <input 
              type="text" 
              class="fluent-input detail-tags-input" 
              id="detail-tags-input-elem"
              v-model="detailForm.tags" 
              :disabled="detailForm.locked === 1"
              placeholder="请输入英文标签，以逗号分隔，例如：2d, 动画, 帧"
            />
          </div>

          <!-- 保存与删除按钮 -->
          <div class="detail-actions-row">
            <button 
              class="fluent-btn primary flex-1 detail-save-btn" 
              :disabled="detailForm.locked === 1" 
              @click="saveCurrentPrompt"
            >
              Save
            </button>
            <button 
              class="fluent-btn danger detail-delete-btn" 
              @click="deleteCurrentPrompt"
            >
              Delete
            </button>
          </div>
        </div>

        <!-- 未选中提示词时的空状态 -->
        <div v-else class="detail-empty-state">
          <div class="empty-icon-large">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <line x1="10" y1="9" x2="9" y2="9"></line>
            </svg>
          </div>
          <h3>未选中任何提示词</h3>
          <p>请在左侧选择分类或文件夹，然后在中间列表中点击一个提示词以进行查看或编辑。您也可以点击右上角“新增提示词”创建一个新的模板。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

// 数据存储
const prompts = ref([])
const folders = ref([])
const activeFolderId = ref(null)
const activeTag = ref(null)
const filterType = ref('all') // 'all', 'favorite', 'locked', 'folder', 'tag'
const searchQuery = ref('')
const copiedId = ref(null)

// 详情页编辑状态
const currentPrompt = ref(null)
const detailForm = ref({
  id: '',
  folderId: null,
  name: '',
  prompt: '',
  negativePrompt: '',
  notes: '',
  favorite: 0,
  locked: 0,
  tags: ''
})

// 文件夹主色配置（适配中间栏卡片顶部条）
const folderColors = {
  '2d': '#8b5cf6',      // 2D紫色
  'char': '#c084fc',    // 角色粉紫色
  'scene': '#14b8a6',   // 场景青色
  'effect': '#fbbf24',  // 特效金黄色
  'default': '#71717a'  // 默认灰色
}

const getFolderColor = (folderId) => {
  return folderColors[folderId] || folderColors['default']
}

const getFolderTitleColor = (folderId) => {
  switch (folderId) {
    case '2d': return '#c084fc'
    case 'char': return '#a78bfa'
    case 'scene': return '#2dd4bf'
    case 'effect': return '#fbbf24'
    default: return '#f4f4f5'
  }
}

// 标签计算属性：从所有 prompt 中提取唯一的标签列表
const allTags = computed(() => {
  const tagsSet = new Set()
  prompts.value.forEach(p => {
    if (p.tags) {
      p.tags.split(',').forEach(tag => {
        const cleaned = tag.trim()
        if (cleaned) tagsSet.add(cleaned)
      })
    }
  })
  return Array.from(tagsSet)
})

// 左边栏计数器
const allPromptsCount = computed(() => prompts.value.length)
const favoriteCount = computed(() => prompts.value.filter(p => p.favorite === 1).length)
const lockedCount = computed(() => prompts.value.filter(p => p.locked === 1).length)
const unclassifiedCount = computed(() => prompts.value.filter(p => !p.folderId).length)

// 获取加载所有数据的方法
const loadAllData = async () => {
  try {
    // 同时获取文件夹和提示词列表
    const [foldersData, promptsData] = await Promise.all([
      $fetch('/api/folders'),
      $fetch('/api/prompts')
    ])
    folders.value = foldersData || []
    prompts.value = promptsData || []
  } catch (error) {
    console.error('加载提示词管理器数据失败:', error)
  }
}

// 过滤提示词（在内存中多重过滤，提供最丝滑体验）
const filteredPrompts = computed(() => {
  let list = prompts.value

  // 左侧导航筛选
  if (filterType.value === 'favorite') {
    list = list.filter(p => p.favorite === 1)
  } else if (filterType.value === 'locked') {
    list = list.filter(p => p.locked === 1)
  } else if (filterType.value === 'folder') {
    if (activeFolderId.value === 'unclassified') {
      list = list.filter(p => !p.folderId)
    } else {
      list = list.filter(p => p.folderId === activeFolderId.value)
    }
  } else if (filterType.value === 'tag') {
    list = list.filter(p => {
      if (!p.tags) return false
      return p.tags.split(',').map(t => t.trim()).includes(activeTag.value)
    })
  }

  // 搜索关键字筛选
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    list = list.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.prompt.toLowerCase().includes(query) || 
      (p.notes && p.notes.toLowerCase().includes(query)) ||
      (p.tags && p.tags.toLowerCase().includes(query))
    )
  }

  return list
})

// 选择过滤器
const setFilter = (type) => {
  filterType.value = type
  activeFolderId.value = null
  activeTag.value = null
}

const setFolderFilter = (folderId) => {
  filterType.value = 'folder'
  activeFolderId.value = folderId
  activeTag.value = null
}

const setTagFilter = (tag) => {
  filterType.value = 'tag'
  activeTag.value = tag
  activeFolderId.value = null
}

// 选中某个提示词展示在右侧详情
const selectPrompt = (p) => {
  currentPrompt.value = p
  detailForm.value = {
    id: p.id,
    folderId: p.folderId,
    name: p.name,
    prompt: p.prompt,
    negativePrompt: p.negativePrompt || '',
    notes: p.notes || '',
    favorite: p.favorite || 0,
    locked: p.locked || 0,
    tags: p.tags || ''
  }
}

// 锁定表单切换
const toggleFormLock = () => {
  detailForm.value.locked = detailForm.value.locked === 1 ? 0 : 1
}

// 快速收藏切换
const toggleFavorite = async (p) => {
  const newFav = p.favorite === 1 ? 0 : 1
  try {
    await $fetch(`/api/prompts/${p.id}`, {
      method: 'PUT',
      body: {
        ...p,
        favorite: newFav
      }
    })
    p.favorite = newFav
    // 如果当前选中的就是该条目，同步更新详情页
    if (currentPrompt.value && currentPrompt.value.id === p.id) {
      detailForm.value.favorite = newFav
    }
  } catch (error) {
    console.error('更新收藏状态失败:', error)
  }
}

// 一键复制
const copyToClipboard = async (text, id) => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copiedId.value = id
    setTimeout(() => {
      if (copiedId.value === id) copiedId.value = null
    }, 1500)
  } catch (err) {
    console.error('复制失败:', err)
  }
}

// 保存当前提示词
const saveCurrentPrompt = async () => {
  if (!detailForm.value.name.trim()) {
    alert('请输入标题')
    return
  }
  if (!detailForm.value.prompt.trim()) {
    alert('请输入提示词内容')
    return
  }

  try {
    const payload = {
      folderId: detailForm.value.folderId,
      name: detailForm.value.name.trim(),
      prompt: detailForm.value.prompt.trim(),
      negativePrompt: detailForm.value.negativePrompt.trim() || undefined,
      notes: detailForm.value.notes.trim() || undefined,
      favorite: detailForm.value.favorite,
      locked: detailForm.value.locked,
      tags: detailForm.value.tags.trim() || undefined
    }

    await $fetch(`/api/prompts/${detailForm.value.id}`, {
      method: 'PUT',
      body: payload
    })

    // 同步刷新本地列表与高亮数据
    await loadAllData()
    // 重新从更新后的列表中挑出对应的 Prompt 并选中它，以刷新列表预览和卡片状态
    const updated = prompts.value.find(item => item.id === detailForm.value.id)
    if (updated) {
      currentPrompt.value = updated
    }
  } catch (error) {
    console.error('保存提示词失败:', error)
    alert('保存失败')
  }
}

// 新建提示词（主从式新建）
const createNewPrompt = async () => {
  try {
    // 默认创建一个未命名提示词，归入当前激活的文件夹（若有的话）
    const initialFolder = (filterType.value === 'folder' && activeFolderId.value !== 'unclassified') ? activeFolderId.value : null
    const payload = {
      folderId: initialFolder,
      name: '未命名提示词',
      prompt: 'Prompt body here...',
      negativePrompt: '',
      notes: '',
      favorite: 0,
      locked: 0,
      tags: ''
    }

    const newPrompt = await $fetch('/api/prompts/create', {
      method: 'POST',
      body: payload
    })

    await loadAllData()
    // 立即在右侧详情中展开编辑该项
    const target = prompts.value.find(item => item.id === newPrompt.id)
    if (target) {
      selectPrompt(target)
    }
  } catch (error) {
    console.error('创建提示词失败:', error)
    alert('创建失败')
  }
}

// 删除提示词
const deleteCurrentPrompt = async () => {
  if (!currentPrompt.value) return
  if (!confirm(`确定要删除提示词 “${detailForm.value.name}” 吗？`)) return

  try {
    await $fetch(`/api/prompts/${detailForm.value.id}`, {
      method: 'DELETE'
    })
    currentPrompt.value = null
    await loadAllData()
  } catch (error) {
    console.error('删除提示词失败:', error)
    alert('删除失败')
  }
}

// 新建文件夹
const promptNewFolder = async () => {
  const name = prompt('请输入新文件夹名称:')
  if (!name || !name.trim()) return

  try {
    await $fetch('/api/folders', {
      method: 'POST',
      body: { name: name.trim() }
    })
    await loadAllData()
  } catch (error) {
    console.error('创建文件夹失败:', error)
    alert(error.data?.statusMessage || '创建文件夹失败')
  }
}

// 删除文件夹
const deleteFolder = async (folder) => {
  if (!confirm(`确定要删除文件夹 “${folder.name}” 吗？\n删除文件夹后，该文件夹下的所有提示词将归入 “未分类” 状态，提示词不会被删除。`)) return

  try {
    await $fetch(`/api/folders/${folder.id}`, {
      method: 'DELETE'
    })
    // 如果当前选中的分类恰好是该被删除的文件夹，重置为 All Prompts
    if (filterType.value === 'folder' && activeFolderId.value === folder.id) {
      setFilter('all')
    }
    await loadAllData()
  } catch (error) {
    console.error('删除文件夹失败:', error)
    alert('删除文件夹失败')
  }
}

// 聚焦到右侧 Tags 输入框，辅助快速添加 Tags
const focusTagsInput = () => {
  if (!currentPrompt.value) {
    alert('请先选择或创建一个提示词再添加标签')
    return
  }
  const el = document.getElementById('detail-tags-input-elem')
  if (el) el.focus()
}

onMounted(() => {
  loadAllData()
})
</script>

<style scoped>
/* 整个提示词管理面板，三栏横向铺满 */
.prompt-workspace {
  display: flex;
  flex: 1;
  height: calc(100vh - 148px); /* 扣除 Header 和 Status bar 的高度 */
  overflow: hidden;
  background-color: transparent;
}

/* ================= 1. 左侧边栏 (Sidebar) ================= */
.sidebar-pane {
  width: 240px;
  border-right: 1px solid var(--border-glass);
  background-color: rgba(13, 13, 16, 0.4);
  backdrop-filter: blur(10px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
  flex-shrink: 0;
}

.sidebar-search {
  position: relative;
  display: flex;
  align-items: center;
}

.sidebar-search-input {
  width: 100%;
  padding-left: 32px;
  font-size: 12px;
  height: 30px;
  background-color: rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.05);
}

.sidebar-search .search-icon {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
}

.menu-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.menu-section-header {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-tertiary);
  letter-spacing: 1px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.add-section-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 14px;
  cursor: pointer;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.add-section-btn:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.05);
}

.menu-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menu-item {
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-premium);
  border: 1px solid transparent;
}

.menu-item:hover {
  background-color: rgba(255, 255, 255, 0.03);
  color: var(--text-primary);
}

.menu-item.active {
  background-color: rgba(255, 255, 255, 0.07);
  color: var(--text-primary);
  font-weight: 600;
  border-color: rgba(255, 255, 255, 0.02);
}

.menu-count {
  font-size: 10px;
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--text-tertiary);
  padding: 1px 6px;
  border-radius: 99px;
}

.menu-item.active .menu-count {
  background-color: rgba(255, 255, 255, 0.15);
  color: var(--text-primary);
}

.folder-item .item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.delete-inline-btn {
  background: transparent;
  border: none;
  color: var(--danger);
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.folder-item:hover .delete-inline-btn {
  opacity: 0.8;
}

.delete-inline-btn:hover {
  opacity: 1 !important;
}

/* 标签云 */
.tags-cloud {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px;
}

.tag-badge-pill {
  font-size: 10.5px;
  padding: 3px 8px;
  background-color: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-glass);
  color: var(--text-secondary);
  border-radius: 99px;
  cursor: pointer;
  transition: all var(--transition-premium);
}

.tag-badge-pill:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.tag-badge-pill.active {
  background: linear-gradient(135deg, rgba(167, 139, 250, 0.2) 0%, rgba(59, 130, 246, 0.1) 100%);
  border-color: rgba(167, 139, 250, 0.4);
  color: var(--accent-default);
  font-weight: 600;
  box-shadow: 0 0 10px rgba(167, 139, 250, 0.1);
}

.empty-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  padding-left: 4px;
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--divider);
}

.footer-settings-btn {
  font-size: 11.5px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-secondary);
}

/* ================= 2. 中间列表栏 (Master List) ================= */
.list-pane {
  width: 320px;
  border-right: 1px solid var(--border-glass);
  background-color: rgba(8, 8, 10, 0.2);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.list-toolbar {
  height: 48px;
  border-bottom: 1px solid var(--divider);
  padding: 0 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: rgba(255, 255, 255, 0.01);
}

.list-action-btn {
  height: 26px;
  padding: 0 10px;
  border-radius: 4px;
  border: 1px solid var(--border-glass);
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-secondary);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.list-action-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.list-sort-select {
  font-size: 11.5px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  cursor: pointer;
}

.list-sort-select::after {
  content: ' ▼';
  font-size: 8px;
  margin-left: 4px;
  opacity: 0.7;
}

.list-scroll-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 中间栏单卡片条目 */
.prompt-list-item {
  background-color: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-premium);
  display: flex;
  flex-direction: column;
}

.prompt-list-item:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.12);
  background-color: var(--bg-card-hover);
}

.prompt-list-item.active {
  border-color: var(--accent-default);
  box-shadow: 0 0 15px rgba(167, 139, 250, 0.15);
  position: relative;
}

.prompt-list-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent-gradient);
  box-shadow: 0 0 8px var(--accent-default);
}

/* 卡片彩色顶部条 */
.item-header-bar {
  height: 32px;
  padding: 0 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #ffffff;
  background-color: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.item-title {
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.item-header-actions {
  display: flex;
  gap: 4px;
}

.header-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
  padding: 0 2px;
  transition: all 0.2s;
}

.header-btn:hover {
  color: #ffffff;
  transform: scale(1.1);
}

.header-btn.starred {
  color: #fbbf24 !important;
}

.header-btn.copied {
  color: #34d399 !important;
}

/* 卡片主体内容预览 */
.item-body-preview {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-prompt {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-all;
}

.preview-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.preview-tag {
  font-size: 9px;
  color: var(--accent-default);
  opacity: 0.85;
}

.list-empty-hint {
  text-align: center;
  color: var(--text-tertiary);
  font-size: 12px;
  padding-top: 40px;
}

/* ================= 3. 右侧编辑与详情栏 (Detail Pane) ================= */
.detail-pane {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background-color: rgba(6, 6, 8, 0.5);
  backdrop-filter: blur(4px);
}

.detail-form-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
}

.detail-row {
  display: flex;
  gap: 20px;
}

.row-between {
  justify-content: space-between;
  align-items: flex-end;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label-bold {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.form-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-title-input {
  font-size: 14px;
  font-weight: 600;
  height: 36px;
  background-color: rgba(0, 0, 0, 0.3);
}

.lock-toggle-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 120px;
}

.lock-btn {
  height: 36px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-glass);
  background-color: rgba(255, 255, 255, 0.02);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all var(--transition-premium);
}

.lock-btn:hover {
  background-color: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.lock-btn.locked {
  background-color: rgba(248, 113, 113, 0.1);
  color: var(--danger);
  border-color: rgba(248, 113, 113, 0.25);
  box-shadow: 0 0 10px rgba(248, 113, 113, 0.05);
}

.detail-select {
  height: 36px;
  background-color: rgba(0, 0, 0, 0.3);
}

.detail-textarea {
  background-color: rgba(0, 0, 0, 0.3);
  font-size: 14px;
  line-height: 1.6;
  padding: 12px 16px !important;
  box-sizing: border-box;
}

.detail-copy-btn {
  background: transparent;
  border: none;
  color: var(--accent-default);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.2s;
}

.detail-copy-btn:hover {
  background-color: rgba(167, 139, 250, 0.1);
}

.detail-copy-btn.copied {
  color: var(--success);
}

.char-count {
  font-size: 10.5px;
  color: var(--text-tertiary);
  text-align: right;
  margin-top: -4px;
}

.detail-tags-input {
  background-color: rgba(0, 0, 0, 0.3);
  height: 36px;
}

.detail-actions-row {
  display: flex;
  gap: 12px;
  margin-top: 10px;
}

.detail-save-btn {
  height: 40px;
  font-size: 14px;
}

.detail-delete-btn {
  height: 40px;
  font-size: 14px;
  width: 120px;
}

/* 空白详情页提示 */
.detail-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  gap: 16px;
  max-width: 500px;
  margin: 0 auto;
  padding: 40px 20px;
}

.empty-icon-large {
  width: 72px;
  height: 72px;
  color: var(--text-tertiary);
  opacity: 0.5;
}

.empty-icon-large svg {
  width: 100%;
  height: 100%;
}

.detail-empty-state h3 {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
}

.detail-empty-state p {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* Monospace 字体 */
.code-font {
  font-family: var(--font-mono);
}

/* 文本防溢出截断 */
.text-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flex-1 {
  flex: 1;
}

.relative {
  position: relative;
}

/* 强制所有输入文本框在 user-select: none 全局设定下依然可聚焦、可输入、可选中文本，并优化底色、细边框和高雅文字色 */
input, textarea, select, .fluent-input, .fluent-textarea, .fluent-select {
  user-select: text !important;
  -webkit-user-select: text !important;
  color: #d4d4d8 !important; /* 柔和雅致的灰白色文字 */
  caret-color: var(--accent-default) !important; /* 紫色发光光标，确保在深色背景下清晰闪烁 */
  background-color: #0b0b0f !important; /* 深度暗黑输入框底色 */
  border: 1px solid rgba(255, 255, 255, 0.05) !important; /* 极其微弱轻薄的透明细边框 */
  outline: none !important;
  transition: all var(--transition-premium) !important;
}

/* 文本框聚焦状态的发光过渡 */
input:focus, textarea:focus, select:focus, 
.fluent-input:focus, .fluent-textarea:focus, .fluent-select:focus {
  border-color: rgba(167, 139, 250, 0.4) !important;
  box-shadow: 0 0 12px rgba(167, 139, 250, 0.1) !important;
  background-color: #0f0f15 !important;
}

/* 锁定/置灰状态下的半透明柔和视觉 */
input:disabled, textarea:disabled, select:disabled {
  opacity: 0.45 !important;
  background-color: rgba(5, 5, 8, 0.6) !important;
  border-color: rgba(255, 255, 255, 0.02) !important;
  color: var(--text-tertiary) !important;
  cursor: not-allowed !important;
}

/* 调整右侧详情栏 Label 标签的高级质感 */
.form-label-bold {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-secondary) !important; /* 弱化灰度标签 */
  opacity: 0.8;
  letter-spacing: 1px;
}

/* 极大扩展正面提示词输入框的默认纵向高度范围，便于浏览、编辑和维护长篇提示词 */
.prompt-textarea-large {
  height: 380px !important;
  min-height: 250px;
  resize: vertical;
}
</style>
