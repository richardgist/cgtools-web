<template>
  <div class="page active" style="display: flex;">
    <div class="standard-page-header">
      <h1 class="header-title">知识卡片</h1>
      <div class="header-controls">
        <span class="kc-badge">{{ headerCardCount }} / {{ cards.length }} 张卡片</span>
        <div class="kc-view-switch">
          <button class="kc-view-btn" :class="{ active: activeView === 'architecture' }" @click="activeView = 'architecture'">分类</button>
          <button class="kc-view-btn" :class="{ active: activeView === 'cards' }" @click="activeView = 'cards'">卡片</button>
          <button class="kc-view-btn" :class="{ active: activeView === 'graph' }" @click="showGraphView">网络</button>
        </div>
        <button class="fluent-btn" @click="openCreateModal">新增卡片</button>
        <button class="fluent-btn" @click="openImportModal">导入 MD</button>
        <button class="fluent-btn" @click="openDeduplicateModal" style="color: #e67e22;">🧹 清理冗余</button>
        <button class="fluent-btn" @click="rebuildIndex" :disabled="loading || rebuildingIndex">
          {{ rebuildingIndex ? '同步中...' : '同步 Obsidian' }}
        </button>
        <button class="fluent-btn" @click="refreshCards" :disabled="loading || rebuildingIndex">
          {{ loading ? '加载中...' : '刷新' }}
        </button>
      </div>
    </div>

    <div class="kc-sync-strip">
      <span class="kc-sync-path">{{ vaultPath || 'Obsidian Vault 未加载' }}</span>
      <span>总文件 {{ knowledgeStats.total }}</span>
      <span>KC {{ knowledgeStats.cards }}</span>
      <span>MOC {{ knowledgeStats.mocs }}</span>
      <span>HUB {{ knowledgeStats.hubs }}</span>
      <span>最近同步 {{ lastSyncTime || '-' }}</span>
    </div>

    <div v-if="activeView === 'cards'" class="kc-body">
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

    <!-- 知识分类导航：大类 -> 子分类 -> 卡片 -->
    <div v-else-if="activeView === 'architecture'" class="kc-knowledge-view">
      <aside class="kc-knowledge-categories">
        <div class="kc-knowledge-overview">
          <span class="kc-knowledge-overline">Knowledge Map</span>
          <strong>{{ knowledgeHomeMatchedCardCount }}</strong>
          <span>已归入结构化分类</span>
        </div>

        <button
          v-for="category in knowledgeHomeCategoryStats"
          :key="category.id"
          class="kc-knowledge-category"
          :class="{ active: selectedKnowledgeHomeCategoryId === category.id }"
          :style="{ '--category-accent': category.accent }"
          @click="selectKnowledgeHomeCategory(category)"
        >
          <div class="kc-knowledge-category-main">
            <span class="kc-knowledge-category-title">{{ category.title }}</span>
            <span class="kc-knowledge-category-count">{{ category.cardCount }}</span>
          </div>
          <p>{{ category.subtitle }}</p>
          <div class="kc-knowledge-category-meta">
            <span>{{ category.matchedSubcategoryCount }} 个子分类有卡片</span>
            <span>{{ category.subcategoryCount }} 个子分类</span>
          </div>
        </button>
      </aside>

      <main class="kc-knowledge-main">
        <section
          v-if="selectedKnowledgeHomeCategory"
          class="kc-knowledge-category-panel"
          :style="{ '--category-accent': selectedKnowledgeHomeCategory.accent }"
        >
          <div class="kc-knowledge-panel-header">
            <div>
              <span class="kc-knowledge-overline">{{ selectedKnowledgeHomeCategory.eyebrow }}</span>
              <h2>{{ selectedKnowledgeHomeCategory.title }}</h2>
              <p>{{ selectedKnowledgeHomeCategory.subtitle }}</p>
            </div>
            <div class="kc-knowledge-panel-count">
              <strong>{{ selectedKnowledgeHomeCategory.cardCount }}</strong>
              <span>cards</span>
            </div>
          </div>

          <div class="kc-subcategory-grid">
            <button
              v-for="subcategory in selectedKnowledgeSubcategoryStats"
              :key="subcategory.id"
              class="kc-subcategory-card"
              :class="{ active: selectedKnowledgeSubcategory?.id === subcategory.id }"
              @mousemove="handleCardMouseMove"
              @click="selectKnowledgeSubcategory(subcategory)"
            >
              <div class="kc-arch-card-glow"></div>
              <div class="kc-subcategory-card-top">
                <span>{{ subcategory.groupLabel }}</span>
                <strong>{{ subcategory.cardCount }}</strong>
              </div>
              <h3>{{ subcategory.title }}</h3>
              <p>{{ subcategory.subtitle }}</p>
              <div class="kc-subcategory-signals">
                <span v-for="tag in subcategory.previewTags" :key="tag">{{ tag }}</span>
              </div>
            </button>
          </div>
        </section>

        <section class="kc-subcategory-detail" :class="{ empty: !selectedKnowledgeSubcategory }">
          <template v-if="selectedKnowledgeSubcategory">
            <div class="kc-subcategory-detail-header">
              <div>
                <span class="kc-knowledge-overline">{{ selectedKnowledgeSubcategoryCategory?.title }}</span>
                <h3>{{ selectedKnowledgeSubcategory.title }}</h3>
                <p>{{ selectedKnowledgeSubcategory.subtitle }}</p>
              </div>
              <div class="kc-subcategory-detail-actions">
                <input
                  v-model="selectedKnowledgeSubcategorySearchText"
                  class="fluent-input"
                  placeholder="搜索当前子分类..."
                />
                <button class="fluent-btn" @click="exploreKnowledgeSubcategoryInCardsView">
                  到卡片视图 ({{ selectedKnowledgeSubcategoryTotalCount }})
                </button>
              </div>
            </div>

            <div v-if="selectedKnowledgeSubcategoryFilteredCards.length > 0" class="kc-subcategory-card-list">
              <article
                v-for="card in selectedKnowledgeSubcategoryFilteredCards"
                :key="card.id"
                class="kc-subcategory-result"
                @click="openCard(card)"
              >
                <div class="kc-subcategory-result-meta">
                  <span>{{ card.id }}</span>
                  <span>{{ '⭐'.repeat(card.difficulty || 1) }}</span>
                </div>
                <h4>{{ card.title }}</h4>
                <p>{{ card.summary }}</p>
                <div class="kc-subcategory-result-tags">
                  <span v-for="tag in (card.tags || []).slice(0, 6)" :key="tag">{{ tag }}</span>
                </div>
              </article>
            </div>

            <div v-else class="kc-subcategory-empty">
              <strong>当前子分类暂无匹配卡片</strong>
              <span>可以用更精确的 arch/* 标签或标题关键词补齐归属。</span>
            </div>
          </template>

          <template v-else>
            <div class="kc-subcategory-empty large">
              <strong>先选一个子分类</strong>
              <span>{{ selectedKnowledgeHomeCategory?.title }} 下的卡片会按子分类进入，不再直接摊开全部卡片。</span>
            </div>
          </template>
        </section>
      </main>
    </div>


    <div v-else class="kc-network-view">
      <aside class="kc-network-sidebar">
        <input
          v-model="graphSearchText"
          class="fluent-input kc-search"
          placeholder="搜索节点、标签、摘要..."
        />
        <div class="kc-filter-section">
          <div class="kc-filter-title">展开</div>
          <div class="kc-graph-expand-actions">
            <button class="fluent-btn" @click="expandGraphOneLevel">展开一级</button>
            <button class="fluent-btn" @click="expandAllGraph">全部展开</button>
            <button class="fluent-btn" @click="collapseGraphToEntry">收起</button>
          </div>
        </div>
        <div class="kc-filter-section">
          <div class="kc-filter-title">节点类型</div>
          <button
            v-for="type in graphTypeOptions"
            :key="type.key"
            class="kc-graph-type-btn"
            :class="{ active: activeGraphTypes.has(type.key) }"
            @click="toggleGraphType(type.key)"
          >
            <span class="kc-graph-type-dot" :style="{ background: graphTypeColor(type.key) }"></span>
            {{ type.label }} ({{ graphTypeCounts[type.key] || 0 }})
          </button>
        </div>
        <div class="kc-stats-panel">
          <div class="kc-stat-row">
            <span class="kc-stat-label">显示节点</span>
            <span class="kc-stat-value">{{ visibleGraphNodes.length }}</span>
          </div>
          <div class="kc-stat-row">
            <span class="kc-stat-label">显示关系</span>
            <span class="kc-stat-value">{{ visibleGraphEdges.length }}</span>
          </div>
          <div class="kc-stat-row">
            <span class="kc-stat-label">缺失链接</span>
            <span class="kc-stat-value">{{ missingGraphEdges }}</span>
          </div>
        </div>
        <button class="fluent-btn" style="width:100%;" @click="resetGraphViewport">重置视图</button>
      </aside>

      <div
        class="kc-network-canvas"
        :class="{ dragging: graphDragging }"
        @mousedown="startGraphPan"
        @mousemove="moveGraphPan"
        @mouseup="endGraphPan"
        @mouseleave="endGraphPan"
        @wheel.prevent="onGraphWheel"
      >
        <div v-if="graphLoading" class="kc-network-loading">正在同步知识网络...</div>
        <svg v-else class="kc-network-svg">
          <g :transform="graphTransform">
            <line
              v-for="edge in visibleGraphEdges"
              :key="`${edge.source}-${edge.target}`"
              class="kc-graph-edge"
              :class="{ missing: edge.missing }"
              :x1="graphNodePositions[edge.source]?.x"
              :y1="graphNodePositions[edge.source]?.y"
              :x2="graphNodePositions[edge.target]?.x"
              :y2="graphNodePositions[edge.target]?.y"
            />
            <g
              v-for="node in visibleGraphNodes"
              :key="node.id"
              class="kc-graph-node"
              :class="[`type-${node.type}`]"
              :transform="`translate(${graphNodePositions[node.id]?.x || 0}, ${graphNodePositions[node.id]?.y || 0})`"
              @mousedown.stop
            >
              <circle
                :r="graphNodeRadius(node)"
                :fill="graphTypeColor(node.type)"
                @click.stop="toggleGraphNode(node)"
              />
              <text
                v-if="hasGraphChildren(node.id)"
                class="kc-graph-node-expander"
                text-anchor="middle"
                dominant-baseline="middle"
                @click.stop="toggleGraphNode(node)"
              >{{ expandedGraphNodeIds.has(node.id) ? '−' : '+' }}</text>
              <text class="kc-graph-node-title" :x="graphNodeRadius(node) + 10" y="-3" @click.stop="openGraphNode(node)">{{ node.title }}</text>
              <text class="kc-graph-node-meta" :x="graphNodeRadius(node) + 10" y="15" @click.stop="openGraphNode(node)">{{ node.id }}</text>
            </g>
          </g>
        </svg>
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
              v-if="selectedIsCard && !editingCard"
              class="fluent-btn kc-edit-btn"
              style="margin-left: auto;"
              @click="startEditCard"
            >
              Edit
            </button>
            <template v-else-if="selectedIsCard">
              <button class="fluent-btn kc-edit-btn" style="margin-left: auto;" @click="cancelEditCard" :disabled="savingCardEdit">Cancel</button>
              <button class="fluent-btn primary kc-edit-btn" @click="saveCardEdit" :disabled="savingCardEdit">
                {{ savingCardEdit ? 'Saving...' : 'Save' }}
              </button>
            </template>
            <button v-if="selectedIsCard" class="fluent-btn danger kc-delete-btn" @click="confirmDeleteCard" :disabled="deleting">
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

    <!-- Mermaid 全屏灯箱 Modal -->
    <Teleport to="body">
      <div v-if="zoomMermaidVisible" class="kc-mermaid-lightbox" @click="closeZoomMermaid">
        <div class="kc-mermaid-lightbox-content" @click.stop>
          <button class="kc-mermaid-lightbox-close" @click="closeZoomMermaid">×</button>
          <div class="kc-mermaid-lightbox-body" v-html="zoomMermaidHtml"></div>
          <p class="kc-mermaid-lightbox-hint">💡 鼠标滚轮缩放，按住鼠标左键可拖动平移图表</p>
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
            支持拖入 .md 文件、选择单个文件或选择整个文件夹导入。推算当天的最新卡片序号，<strong>自动处理卡片 ID</strong>，最后写入 Obsidian 卡片目录。
          </p>

          <div v-if="hasDirectoryPickerAPI" class="kc-default-import-box">
            <div class="kc-default-import-header">
              <div class="kc-default-import-meta">
                <div class="kc-default-import-title">默认文件夹</div>
                <div class="kc-default-import-name" :class="{ empty: !defaultImportDirConfigured }">
                  {{ defaultImportDirConfigured ? defaultImportDirName : '未配置' }}
                </div>
                <div class="kc-default-import-hint">
                  配置一次后，可直接复用该目录；浏览器安全限制下仅显示文件夹名，不显示绝对路径。
                </div>
                <div class="kc-default-import-status">状态：{{ defaultImportDirPermissionText }}</div>
                <div v-if="defaultImportDirMessage" class="kc-default-import-message">{{ defaultImportDirMessage }}</div>
              </div>
              <div class="kc-default-import-toolbar">
                <button class="fluent-btn" :disabled="importSubmitting" @click="configureDefaultImportDirectory">
                  {{ defaultImportDirConfigured ? '重新设置默认文件夹' : '配置默认文件夹' }}
                </button>
                <button
                  v-if="defaultImportDirConfigured"
                  class="fluent-btn"
                  :disabled="importSubmitting"
                  @click="clearDefaultImportDirectory"
                >
                  清除默认配置
                </button>
              </div>
            </div>
            <div v-if="defaultImportDirConfigured" class="kc-default-import-actions">
              <button class="fluent-btn primary" :disabled="importSubmitting" @click="runWithDefaultImportDirectory('full-import')">
                {{ importSubmitting ? '处理中...' : '导入默认文件夹' }}
              </button>
              <button class="fluent-btn" :disabled="importSubmitting" @click="runWithDefaultImportDirectory('all-missing')">
                {{ importSubmitting ? '处理中...' : '同步默认目录（全部）' }}
              </button>
              <button class="fluent-btn" :disabled="importSubmitting" @click="runWithDefaultImportDirectory('today-missing')">
                {{ importSubmitting ? '处理中...' : '同步默认目录（今天）' }}
              </button>
            </div>
          </div>

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
              <span class="kc-drop-zone-hint">支持同时拖入多个文件，或点击下方按钮选择</span>
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
            冲突时覆盖 Obsidian 目录中的同名卡片 (若不勾选，则为本地冲突文件分配全新的序号并重命名)
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
            当前浏览器不支持目录读写 API，将使用兼容模式：可正常写入 Obsidian 卡片目录，但无法自动重命名本地文件。
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
              {{ importSubmitting ? '刷新中...' : '同步缺失卡片（全部）' }}
            </button>
            <button
              class="fluent-btn"
              :disabled="importSubmitting"
              @click="quickSyncMissingCards('today-missing')"
            >
              {{ importSubmitting ? '刷新中...' : '同步今天缺失卡片' }}
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
  content?: string
  source?: string
  path?: string
}

type KnowledgeNodeType = 'map' | 'moc' | 'hub' | 'card' | 'note' | 'missing'

interface KnowledgeGraphNode {
  id: string
  title: string
  type: KnowledgeNodeType
  domain: string
  date: string
  tags: string[]
  summary: string
  source?: string
  path?: string
  difficulty?: number
}

interface KnowledgeGraphEdge {
  source: string
  target: string
  label?: string
  missing?: boolean
}

interface KnowledgeStats {
  total: number
  cards: number
  mocs: number
  hubs: number
  maps: number
}

type QuickSyncMode = 'all-missing' | 'today-missing'
type FolderActionMode = 'full-import' | QuickSyncMode

const CARD_ID_PATTERN = /^KC-\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{3}$/

const cards = ref<KnowledgeCard[]>([])
const loading = ref(false)
const rebuildingIndex = ref(false)
const activeView = ref<'cards' | 'graph' | 'architecture'>('architecture')

// --- 知识首页分类导航：先按问题域收敛，再进入子分类卡片 ---
interface KnowledgeHomeCategory {
  id: string
  title: string
  eyebrow: string
  subtitle: string
  accent: string
}

interface KnowledgeSubcategory {
  id: string
  categoryId: string
  groupLabel: string
  title: string
  subtitle: string
  archTag: string
  techTags: string[]
  previewTags: string[]
  strongKeywords: string[]
  semanticKeywords: string[]
}

const KNOWLEDGE_HOME_CATEGORIES: KnowledgeHomeCategory[] = [
  { id: 'game_framework', title: 'Game Framework', eyebrow: 'Runtime Spine', subtitle: 'Gameplay 生命周期、Actor/Component、控制器与玩法对象模型', accent: '#60CDFF' },
  { id: 'rendering_scene_perf', title: 'Rendering / Scene Perf', eyebrow: 'Frame & Visibility', subtitle: '渲染管线、可见性裁剪、LOD/HLOD、FrameAnalysis 与 RenderDoc', accent: '#9B8CFF' },
  { id: 'vfx_sequence', title: 'VFX / Sequencer', eyebrow: 'Effect Pipeline', subtitle: 'Cascade、Niagara、VFXProfiler、LevelSequence 与特效编辑器', accent: '#FF8A65' },
  { id: 'tools_automation', title: 'Tools / Automation', eyebrow: 'Editor Workflow', subtitle: 'UE Python、编辑器工具、构建打包、脚本运行和仓库工作流', accent: '#00B894' },
  { id: 'runtime_platform', title: 'Runtime / Platform', eyebrow: 'Device & Ops', subtitle: '内存、线程、Android、网络上传、平台封装和服务器链路', accent: '#FDCB6E' },
  { id: 'ai_web_knowledge', title: 'AI / Web / Knowledge', eyebrow: 'Agent & Product', subtitle: 'Agent 架构、LLM 工具、Nuxt/Vue 前端、知识管理与可视化', accent: '#FD79A8' },
]

const KNOWLEDGE_SUBCATEGORIES: KnowledgeSubcategory[] = [
  {
    id: 'gameplay_framework',
    categoryId: 'game_framework',
    groupLabel: '框架主干',
    title: 'Gameplay Framework 基础',
    subtitle: 'GameInstance、GameMode、GameState、Subsystem 与生命周期边界',
    archTag: 'arch/gameplay_framework',
    techTags: ['GameplayFramework', 'GameInstance', 'GameMode', 'GameState', 'Subsystem', 'Lifecycle'],
    previewTags: ['GameInstance', 'GameMode', 'Subsystem'],
    strongKeywords: ['UGameInstance', 'AGameModeBase', 'AGameStateBase', 'AGameSession', 'UGameplayStatics', 'Subsystem'],
    semanticKeywords: ['生命周期', 'WorldContext', 'Gameplay Framework', 'World 级', '引擎架构'],
  },
  {
    id: 'actor_component',
    categoryId: 'game_framework',
    groupLabel: '对象模型',
    title: 'Actor / Component',
    subtitle: 'Actor、Component、注册、挂接、Spawn 和实例属性差异',
    archTag: 'arch/actor_component',
    techTags: ['Actor', 'Component', 'ActorComponent', 'SceneComponent', 'Blueprint', '蓝图组件', '组件化'],
    previewTags: ['Actor', 'Component', 'Blueprint'],
    strongKeywords: ['AActor', 'UActorComponent', 'USceneComponent', 'RegisterComponent', 'OnRegister', 'SpawnActor', '蓝图组件'],
    semanticKeywords: ['RootComponent', 'ChildActor', 'AttachToComponent', 'PrimitiveComponent', '组件实例', '属性差异'],
  },
  {
    id: 'gamemode_pawn_controller',
    categoryId: 'game_framework',
    groupLabel: '控制体系',
    title: 'GameMode / Pawn / Controller',
    subtitle: 'Pawn、Controller、HUD、PlayerState 和 Possess 控制链路',
    archTag: 'arch/gamemode_pawn_controller',
    techTags: ['GameMode', 'Pawn', 'PlayerController', 'AIController', 'HUD', 'PlayerState'],
    previewTags: ['Pawn', 'Controller', 'HUD'],
    strongKeywords: ['AGameMode', 'APawn', 'APlayerController', 'AAIController', 'AHUD', 'PlayerState'],
    semanticKeywords: ['Possess', 'UnPossess', 'Spectator', '输入控制'],
  },
  {
    id: 'gameplay_systems',
    categoryId: 'game_framework',
    groupLabel: '玩法系统',
    title: '玩法逻辑 / 数据系统',
    subtitle: '战斗、任务、角色、数值配置和 Gameplay 业务层',
    archTag: 'arch/gameplay_systems',
    techTags: ['GameplayLogic', 'QuestSystem', '战斗系统', '角色系统', '任务系统', '数值配置', 'DataTable'],
    previewTags: ['Gameplay', 'Quest', 'Data'],
    strongKeywords: ['GameplayLogic', 'QuestSystem', '战斗系统', '任务系统', '角色系统', '数值配置', 'DataTable'],
    semanticKeywords: ['技能', '装备', '背包', '属性', '副本', '关卡逻辑'],
  },
  {
    id: 'rendering_pipeline',
    categoryId: 'rendering_scene_perf',
    groupLabel: '渲染主线',
    title: '渲染管线 / Renderer',
    subtitle: 'Renderer、ViewFamily、BasePass、RHI 和移动端渲染路径',
    archTag: 'arch/rendering_pipeline',
    techTags: ['Rendering', 'Renderer', '渲染管线', 'RHI', 'ViewFamily', 'BasePass', 'RenderThread', '移动端渲染'],
    previewTags: ['Renderer', 'RHI', 'BasePass'],
    strongKeywords: ['FSceneRenderer', 'DeferredShading', 'ForwardShading', 'RenderThread', 'ViewFamily', 'RHIThread', 'BasePass'],
    semanticKeywords: ['渲染管线', '移动端渲染', 'DrawCall', 'RenderPass', 'D3D11', 'OpenGL', 'Vulkan'],
  },
  {
    id: 'visibility_culling',
    categoryId: 'rendering_scene_perf',
    groupLabel: '可见性',
    title: '可见性 / 裁剪 / FSOC',
    subtitle: 'CullDistanceVolume、遮挡剔除、FSOC、bounds 和可见性判定',
    archTag: 'arch/visibility_culling',
    techTags: ['CullDistanceVolume', '遮挡剔除', 'FSOC', 'Visibility Culling', 'CanBeOccluded', 'MaxDrawDistance', 'Bounds'],
    previewTags: ['CullDistance', 'FSOC', 'Bounds'],
    strongKeywords: ['CullDistanceVolume', 'MaxDrawDistance', 'CachedMaxDrawDistance', 'CanBeOccluded', 'FSOC', 'Visibility Culling'],
    semanticKeywords: ['遮挡剔除', '距离裁剪', 'bounds', '可见性', 'Occluder', '地形缝隙'],
  },
  {
    id: 'mesh_lod_hism',
    categoryId: 'rendering_scene_perf',
    groupLabel: '网格提交',
    title: 'StaticMesh / LOD / HISM',
    subtitle: 'StaticMesh LOD、HISM/ISM、Instancing、Section 和 Material Slot',
    archTag: 'arch/mesh_lod_hism',
    techTags: ['StaticMesh', 'LOD', 'HLOD', 'HISM', 'ISM', 'InstancedStaticMesh', 'Section', 'Material Slot'],
    previewTags: ['StaticMesh', 'HISM', 'LOD'],
    strongKeywords: ['FStaticMeshLODResources', 'FLODInfo', 'HISM', 'ISM', 'HierarchicalInstancedStaticMesh', 'InstancedStaticMesh', 'Material Slot'],
    semanticKeywords: ['LODResources', 'SelectionGroup', 'hardware instancing', 'ScreenSize', 'Dithered LOD', 'section draw'],
  },
  {
    id: 'terrain_foliage',
    categoryId: 'rendering_scene_perf',
    groupLabel: '场景资源',
    title: 'Terrain / Foliage / RVT',
    subtitle: 'Landscape、Foliage、RVT、地形草和场景资源生成缓存',
    archTag: 'arch/terrain_foliage',
    techTags: ['Landscape', 'Foliage', 'Terrain', 'RVT', 'VirtualTexture', '地形草', 'InstancedFoliageActor'],
    previewTags: ['Landscape', 'Foliage', 'RVT'],
    strongKeywords: ['Landscape', 'Foliage', 'InstancedFoliageActor', 'VirtualTexture', 'RuntimeVirtualTexture', 'RVT'],
    semanticKeywords: ['地形草', 'Spline Mesh', 'grass.Enable', 'FoliageType', '地形', 'Terrain'],
  },
  {
    id: 'render_debug_profile',
    categoryId: 'rendering_scene_perf',
    groupLabel: '诊断分析',
    title: 'FrameAnalysis / RenderDoc / Profiling',
    subtitle: 'FrameAnalysis、RenderDoc、ScenePerfMonitor、热力图和性能定位',
    archTag: 'arch/render_debug_profile',
    techTags: ['FrameAnalysis', 'RenderDoc', 'ScenePerfMonitor', 'Heatmap', '性能分析', 'MemReport', 'SimpleCsvProfiler'],
    previewTags: ['FrameAnalysis', 'RenderDoc', 'ScenePerf'],
    strongKeywords: ['FrameAnalysis', 'RenderDoc', 'ScenePerfMonitor', 'SimpleCsvProfiler', 'MemReport', 'RHIThread DrawIndexedPrimitive'],
    semanticKeywords: ['热力图', 'COS 上传', 'GPU Profiling', 'UI drawcall', '线程瓶颈', 'GameThread', 'RenderThread'],
  },
  {
    id: 'material_shader_postprocess',
    categoryId: 'vfx_sequence',
    groupLabel: '视觉材质',
    title: 'Material / Shader / PostProcess',
    subtitle: '材质、Shader、后处理、DebugView 与视觉效果渲染',
    archTag: 'arch/material_shader_postprocess',
    techTags: ['Material', 'Shader', 'Lighting', 'PostProcess', 'DebugView', '材质球', '后处理'],
    previewTags: ['Material', 'Shader', 'PostProcess'],
    strongKeywords: ['MaterialInstance', 'HLSL', 'Shader', 'PostProcess', 'DebugView', '材质球'],
    semanticKeywords: ['贴图', '采样器', 'ShadowMap', 'Decal', 'RayTracing'],
  },
  {
    id: 'particles_vfx',
    categoryId: 'vfx_sequence',
    groupLabel: '粒子特效',
    title: 'Cascade / Niagara / VFX',
    subtitle: 'Cascade、Niagara、粒子系统、Quad Overdraw 和特效调试',
    archTag: 'arch/particles_vfx',
    techTags: ['Cascade', 'Niagara', 'VFXProfiler', '粒子系统', 'ParticleSystem', 'Overdraw', '特效编辑器'],
    previewTags: ['Cascade', 'Niagara', 'Overdraw'],
    strongKeywords: ['Cascade', 'Niagara', 'VFXProfiler', 'ParticleSystem', 'Quad Overdraw', '粒子系统'],
    semanticKeywords: ['Baker', 'Debugger', 'Emitter', 'Spawnable', '特效', '移动端预览'],
  },
  {
    id: 'sequencer_cinematic',
    categoryId: 'vfx_sequence',
    groupLabel: '序列动画',
    title: 'Sequencer / LevelSequence',
    subtitle: 'Sequencer、LevelSequence、Spawnable、采样链路和 CineCamera',
    archTag: 'arch/sequencer_cinematic',
    techTags: ['Sequencer', 'LevelSequence', 'MovieScene', 'Spawnable', 'CineCamera', 'VFXProfiler'],
    previewTags: ['Sequencer', 'LevelSequence', 'Spawnable'],
    strongKeywords: ['LevelSequence', 'Sequencer', 'UMovieSceneSequence', 'FSequencer', 'FMovieSceneSpawnRegister', 'CineCamera'],
    semanticKeywords: ['Spawnable', '采样链路', 'MovieScene', 'Sequence', '镜头', '中间态崩溃'],
  },
  {
    id: 'slate_editor_ui',
    categoryId: 'vfx_sequence',
    groupLabel: '编辑器 UI',
    title: 'Slate / Editor UI',
    subtitle: 'Slate、UMG、编辑器面板、回调状态和交互 UI',
    archTag: 'arch/slate_editor_ui',
    techTags: ['Slate', 'UMG', 'Widget', 'SWidget', 'UUserWidget', 'Editor UI', 'UI界面'],
    previewTags: ['Slate', 'UMG', 'Widget'],
    strongKeywords: ['Slate', 'SWidget', 'UUserWidget', 'UMG', 'Widget', 'Editor UI'],
    semanticKeywords: ['Layout', 'PanelWidget', 'EventRouting', '回调', '编辑器面板', 'UI drawcall'],
  },
  {
    id: 'ue_python_editor_tools',
    categoryId: 'tools_automation',
    groupLabel: '编辑器自动化',
    title: 'UE Python / Editor Tools',
    subtitle: 'UE Python、资产导入导出、P4 checkout、编辑器工具和 TA 流程',
    archTag: 'arch/ue_python_editor_tools',
    techTags: ['Python', 'UE Python', 'UnrealEnginePython', 'Editor', '编辑器工具', 'TA Tools', 'P4'],
    previewTags: ['Python', 'Editor', 'P4'],
    strongKeywords: ['UnrealEnginePython', 'ue.editor_get_selected_actors', 'factory_import_object', 'P4 checkout', '编辑器工具'],
    semanticKeywords: ['资产导入', '导出', '蓝图资产', 'TA Tools', '工具面板', 'Python API'],
  },
  {
    id: 'build_packaging',
    categoryId: 'tools_automation',
    groupLabel: '构建发布',
    title: 'Build / Pak / HotPatch',
    subtitle: 'UBT、BKDist、Pak、HotPatch、Shader 编译和构建排障',
    archTag: 'arch/build_packaging',
    techTags: ['UBT', 'Build', 'Pak', 'HotPatch', 'Cook', 'BKDist', 'ShaderCompile', 'Android SO'],
    previewTags: ['UBT', 'Pak', 'Cook'],
    strongKeywords: ['UBT', 'BKDist', 'Pak', 'HotPatch', 'CookAndPakAsset', 'Shader 编译', 'libUE4.so'],
    semanticKeywords: ['构建系统', '编译开关', '补丁前缀', '打包', 'APK', 'AndroidInject'],
  },
  {
    id: 'local_tooling_workflow',
    categoryId: 'tools_automation',
    groupLabel: '本地工具链',
    title: '本地工具 / 仓库工作流',
    subtitle: 'Git、Submodule、WOA Git、Codex、CodeBuddy、脚本运行器和工具配置',
    archTag: 'arch/local_tooling_workflow',
    techTags: ['Git', 'Submodule', 'WOA Git', 'Codex', 'CodeBuddy', 'CLI', 'Tooling', '工具配置'],
    previewTags: ['Git', 'Codex', 'CLI'],
    strongKeywords: ['Submodule', 'WOA Git', 'Codex CLI', 'CodeBuddy', 'buddycn.cmd', 'git.woa.com'],
    semanticKeywords: ['仓库同步', 'External Tool', 'feature flag', '权限', '脚本运行器', '配置'],
  },
  {
    id: 'cpu_multithread',
    categoryId: 'runtime_platform',
    groupLabel: '调度',
    title: 'CPU / 多线程 / TaskGraph',
    subtitle: 'TaskGraph、线程、异步、锁和 CPU 性能分析',
    archTag: 'arch/cpu_multithread',
    techTags: ['CPU', '多线程', 'Thread', 'TaskGraph', 'Async', '性能分析', 'FRunnable'],
    previewTags: ['CPU', 'Thread', 'Async'],
    strongKeywords: ['TaskGraph', 'FRunnable', 'TaskGraphSystem', 'Thread', '多线程', 'AsyncTask'],
    semanticKeywords: ['Lock', 'Mutex', 'WorkerThread', 'CPUProfiler', 'UnrealInsights', '线程瓶颈'],
  },
  {
    id: 'memory_storage',
    categoryId: 'runtime_platform',
    groupLabel: '内存资源',
    title: 'Memory / GC / Asset Storage',
    subtitle: 'GC、序列化、AssetRegistry、BuildData、PakFile 和资源加载',
    archTag: 'arch/memory_storage',
    techTags: ['Memory', 'GC', '垃圾回收', 'Serialization', 'AssetRegistry', 'BuildData', 'DataManager', 'PakFile'],
    previewTags: ['GC', 'AssetRegistry', 'PakFile'],
    strongKeywords: ['GarbageCollection', 'UObjectGC', 'FArchive', 'AssetRegistry', 'BuildData', 'FTieredBuildDataManager'],
    semanticKeywords: ['序列化', '资源加载', 'StreamableManager', 'UPackage', '内存', 'World 级 BuildData'],
  },
  {
    id: 'android_platform',
    categoryId: 'runtime_platform',
    groupLabel: '移动平台',
    title: 'Android / Mobile Platform',
    subtitle: 'Android、adb、OpenGL ES、移动端预览、平台指令和设备调试',
    archTag: 'arch/android_platform',
    techTags: ['Android', 'adb', 'OpenGL', 'ES31', 'Mobile', 'AndroidPlatform', 'RenderDoc'],
    previewTags: ['Android', 'adb', 'Mobile'],
    strongKeywords: ['Android', 'adb broadcast', 'ES31', 'AndroidPlatform', 'OpenGL', 'RenderDoc'],
    semanticKeywords: ['移动端', 'console command', 'Test 包', '设备调试', 'APK', 'JNI'],
  },
  {
    id: 'networking_online',
    categoryId: 'runtime_platform',
    groupLabel: '网络运行',
    title: 'Networking / Upload / Server',
    subtitle: 'PacketWatermark、COS、Socket、TCP/UDP、服务器上传和在线服务',
    archTag: 'arch/networking_online',
    techTags: ['Networking', 'Socket', 'TCPIP', 'UDP', 'COS', 'PacketWatermark', 'Replication', 'RPC', 'ServerCloud'],
    previewTags: ['Socket', 'COS', 'Packet'],
    strongKeywords: ['PacketWatermark', 'FChaCha', 'Socket', 'TCPIP', 'UDP', 'COS', 'Replication', 'RPC'],
    semanticKeywords: ['网络包', '水印', '上传', 'Manifest', 'ServerAddr', 'LocalServerAddr', '多人同步', 'NetDriver'],
  },
  {
    id: 'agent_llm_architecture',
    categoryId: 'ai_web_knowledge',
    groupLabel: 'Agent',
    title: 'Agent / LLM Architecture',
    subtitle: 'Kimi CLI、MCP、Tool Loop、Flow、Runtime 和多模态消息结构',
    archTag: 'arch/agent_llm_architecture',
    techTags: ['Agent', 'LLM', 'Kimi CLI', 'kimi-cli', 'MCP', 'Tool Loop', 'OpenAI', 'DeepSeek'],
    previewTags: ['Agent', 'LLM', 'MCP'],
    strongKeywords: ['KimiSoul', 'kimi-cli', 'Tool Loop', 'MCP', 'DeepSeek', 'OpenAI SDK', 'Wire Turn'],
    semanticKeywords: ['Flow', 'Runtime', 'checkpoint', 'ContentPart', 'Dynamic Injection', '多模态', 'completion'],
  },
  {
    id: 'web_frontend_product',
    categoryId: 'ai_web_knowledge',
    groupLabel: 'Web',
    title: 'Nuxt / Vue / Frontend',
    subtitle: 'Nuxt、Vue、Element Plus、TypeScript、前端调试和本地 Web 工具',
    archTag: 'arch/web_frontend_product',
    techTags: ['Nuxt', 'Vue', 'Frontend', '前端工程', 'TypeScript', 'Element Plus', 'Node.js', 'Nitro'],
    previewTags: ['Nuxt', 'Vue', 'TypeScript'],
    strongKeywords: ['Nuxt', 'Vue', 'Element Plus', 'TypeScript', 'defineNitroPlugin', 'AsyncLocalStorage'],
    semanticKeywords: ['前端调试', '表格', '横向滚动条', 'iframe', 'Node.js', '服务端插件'],
  },
  {
    id: 'knowledge_management',
    categoryId: 'ai_web_knowledge',
    groupLabel: 'Knowledge',
    title: '知识管理 / 可视化',
    subtitle: 'Knowledge Cards、Mermaid、NotebookLM、知识卡片资产和结构化笔记',
    archTag: 'arch/knowledge_management',
    techTags: ['知识管理', 'Knowledge Cards', 'knowledge-cards', 'Mermaid', 'NotebookLM', 'Obsidian'],
    previewTags: ['Obsidian', 'Mermaid', 'Cards'],
    strongKeywords: ['knowledge-cards', 'Knowledge Cards', 'Obsidian', 'NotebookLM', 'Mermaid'],
    semanticKeywords: ['知识卡片', '图表', '资产本地化', '预览图', '结构化知识', '卡片墙'],
  },
]

const selectedKnowledgeHomeCategoryId = ref(KNOWLEDGE_HOME_CATEGORIES[0]?.id || '')
const selectedKnowledgeSubcategory = ref<KnowledgeSubcategory | null>(null)
const selectedKnowledgeSubcategorySearchText = ref('')
const knowledgeSubcategoryById = new Map(KNOWLEDGE_SUBCATEGORIES.map(item => [item.id, item]))

const normalizedText = (value: string) => value.toLowerCase().replace(/\s+/g, '')
const textIncludes = (text: string, keyword: string) => Boolean(keyword) && text.includes(keyword.toLowerCase())

function scoreKnowledgeSubcategory(card: KnowledgeCard, subcategory: KnowledgeSubcategory) {
  const title = (card.title || '').toLowerCase()
  const domain = (card.domain || '').toLowerCase()
  const summary = (card.summary || '').toLowerCase()
  const content = (card.content || '').toLowerCase()
  const tags = (card.tags || []).map(tag => tag.toLowerCase())
  const domainAndTags = `${domain} ${tags.join(' ')}`
  let score = 0

  const archTag = subcategory.archTag.toLowerCase()
  const hasAbsoluteTag = tags.some(tag => tag === archTag || tag.startsWith(`${archTag}/`))
  if (hasAbsoluteTag) score += 100

  for (const tag of subcategory.techTags.map(item => item.toLowerCase())) {
    if (!tag) continue
    if (tags.includes(tag)) score += 8
    if (domain.includes(tag)) score += 5
    if (title.includes(tag)) score += 4
    if (summary.includes(tag)) score += 2
  }

  if (normalizedText(title).includes(normalizedText(subcategory.title))) score += 8

  for (const keyword of subcategory.strongKeywords.map(item => item.toLowerCase())) {
    if (textIncludes(title, keyword)) score += 9
    else if (textIncludes(domainAndTags, keyword)) score += 7
    else if (textIncludes(summary, keyword)) score += 5
    else if (textIncludes(content, keyword)) score += 2.5
  }

  for (const keyword of subcategory.semanticKeywords.map(item => item.toLowerCase())) {
    if (textIncludes(title, keyword)) score += 4
    else if (textIncludes(domainAndTags, keyword)) score += 3
    else if (textIncludes(summary, keyword)) score += 1.5
    else if (textIncludes(content, keyword)) score += 0.6
  }

  return { score, hasAbsoluteTag }
}

const knowledgeCardSubcategoryMapping = computed<Record<string, string[]>>(() => {
  const mapping: Record<string, string[]> = {}

  for (const card of cards.value) {
    const scores = KNOWLEDGE_SUBCATEGORIES
      .map(subcategory => ({ id: subcategory.id, ...scoreKnowledgeSubcategory(card, subcategory) }))
      .sort((a, b) => b.score - a.score)

    const absolute = scores.filter(item => item.hasAbsoluteTag).map(item => item.id)
    if (absolute.length > 0) {
      mapping[card.id] = absolute
      continue
    }

    const valid = scores.filter(item => item.score >= 6)
    if (valid.length === 0) {
      mapping[card.id] = []
      continue
    }

    const bestScore = valid[0].score
    mapping[card.id] = valid
      .filter(item => item.score === bestScore || (bestScore >= 14 && bestScore - item.score <= 4))
      .slice(0, 2)
      .map(item => item.id)
  }

  return mapping
})

function getKnowledgeSubcategoryCards(subcategory: KnowledgeSubcategory) {
  return cards.value.filter(card => (knowledgeCardSubcategoryMapping.value[card.id] || []).includes(subcategory.id))
}

const knowledgeSubcategoryCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const subcategory of KNOWLEDGE_SUBCATEGORIES) {
    counts[subcategory.id] = getKnowledgeSubcategoryCards(subcategory).length
  }
  return counts
})

const knowledgeCategoryCardIdSets = computed(() => {
  const sets: Record<string, Set<string>> = {}
  for (const category of KNOWLEDGE_HOME_CATEGORIES) sets[category.id] = new Set<string>()
  for (const card of cards.value) {
    for (const subcategoryId of knowledgeCardSubcategoryMapping.value[card.id] || []) {
      const subcategory = knowledgeSubcategoryById.get(subcategoryId)
      if (subcategory) sets[subcategory.categoryId]?.add(card.id)
    }
  }
  return sets
})

const knowledgeHomeMatchedCardCount = computed(() => {
  return cards.value.filter(card => (knowledgeCardSubcategoryMapping.value[card.id] || []).length > 0).length
})

const knowledgeHomeCategoryStats = computed(() => {
  return KNOWLEDGE_HOME_CATEGORIES.map(category => {
    const subcategories = KNOWLEDGE_SUBCATEGORIES.filter(item => item.categoryId === category.id)
    return {
      ...category,
      cardCount: knowledgeCategoryCardIdSets.value[category.id]?.size || 0,
      subcategoryCount: subcategories.length,
      matchedSubcategoryCount: subcategories.filter(item => (knowledgeSubcategoryCounts.value[item.id] || 0) > 0).length,
    }
  })
})

const selectedKnowledgeHomeCategory = computed(() => {
  return knowledgeHomeCategoryStats.value.find(item => item.id === selectedKnowledgeHomeCategoryId.value) || knowledgeHomeCategoryStats.value[0] || null
})

const selectedKnowledgeSubcategoryStats = computed(() => {
  return KNOWLEDGE_SUBCATEGORIES
    .filter(item => item.categoryId === selectedKnowledgeHomeCategoryId.value)
    .map(item => ({ ...item, cardCount: knowledgeSubcategoryCounts.value[item.id] || 0 }))
})

const selectedKnowledgeSubcategoryCategory = computed(() => {
  if (!selectedKnowledgeSubcategory.value) return null
  return KNOWLEDGE_HOME_CATEGORIES.find(item => item.id === selectedKnowledgeSubcategory.value?.categoryId) || null
})

const selectedKnowledgeSubcategoryFilteredCards = computed(() => {
  if (!selectedKnowledgeSubcategory.value) return []
  const baseCards = getKnowledgeSubcategoryCards(selectedKnowledgeSubcategory.value)
  const needle = selectedKnowledgeSubcategorySearchText.value.trim().toLowerCase()
  if (!needle) return baseCards
  return baseCards.filter(card => {
    const searchable = `${card.title} ${card.domain} ${card.summary} ${(card.tags || []).join(' ')}`.toLowerCase()
    return searchable.includes(needle)
  })
})

const selectedKnowledgeSubcategoryTotalCount = computed(() => {
  if (!selectedKnowledgeSubcategory.value) return 0
  return knowledgeSubcategoryCounts.value[selectedKnowledgeSubcategory.value.id] || 0
})

function selectKnowledgeHomeCategory(category: KnowledgeHomeCategory) {
  selectedKnowledgeHomeCategoryId.value = category.id
  selectedKnowledgeSubcategory.value = null
  selectedKnowledgeSubcategorySearchText.value = ''
}

function selectKnowledgeSubcategory(subcategory: KnowledgeSubcategory) {
  selectedKnowledgeSubcategory.value = subcategory
  selectedKnowledgeSubcategorySearchText.value = ''
}

function exploreKnowledgeSubcategoryInCardsView() {
  if (!selectedKnowledgeSubcategory.value) return
  searchText.value = selectedKnowledgeSubcategory.value.title
  activeView.value = 'cards'
}
const vaultPath = ref('')
const lastSyncTime = ref('')
const knowledgeStats = ref<KnowledgeStats>({ total: 0, cards: 0, mocs: 0, hubs: 0, maps: 0 })
const domainCollapsed = ref(true)
const searchText = ref('')
const activeDomains = ref(new Set<string>())
const activeDifficulties = ref(new Set<number>())
const activeDateKeys = ref(new Set<string>())
const dateTabMode = ref<'year' | 'month' | 'week' | 'day'>('day')
const dateTabOptions = [
  { key: 'day' as const, label: '日' },
  { key: 'week' as const, label: '周' },
  { key: 'month' as const, label: '月' },
  { key: 'year' as const, label: '年' },
]

function getLatestDateKey(mode: 'year' | 'month' | 'week' | 'day'): string {
  const keys = new Set<string>()
  for (const card of cards.value) {
    const key = getDateKey(card.date, mode)
    if (key) keys.add(key)
  }
  return Array.from(keys).sort((a, b) => b.localeCompare(a))[0] || ''
}

function syncDefaultDateSelection() {
  if (dateTabMode.value !== 'day') {
    activeDateKeys.value = new Set()
    return
  }

  const activeKey = Array.from(activeDateKeys.value)[0]
  if (activeKey && dateGroupItems.value.some(item => item.key === activeKey)) {
    return
  }

  const latestDateKey = getLatestDateKey('day')
  activeDateKeys.value = latestDateKey ? new Set([latestDateKey]) : new Set()
}

// 切换维度时自动清除日期筛选；切回“日”时默认选中最新日期
watch(dateTabMode, () => {
  syncDefaultDateSelection()
})
const activeTags = ref(new Set<string>())

const selectedCard = ref<KnowledgeCard | null>(null)
const selectedIsCard = computed(() => Boolean(selectedCard.value && CARD_ID_PATTERN.test(selectedCard.value.id)))
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

const graphLoading = ref(false)
const graphNodes = ref<KnowledgeGraphNode[]>([])
const graphEdges = ref<KnowledgeGraphEdge[]>([])
const graphSearchText = ref('')
const graphEntryId = ref('00-知识体系总图')
const expandedGraphNodeIds = ref(new Set<string>())
const activeGraphTypes = ref(new Set<KnowledgeNodeType>(['map', 'moc', 'hub', 'card', 'note']))
const graphScale = ref(0.82)
const graphOffset = ref({ x: 90, y: 430 })
const graphDragging = ref(false)
const graphDragStart = ref({ x: 0, y: 0, offsetX: 0, offsetY: 0 })
const graphTypeOptions: { key: KnowledgeNodeType; label: string }[] = [
  { key: 'map', label: '总图' },
  { key: 'moc', label: 'MOC' },
  { key: 'hub', label: 'HUB' },
  { key: 'card', label: 'KC' },
  { key: 'note', label: '笔记' },
]

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
const defaultImportDirName = ref('')
const defaultImportDirConfigured = ref(false)
const defaultImportDirPermission = ref<'unknown' | 'granted' | 'prompt' | 'denied' | 'unsupported'>(
  hasDirectoryPickerAPI.value ? 'unknown' : 'unsupported'
)
const defaultImportDirMessage = ref('')

const DEFAULT_IMPORT_DIR_DB_NAME = 'cgtools-knowledge-import'
const DEFAULT_IMPORT_DIR_STORE_NAME = 'handles'
const DEFAULT_IMPORT_DIR_KEY = 'knowledge-default-import-directory'

const defaultImportDirPermissionText = computed(() => {
  switch (defaultImportDirPermission.value) {
    case 'granted':
      return '已授权，可直接使用'
    case 'prompt':
      return '待授权，使用时会再次请求权限'
    case 'denied':
      return '权限已失效，请重新配置或重新授权'
    case 'unsupported':
      return '当前浏览器不支持默认文件夹功能'
    default:
      return '未检测'
  }
})

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

const headerCardCount = computed(() => {
  return activeView.value === 'architecture' ? knowledgeHomeMatchedCardCount.value : filteredCards.value.length
})

const graphTypeCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const node of graphNodes.value) {
    counts[node.type] = (counts[node.type] || 0) + 1
  }
  return counts
})

const graphNodeById = computed(() => {
  const map = new Map<string, KnowledgeGraphNode>()
  for (const node of graphNodes.value) {
    map.set(node.id, node)
  }
  return map
})

const graphChildrenById = computed(() => {
  const map = new Map<string, string[]>()
  for (const edge of graphEdges.value) {
    if (edge.missing) continue
    if (!map.has(edge.source)) map.set(edge.source, [])
    map.get(edge.source)!.push(edge.target)
  }
  return map
})

const expandedReachableGraphIds = computed(() => {
  const visibleIds = new Set<string>()
  const entryId = graphEntryId.value
  if (!entryId || !graphNodeById.value.has(entryId)) return visibleIds

  const queue = [entryId]
  visibleIds.add(entryId)

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || !expandedGraphNodeIds.value.has(current)) continue

    for (const childId of graphChildrenById.value.get(current) || []) {
      if (visibleIds.has(childId)) continue
      visibleIds.add(childId)
      queue.push(childId)
    }
  }

  return visibleIds
})

const visibleGraphNodes = computed(() => {
  const needle = graphSearchText.value.trim().toLowerCase()
  return graphNodes.value.filter(node => {
    if (!needle && !expandedReachableGraphIds.value.has(node.id)) return false
    if (!activeGraphTypes.value.has(node.type)) return false
    if (!needle) return true
    const searchable = `${node.id} ${node.title} ${node.domain} ${(node.tags || []).join(' ')} ${node.summary || ''}`.toLowerCase()
    return searchable.includes(needle)
  })
})

const visibleGraphNodeIds = computed(() => new Set(visibleGraphNodes.value.map(node => node.id)))

const visibleGraphEdges = computed(() => {
  return graphEdges.value.filter(edge => {
    return !edge.missing && visibleGraphNodeIds.value.has(edge.source) && visibleGraphNodeIds.value.has(edge.target)
  })
})

const missingGraphEdges = computed(() => graphEdges.value.filter(edge => edge.missing).length)

const graphNodePositions = computed(() => {
  const columns: Record<string, KnowledgeGraphNode[]> = {
    map: [],
    moc: [],
    hub: [],
    note: [],
    card: [],
  }

  for (const node of visibleGraphNodes.value) {
    const key = node.type === 'map' || node.type === 'moc' || node.type === 'hub' || node.type === 'note' ? node.type : 'card'
    columns[key]?.push(node)
  }

  const xByType: Record<string, number> = {
    map: 80,
    moc: 360,
    hub: 670,
    note: 970,
    card: 970,
  }
  const positions: Record<string, { x: number; y: number }> = {}

  for (const [type, nodes] of Object.entries(columns)) {
    nodes.sort((a, b) => a.id.localeCompare(b.id, 'zh-CN'))
    const spacing = type === 'card' ? 58 : 86
    const startY = -((nodes.length - 1) * spacing) / 2
    nodes.forEach((node, index) => {
      positions[node.id] = {
        x: xByType[type] ?? 970,
        y: startY + index * spacing,
      }
    })
  }

  return positions
})

const graphTransform = computed(() => `translate(${graphOffset.value.x} ${graphOffset.value.y}) scale(${graphScale.value})`)

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
  // 日期维度是互斥筛选：同一时间只允许选中一个日/周/月/年，避免窄侧栏里多项叠加后状态难读。
  activeDateKeys.value = activeDateKeys.value.has(key) ? new Set() : new Set([key])
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

function graphTypeColor(type: KnowledgeNodeType): string {
  switch (type) {
    case 'map': return '#60CDFF'
    case 'moc': return '#8BD17C'
    case 'hub': return '#F2C94C'
    case 'card': return '#A29BFE'
    case 'note': return '#B0BEC5'
    default: return '#737373'
  }
}

function graphNodeRadius(node: KnowledgeGraphNode) {
  if (node.type === 'map') return 18
  if (node.type === 'moc') return 14
  if (node.type === 'hub') return 12
  return 8
}

function hasGraphChildren(nodeId: string) {
  return (graphChildrenById.value.get(nodeId) || []).length > 0
}

function toggleGraphNode(node: KnowledgeGraphNode) {
  if (!hasGraphChildren(node.id)) {
    void openGraphNode(node)
    return
  }

  const next = new Set(expandedGraphNodeIds.value)
  if (next.has(node.id)) {
    next.delete(node.id)
  } else {
    next.add(node.id)
  }
  expandedGraphNodeIds.value = next
}

function collapseGraphToEntry() {
  expandedGraphNodeIds.value = new Set([graphEntryId.value])
  resetGraphViewport()
}

function expandGraphOneLevel() {
  const next = new Set(expandedGraphNodeIds.value)
  for (const id of expandedReachableGraphIds.value) {
    if (hasGraphChildren(id)) next.add(id)
  }
  expandedGraphNodeIds.value = next
}

function expandAllGraph() {
  const next = new Set<string>()
  for (const node of graphNodes.value) {
    if (hasGraphChildren(node.id)) next.add(node.id)
  }
  expandedGraphNodeIds.value = next
}

function toggleGraphType(type: KnowledgeNodeType) {
  const next = new Set(activeGraphTypes.value)
  if (next.has(type)) {
    next.delete(type)
  } else {
    next.add(type)
  }
  activeGraphTypes.value = next
}

function resetGraphViewport() {
  graphScale.value = 0.82
  graphOffset.value = { x: 90, y: 430 }
}

function startGraphPan(event: MouseEvent) {
  graphDragging.value = true
  graphDragStart.value = {
    x: event.clientX,
    y: event.clientY,
    offsetX: graphOffset.value.x,
    offsetY: graphOffset.value.y,
  }
}

function moveGraphPan(event: MouseEvent) {
  if (!graphDragging.value) return
  graphOffset.value = {
    x: graphDragStart.value.offsetX + event.clientX - graphDragStart.value.x,
    y: graphDragStart.value.offsetY + event.clientY - graphDragStart.value.y,
  }
}

function endGraphPan() {
  graphDragging.value = false
}

function onGraphWheel(event: WheelEvent) {
  const next = Math.min(1.8, Math.max(0.35, graphScale.value + (event.deltaY > 0 ? -0.08 : 0.08)))
  graphScale.value = Number(next.toFixed(2))
}

async function refreshGraph() {
  graphLoading.value = true
  try {
    const data = await $fetch<{
      nodes: KnowledgeGraphNode[]
      edges: KnowledgeGraphEdge[]
      entryId: string
      vaultPath: string
      updated_at: string
      stats: KnowledgeStats
    }>('/api/knowledge/graph')
    graphNodes.value = data.nodes || []
    graphEdges.value = data.edges || []
    graphEntryId.value = data.entryId || graphEntryId.value
    if (expandedGraphNodeIds.value.size === 0) {
      expandedGraphNodeIds.value = new Set([graphEntryId.value])
    }
    vaultPath.value = data.vaultPath || vaultPath.value
    lastSyncTime.value = data.updated_at || lastSyncTime.value
    if (data.stats) knowledgeStats.value = data.stats
  } catch (e) {
    console.error('Failed to load knowledge graph:', e)
    graphNodes.value = []
    graphEdges.value = []
  } finally {
    graphLoading.value = false
  }
}

async function showGraphView() {
  activeView.value = 'graph'
  if (graphNodes.value.length === 0) {
    await refreshGraph()
  }
}

async function openGraphNode(node: KnowledgeGraphNode) {
  const cardLike: KnowledgeCard = {
    id: node.id,
    title: node.title,
    domain: node.domain,
    difficulty: node.difficulty || 1,
    date: node.date,
    tags: node.tags || [],
    summary: node.summary,
    source: node.source,
    path: node.path,
  }
  await openCard(cardLike)
}

// Fetch cards
async function refreshCards() {
  loading.value = true
  try {
    const data = await $fetch<{
      cards: KnowledgeCard[]
      vaultPath: string
      updated_at: string
      stats: KnowledgeStats
    }>('/api/knowledge')
    cards.value = data.cards || []
    vaultPath.value = data.vaultPath || ''
    lastSyncTime.value = data.updated_at || ''
    if (data.stats) knowledgeStats.value = data.stats
    syncDefaultDateSelection()
  } catch (e) {
    console.error('Failed to load cards:', e)
    cards.value = []
    syncDefaultDateSelection()
  } finally {
    loading.value = false
  }
}

async function rebuildIndex() {
  rebuildingIndex.value = true
  try {
    await $fetch('/api/knowledge/rebuild', { method: 'POST' })
    await refreshCards()
    if (activeView.value === 'graph') {
      await refreshGraph()
    }
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
    if (activeView.value === 'graph') await refreshGraph()
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

const zoomMermaidVisible = ref(false)
const zoomMermaidHtml = ref('')
const lightboxScale = ref(1)
const lightboxOffset = ref({ x: 0, y: 0 })
let isDraggingLightbox = false
let dragStartLightbox = { x: 0, y: 0, offsetX: 0, offsetY: 0 }

function closeZoomMermaid() {
  zoomMermaidVisible.value = false
  zoomMermaidHtml.value = ''
}

function setupLightboxZoomPan() {
  lightboxScale.value = 1
  lightboxOffset.value = { x: 0, y: 0 }

  const container = document.querySelector('.kc-mermaid-lightbox-body') as HTMLElement
  const svg = container?.querySelector('svg') as SVGElement
  if (!svg) return

  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.style.width = '100%'
  svg.style.height = '100%'
  svg.style.maxWidth = 'none'
  svg.style.maxHeight = 'none'
  svg.style.transformOrigin = 'center center'
  svg.style.transition = 'none'

  const updateTransform = () => {
    svg.style.transform = `translate(${lightboxOffset.value.x}px, ${lightboxOffset.value.y}px) scale(${lightboxScale.value})`
  }

  container.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    lightboxScale.value = Math.min(6, Math.max(0.15, lightboxScale.value + delta))
    updateTransform()
  }, { passive: false })

  container.addEventListener('mousedown', (e: MouseEvent) => {
    isDraggingLightbox = true
    container.style.cursor = 'grabbing'
    dragStartLightbox = {
      x: e.clientX,
      y: e.clientY,
      offsetX: lightboxOffset.value.x,
      offsetY: lightboxOffset.value.y
    }
  })

  const onMouseMove = (e: MouseEvent) => {
    if (!isDraggingLightbox) return
    lightboxOffset.value = {
      x: dragStartLightbox.offsetX + (e.clientX - dragStartLightbox.x),
      y: dragStartLightbox.offsetY + (e.clientY - dragStartLightbox.y)
    }
    updateTransform()
  }

  const onMouseUp = () => {
    isDraggingLightbox = false
    if (container) container.style.cursor = 'grab'
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)

  watch(zoomMermaidVisible, (visible) => {
    if (!visible) {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  })
}

if (typeof window !== 'undefined') {
  (window as any).zoomMermaid = (el: HTMLElement) => {
    const svg = el.querySelector('svg')
    if (!svg) return

    zoomMermaidHtml.value = svg.outerHTML
    zoomMermaidVisible.value = true

    nextTick(() => {
      setupLightboxZoomPan()
    })
  }
}

const loadMermaid = () => {
  return new Promise<any>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null)
      return
    }
    if ((window as any).mermaid) {
      resolve((window as any).mermaid)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'
    script.onload = () => {
      const m = (window as any).mermaid
      m.initialize({
        startOnLoad: false,
        theme: 'dark', // 高科技暗黑主题，完美相配！
        securityLevel: 'loose',
        themeVariables: {
          primaryColor: '#60cdff',
          primaryTextColor: '#fff',
          lineColor: '#555',
        }
      })
      resolve(m)
    }
    document.head.appendChild(script)
  })
}

async function renderMermaidDiagrams() {
  await nextTick()
  try {
    const m = await loadMermaid()
    setTimeout(() => {
      const elements = document.querySelectorAll('.kc-mermaid-container .mermaid')
      if (elements.length > 0 && m) {
        m.run({
          nodes: Array.from(elements)
        })
      }
    }, 120)
  } catch (e) {
    console.error('Failed to render mermaid diagram:', e)
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
    const data = await $fetch<{ markdown: string }>(`/api/knowledge/${encodeURIComponent(card.id)}`)
    cardRawMarkdown.value = data.markdown || ''
    cardContentHtml.value = markdownToHtml(data.markdown)
    void renderMermaidDiagrams()
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
    const data = await $fetch<{ markdown: string }>(`/api/knowledge/${encodeURIComponent(card.id)}`, {
      method: 'PUT',
      body: {
        markdown,
      },
    })

    cardRawMarkdown.value = data.markdown || markdown
    editingCardMarkdown.value = cardRawMarkdown.value
    cardContentHtml.value = markdownToHtml(cardRawMarkdown.value)
    editingCard.value = false
    void renderMermaidDiagrams()

    await refreshCards()
    if (activeView.value === 'graph') await refreshGraph()
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
    await $fetch(`/api/knowledge/${encodeURIComponent(card.id)}`, { method: 'DELETE' })
    deleteConfirmVisible.value = false
    deleteTargetCard.value = null
    selectedCard.value = null
    await refreshCards()
    if (activeView.value === 'graph') await refreshGraph()
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
    if (activeView.value === 'graph') await refreshGraph()
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
    const idMatch = (match[1] || '').match(/^id\s*:\s*(.+)$/m)
    if (idMatch) {
      idFromMeta = (idMatch[1] || '').trim().replace(/^['"]|['"]$/g, '')
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

async function openImportHandleDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    throw new Error('当前环境不支持默认文件夹存储')
  }

  return await new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DEFAULT_IMPORT_DIR_DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DEFAULT_IMPORT_DIR_STORE_NAME)) {
        db.createObjectStore(DEFAULT_IMPORT_DIR_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('打开默认文件夹存储失败'))
  })
}

async function getStoredDefaultImportDirectoryHandle(): Promise<any | null> {
  const db = await openImportHandleDb()
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(DEFAULT_IMPORT_DIR_STORE_NAME, 'readonly')
    const store = tx.objectStore(DEFAULT_IMPORT_DIR_STORE_NAME)
    const request = store.get(DEFAULT_IMPORT_DIR_KEY)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error || new Error('读取默认文件夹失败'))
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('读取默认文件夹失败'))
    }
  })
}

async function saveStoredDefaultImportDirectoryHandle(dirHandle: any) {
  const db = await openImportHandleDb()
  return await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DEFAULT_IMPORT_DIR_STORE_NAME, 'readwrite')
    const store = tx.objectStore(DEFAULT_IMPORT_DIR_STORE_NAME)
    const request = store.put(dirHandle, DEFAULT_IMPORT_DIR_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('保存默认文件夹失败'))
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('保存默认文件夹失败'))
    }
  })
}

async function clearStoredDefaultImportDirectoryHandle() {
  const db = await openImportHandleDb()
  return await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DEFAULT_IMPORT_DIR_STORE_NAME, 'readwrite')
    const store = tx.objectStore(DEFAULT_IMPORT_DIR_STORE_NAME)
    const request = store.delete(DEFAULT_IMPORT_DIR_KEY)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('清除默认文件夹失败'))
    tx.oncomplete = () => db.close()
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('清除默认文件夹失败'))
    }
  })
}

async function queryDirectoryPermission(handle: any, mode: 'read' | 'readwrite'): Promise<'granted' | 'prompt' | 'denied'> {
  if (!handle) return 'denied'
  if (typeof handle.queryPermission !== 'function') return 'granted'
  try {
    return await handle.queryPermission({ mode })
  } catch {
    return 'denied'
  }
}

async function ensureDirectoryPermission(handle: any, mode: 'read' | 'readwrite') {
  const current = await queryDirectoryPermission(handle, mode)
  if (current === 'granted') return true
  if (typeof handle.requestPermission !== 'function') return false
  try {
    return (await handle.requestPermission({ mode })) === 'granted'
  } catch {
    return false
  }
}

async function refreshDefaultImportDirectoryState() {
  if (!hasDirectoryPickerAPI.value) {
    defaultImportDirConfigured.value = false
    defaultImportDirName.value = ''
    defaultImportDirPermission.value = 'unsupported'
    return
  }

  try {
    const dirHandle = await getStoredDefaultImportDirectoryHandle()
    if (!dirHandle) {
      defaultImportDirConfigured.value = false
      defaultImportDirName.value = ''
      defaultImportDirPermission.value = 'unknown'
      return
    }

    defaultImportDirConfigured.value = true
    defaultImportDirName.value = dirHandle.name || '未命名文件夹'
    defaultImportDirPermission.value = await queryDirectoryPermission(dirHandle, 'read')
  } catch (e: any) {
    defaultImportDirConfigured.value = false
    defaultImportDirName.value = ''
    defaultImportDirPermission.value = 'denied'
    defaultImportDirMessage.value = '读取默认文件夹配置失败: ' + (e.message || String(e))
  }
}

async function configureDefaultImportDirectory() {
  if (!(window as any).showDirectoryPicker) {
    defaultImportDirMessage.value = '当前浏览器不支持默认文件夹功能'
    return
  }

  defaultImportDirMessage.value = ''
  try {
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    const granted = await ensureDirectoryPermission(dirHandle, 'readwrite')
    if (!granted) {
      defaultImportDirPermission.value = 'denied'
      defaultImportDirMessage.value = '未授予默认文件夹访问权限'
      return
    }

    await saveStoredDefaultImportDirectoryHandle(dirHandle)
    await refreshDefaultImportDirectoryState()
    defaultImportDirPermission.value = 'granted'
    defaultImportDirMessage.value = `已设置默认文件夹：${dirHandle.name}`
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      defaultImportDirMessage.value = '已取消默认文件夹选择'
    } else {
      defaultImportDirMessage.value = '设置默认文件夹失败: ' + (e.message || String(e))
    }
  }
}

async function clearDefaultImportDirectory() {
  defaultImportDirMessage.value = ''
  try {
    await clearStoredDefaultImportDirectoryHandle()
    defaultImportDirConfigured.value = false
    defaultImportDirName.value = ''
    defaultImportDirPermission.value = 'unknown'
    defaultImportDirMessage.value = '已清除默认文件夹配置'
  } catch (e: any) {
    defaultImportDirMessage.value = '清除默认文件夹失败: ' + (e.message || String(e))
  }
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
    const file = files.item(i)
    if (!file) continue
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
    await handleDirectoryActionWithHandle(dirHandle, mode)
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

async function runWithDefaultImportDirectory(mode: FolderActionMode) {
  if (!defaultImportDirConfigured.value) {
    defaultImportDirMessage.value = '请先配置默认文件夹'
    return
  }

  importSubmitting.value = true
  importError.value = ''
  importResults.value = []
  defaultImportDirMessage.value = ''

  try {
    const dirHandle = await getStoredDefaultImportDirectoryHandle()
    if (!dirHandle) {
      defaultImportDirConfigured.value = false
      defaultImportDirName.value = ''
      defaultImportDirPermission.value = 'unknown'
      defaultImportDirMessage.value = '默认文件夹配置已失效，请重新设置'
      return
    }

    const permissionMode = mode === 'full-import' ? 'readwrite' : 'read'
    const granted = await ensureDirectoryPermission(dirHandle, permissionMode)
    await refreshDefaultImportDirectoryState()
    if (!granted) {
      defaultImportDirMessage.value = '默认文件夹未授权，请重新授权或重新设置'
      return
    }

    defaultImportDirPermission.value = 'granted'
    await handleDirectoryActionWithHandle(dirHandle, mode)
  } catch (e: any) {
    importError.value = '操作出错: ' + (e.message || String(e))
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
        message: '卡片已在 Obsidian 目录中，已跳过',
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
  defaultImportDirMessage.value = ''
  void refreshDefaultImportDirectoryState()
}

function closeImportModal() {
  importModalVisible.value = false
  importError.value = ''
  pendingFolderAction.value = 'full-import'
  isDragOver.value = false
  droppedFiles.value = []
}

async function handleDirectoryActionWithHandle(dirHandle: any, mode: FolderActionMode) {
  if (mode !== 'full-import') {
    const localFiles = await collectMdFilesFromDirectoryHandle(dirHandle)
    await syncMissingCardsFromLocalFiles(localFiles, mode)
    return
  }

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

  for await (const entry of (dirHandle as any).values()) {
    if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.md')) continue

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
    const effectiveId = existingFileId && CARD_ID_PATTERN.test(existingFileId) ? existingFileId
      : (CARD_ID_PATTERN.test(baseNameId) ? baseNameId : '')

    let chosenId = effectiveId
    let needUpdateFile = false

    if (!chosenId || (existingIds.has(chosenId) && !importAllowOverwrite.value)) {
      maxSeq++
      chosenId = `${prefix}${String(maxSeq).padStart(3, '0')}`
      needUpdateFile = true
      existingIds.add(chosenId)
    } else if (chosenId !== existingFileId || entry.name !== `${chosenId}.md`) {
      needUpdateFile = true
    }

    let newContent = content
    if (needUpdateFile) {
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

      try {
        if (entry.name !== `${chosenId}.md`) {
          const newFileHandle = await dirHandle.getFileHandle(`${chosenId}.md`, { create: true })
          const writable = await newFileHandle.createWritable()
          await writable.write(newContent)
          await writable.close()

          await dirHandle.removeEntry(entry.name)
          resultsPreview.push({ status: 'imported', id: chosenId, filename: entry.name, message: `已重命名为 ${chosenId}.md 并规范内容` })
        } else {
          const writable = await fileHandle.createWritable()
          await writable.write(newContent)
          await writable.close()
          resultsPreview.push({ status: 'imported', id: chosenId, filename: entry.name, message: `已更新文件内的 ID 为 ${chosenId}` })
        }
      } catch (err: any) {
        resultsPreview.push({ status: 'error', id: chosenId, filename: entry.name, message: `本地文件修改失败: ${err.message}` })
      }
    }

    filePayloads.push({ filename: `${chosenId}.md`, content: newContent })
  }

  await uploadFilePayloads(filePayloads, resultsPreview)
}

async function handleDirectoryImport() {
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
    await handleDirectoryActionWithHandle(dirHandle, 'full-import')
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

    // 获取 Obsidian 目录中的卡片列表，用于分配不冲突的新 ID。
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
      const file = files.item(i)
      if (!file) continue
      if (!file.name.toLowerCase().endsWith('.md')) continue

      const content = await file.text()
      const normalized = content.replace(/^\ufeff/, '')
      const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)

      let existingFileId = ''
      if (match) {
        const idMatch = (match[1] || '').match(/^id\s*:\s*(.+)$/m)
        if (idMatch) {
          existingFileId = (idMatch[1] || '').trim().replace(/^['"]|['"]$/g, '')
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
        const fmContent = match[1] || ''
        const body = match[2] || ''
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
function onDragOver(_e: DragEvent) {
  if (importSubmitting.value) return
  isDragOver.value = true
}

function onDragLeave(_e: DragEvent) {
  isDragOver.value = false
}

async function onDropFiles(e: DragEvent) {
  isDragOver.value = false
  if (importSubmitting.value) return

  const dt = e.dataTransfer
  if (!dt) return

  // 先通过 items 获取所有 File 对象（比 dt.files 更可靠）
  const rawFiles: File[] = []
  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i]
      if (item && item.kind === 'file') {
        const f = item.getAsFile()
        if (f) rawFiles.push(f)
      }
    }
  }

  const mdFiles: { filename: string; content: string }[] = []
  for (const file of rawFiles) {
    if (file.name.toLowerCase().endsWith('.md')) {
      mdFiles.push({ filename: file.name, content: await file.text() })
    }
  }

  if (mdFiles.length === 0) {
    importError.value = `拖入了 ${rawFiles.length} 个文件，但没有找到 .md 文件`
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
      const file = files.item(i)
      if (!file) continue
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
      const seq = parseInt(parts[parts.length - 1] || '', 10)
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
      const idMatch = (match[1] || '').match(/^id\s*:\s*(.+)$/m)
      if (idMatch) {
        existingFileId = (idMatch[1] || '').trim().replace(/^['"]|['"]$/g, '')
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
      const fmContent = match[1] || ''
      const body = match[2] || ''
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

// 公共：把浏览器选中的 Markdown 写入服务端配置的 Obsidian 卡片目录。
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
      if (activeView.value === 'graph') await refreshGraph()
    }
  } else {
    importResults.value = resultsPreview
    updateImportSummary(resultsPreview, options?.totalFiles ?? resultsPreview.length)
    importError.value = resultsPreview.length > 0 ? '' : (options?.emptyMessage ?? '没有找到需要导入的 .md 文件')
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeExternalUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed
  return null
}

function renderExternalLink(url: string, label?: string): string {
  const normalized = normalizeExternalUrl(url)
  const safeLabel = escapeHtml(label?.trim() || url)
  if (!normalized) return safeLabel
  const safeUrl = escapeHtml(normalized)
  return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`
}

function renderKnowledgeImage(rawPath: string, alt = ''): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''
  const isRemote = /^(https?:)?\/\//i.test(trimmed) || /^data:/i.test(trimmed)
  const src = isRemote ? trimmed : `/api/knowledge/asset?file=${encodeURIComponent(trimmed)}`
  return `<img class="kc-md-image" src="${escapeHtml(src)}" alt="${escapeHtml(alt || trimmed)}" loading="lazy" />`
}

function linkifyPlainUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s<]+/gi, (matched) => {
    const trailing = matched.match(/[),.;!?，。；！？、】【》」』）]+$/)?.[0] || ''
    const rawUrl = trailing ? matched.slice(0, -trailing.length) : matched
    return `${renderExternalLink(rawUrl)}${escapeHtml(trailing)}`
  })
}

function renderInlineMarkdown(text: string): string {
  const tokens: string[] = []
  const stash = (html: string) => {
    const token = `@@KC_TOKEN_${tokens.length}@@`
    tokens.push(html)
    return token
  }

  let rendered = text

  rendered = rendered.replace(/`([^`]+)`/g, (_m, code) => {
    return stash(`<code>${escapeHtml(code)}</code>`)
  })

  rendered = rendered.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    return stash(renderExternalLink(url, label))
  })

  rendered = escapeHtml(rendered)
  rendered = rendered.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  rendered = linkifyPlainUrls(rendered)

  return rendered.replace(/@@KC_TOKEN_(\d+)@@/g, (_m, index) => tokens[Number(index)] || '')
}

function parseMarkdownTables(htmlText: string): string {
  const lines = htmlText.split('\n')
  const result: string[] = []
  let inTable = false
  let tableHeaders: string[] = []
  let tableAlignments: ('left' | 'center' | 'right' | '')[] = []
  let tableRows: string[][] = []

  const parseRow = (line: string) => {
    const trimmed = line.trim()
    const content = trimmed.replace(/^\|/, '').replace(/\|$/, '')
    return content.split('|').map(cell => cell.trim())
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || ''
    const trimmed = line.trim()

    const isTableRow = trimmed.startsWith('|') && trimmed.endsWith('|')

    if (isTableRow) {
      if (!inTable) {
        const nextLine = lines[i + 1] ? lines[i + 1]!.trim() : ''
        const isNextAlignRow = nextLine.startsWith('|') && nextLine.endsWith('|') && nextLine.replace(/[|:\s-]/g, '') === ''

        if (isNextAlignRow) {
          inTable = true
          tableHeaders = parseRow(line)
          const alignCells = parseRow(nextLine)
          tableAlignments = alignCells.map(cell => {
            const hasLeft = cell.startsWith(':')
            const hasRight = cell.endsWith(':')
            if (hasLeft && hasRight) return 'center'
            if (hasRight) return 'right'
            if (hasLeft) return 'left'
            return ''
          })
          tableRows = []
          i++
          continue
        }
      } else {
        tableRows.push(parseRow(line))
        continue
      }
    }

    if (inTable && !isTableRow) {
      result.push(renderHtmlTable(tableHeaders, tableAlignments, tableRows))
      inTable = false
    }

    if (!inTable) {
      result.push(line)
    }
  }

  if (inTable) {
    result.push(renderHtmlTable(tableHeaders, tableAlignments, tableRows))
  }

  return result.join('\n')
}

function renderHtmlTable(headers: string[], alignments: string[], rows: string[][]): string {
  let html = '<div class="kc-table-wrapper"><table>'

  html += '<thead><tr>'
  headers.forEach((h, idx) => {
    const align = alignments[idx] ? ` style="text-align: ${alignments[idx]}"` : ''
    html += `<th${align}>${renderInlineMarkdown(h)}</th>`
  })
  html += '</tr></thead>'

  html += '<tbody>'
  rows.forEach(row => {
    html += '<tr>'
    for (let idx = 0; idx < headers.length; idx++) {
      const cell = row[idx] || ''
      const align = alignments[idx] ? ` style="text-align: ${alignments[idx]}"` : ''
      html += `<td${align}>${renderInlineMarkdown(cell)}</td>`
    }
    html += '</tr>'
  })
  html += '</tbody></table></div>'
  return html
}

// Simple Markdown -> HTML
function markdownToHtml(md: string): string {
  if (!md) return ''
  const codeBlocks: string[] = []
  let html = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const l = (lang || 'text').trim().toLowerCase()
    if (l === 'mermaid') {
      const token = `@@KC_BLOCK_${codeBlocks.length}@@`
      codeBlocks.push(`<div class="kc-mermaid-container" onclick="window.zoomMermaid(this)"><div class="kc-mermaid-zoom-badge">🔍 点击全屏放大图表</div><pre class="mermaid">${escapeHtml(code.trim())}</pre></div>`)
      return token
    }
    const escaped = escapeHtml(code.trim())
    const token = `@@KC_BLOCK_${codeBlocks.length}@@`
    codeBlocks.push(`<pre><code class="language-${escapeHtml(l)}">${escaped}</code></pre>`)
    return token
  })

  // 解析并生成超高精表格
  html = parseMarkdownTables(html)

  html = html.replace(/!\[\[([^\]]+)\]\]/g, (_m, path) => renderKnowledgeImage(path))
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, path) => renderKnowledgeImage(path, alt))
  html = html.replace(/^### (.+)$/gm, (_m, title) => `<h4>${renderInlineMarkdown(title)}</h4>`)
  html = html.replace(/^## (.+)$/gm, (_m, title) => `<h3>${renderInlineMarkdown(title)}</h3>`)
  html = html.replace(/^# (.+)$/gm, (_m, title) => `<h2>${renderInlineMarkdown(title)}</h2>`)
  html = html.replace(/^>\s*(.+)$/gm, (_m, content) => `<blockquote>${renderInlineMarkdown(content)}</blockquote>`)
  html = html.replace(/^- (.+)$/gm, (_m, content) => `<li>${renderInlineMarkdown(content)}</li>`)

  const lines = html.split('\n')
  const result: string[] = []
  for (const line of lines) {
    const stripped = line.trim()
    if (!stripped) {
      result.push(line)
      continue
    }
    if (stripped.startsWith('<') || stripped.startsWith('@@KC_BLOCK_')) {
      result.push(line)
      continue
    }
    result.push(`<p>${renderInlineMarkdown(stripped)}</p>`)
  }

  html = result.join('\n')
  html = html.replace(/@@KC_BLOCK_(\d+)@@/g, (_m, index) => codeBlocks[Number(index)] || '')
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

// 强制触发 chokidar 文件系统监听器刷新 - 知识分类导航入口已就绪
onMounted(() => {
  refreshCards()
  void refreshDefaultImportDirectoryState()
  document.addEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
/* Mermaid 流程图样式 */
.kc-mermaid-container {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 24px 16px;
  margin: 18px 0;
  display: flex;
  justify-content: center;
  overflow-x: auto;
  min-height: 80px;
}

.kc-mermaid-container .mermaid {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  color: var(--text-primary);
  text-align: center;
  background: transparent !important;
}

.kc-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.kc-sync-strip {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 34px;
  padding: 0 20px;
  border-bottom: 1px solid var(--divider);
  color: var(--text-tertiary);
  font-size: 12px;
  background: rgba(255,255,255,0.025);
}

.kc-sync-path {
  max-width: 520px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}

.kc-view-switch {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--control-stroke);
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.04);
}

.kc-view-btn {
  min-width: 46px;
  padding: 4px 10px;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  color: var(--text-tertiary);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.kc-view-btn.active {
  color: var(--accent-default);
  background: rgba(96, 205, 255, 0.16);
}

.kc-network-view {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.kc-network-sidebar {
  width: 280px;
  flex-shrink: 0;
  padding: 16px;
  overflow-y: auto;
  background: var(--bg-nav);
  border-right: 1px solid var(--divider);
}

.kc-graph-type-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: rgba(255,255,255,0.04);
  cursor: pointer;
  text-align: left;
}

.kc-graph-type-btn.active {
  color: var(--text-primary);
  border-color: rgba(96, 205, 255, 0.35);
  background: rgba(96, 205, 255, 0.1);
}

.kc-graph-expand-actions {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}

.kc-graph-expand-actions .fluent-btn {
  min-width: 0;
  padding: 6px 8px;
  font-size: 12px;
}

.kc-graph-type-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.kc-network-canvas {
  position: relative;
  flex: 1;
  overflow: hidden;
  cursor: grab;
  background:
    linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
    #181818;
  background-size: 28px 28px;
}

.kc-network-canvas.dragging {
  cursor: grabbing;
}

.kc-network-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.kc-network-loading {
  position: absolute;
  left: 24px;
  top: 24px;
  z-index: 1;
  color: var(--text-secondary);
  font-size: 14px;
}

.kc-graph-edge {
  stroke: rgba(180, 200, 220, 0.26);
  stroke-width: 1.3;
}

.kc-graph-edge.missing {
  stroke: rgba(240, 173, 78, 0.45);
  stroke-dasharray: 6 5;
}

.kc-graph-node {
  cursor: pointer;
}

.kc-graph-node circle {
  stroke: rgba(255,255,255,0.82);
  stroke-width: 1.4;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.35));
}

.kc-graph-node:hover circle {
  stroke: #fff;
  stroke-width: 2.2;
}

.kc-graph-node-title {
  fill: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  paint-order: stroke;
  stroke: #181818;
  stroke-width: 4px;
  stroke-linejoin: round;
}

.kc-graph-node-meta {
  fill: var(--text-tertiary);
  font-size: 10px;
  cursor: pointer;
  paint-order: stroke;
  stroke: #181818;
  stroke-width: 3px;
  stroke-linejoin: round;
}

.kc-graph-node-expander {
  fill: #111;
  font-size: 13px;
  font-weight: 800;
  pointer-events: all;
  user-select: none;
}

/* Sidebar */
.kc-sidebar {
  width: 330px;
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
  padding: 5px 9px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.35;
  background: rgba(255,255,255,0.05);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  white-space: normal;
  overflow-wrap: anywhere;
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
  max-width: 1600px;
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
  max-width: 1600px;
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
.kc-modal-body :deep(a) {
  color: var(--accent-default);
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
}
.kc-modal-body :deep(a:hover) {
  color: #8bddff;
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
.kc-modal-body :deep(.kc-md-image) {
  display: block;
  max-width: 100%;
  max-height: 520px;
  object-fit: contain;
  margin: 12px 0;
  border: 1px solid var(--control-stroke);
  border-radius: var(--radius-sm);
  background: rgba(255,255,255,0.03);
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

/* ==================== Markdown 高端表格与图表动效 ==================== */

/* Fluent-like Markdown Table Styles */
.kc-modal-body :deep(.kc-table-wrapper) {
  width: 100%;
  overflow-x: auto;
  margin: 20px 0;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-card);
  background: rgba(20, 20, 20, 0.4);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(8px);
}
.kc-modal-body :deep(.kc-table-wrapper table) {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13.5px;
  line-height: 1.6;
}
.kc-modal-body :deep(.kc-table-wrapper th) {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  font-weight: 600;
  padding: 12px 16px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.08);
  white-space: nowrap;
}
.kc-modal-body :deep(.kc-table-wrapper td) {
  padding: 12px 16px;
  color: var(--text-secondary);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.kc-modal-body :deep(.kc-table-wrapper tr:last-child td) {
  border-bottom: none;
}
.kc-modal-body :deep(.kc-table-wrapper tr:hover td) {
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-primary);
}

/* Mermaid Zoom & Pan Lightbox */
.kc-mermaid-lightbox {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(8, 8, 8, 0.9);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}
.kc-mermaid-lightbox-content {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}
.kc-mermaid-lightbox-close {
  position: absolute;
  top: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--text-secondary);
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 10002;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
.kc-mermaid-lightbox-close:hover {
  background: rgba(255, 99, 132, 0.15);
  color: var(--danger);
  transform: rotate(90deg);
}
.kc-mermaid-lightbox-body {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: grab;
  padding: 60px;
}
.kc-mermaid-lightbox-body:active {
  cursor: grabbing;
}
.kc-mermaid-lightbox-body svg {
  max-width: 90vw;
  max-height: 85vh;
  transition: transform 0.05s ease-out;
  transform-origin: center center;
}
.kc-mermaid-lightbox-hint {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 8px 20px;
  color: var(--text-secondary);
  font-size: 13px;
  pointer-events: none;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  z-index: 10001;
  letter-spacing: 0.5px;
}

/* Card inner Mermaid interactive hint */
.kc-modal-body :deep(.mermaid) {
  position: relative;
  background: rgba(255, 255, 255, 0.015);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 20px;
  margin: 16px 0;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s;
}
.kc-modal-body :deep(.mermaid):hover {
  background: rgba(255, 255, 255, 0.03);
  border-color: var(--accent-default);
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
}
.kc-modal-body :deep(.mermaid)::after {
  content: '🔍 点击全屏放大图表 (支持缩放平移)';
  position: absolute;
  bottom: 12px;
  right: 12px;
  font-size: 11px;
  color: var(--accent-default);
  background: rgba(96, 205, 255, 0.12);
  padding: 4px 10px;
  border-radius: 12px;
  opacity: 0.3;
  transition: opacity 0.3s;
  pointer-events: none;
  font-weight: 500;
}
.kc-modal-body :deep(.mermaid):hover::after {
  opacity: 1;
}

/* ==================== 知识分类导航样式 ==================== */
.kc-knowledge-view {
  display: grid;
  grid-template-columns: 330px minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #141414;
}

.kc-knowledge-categories {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  border-right: 1px solid var(--divider);
  background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01));
}

.kc-knowledge-overview {
  display: grid;
  gap: 5px;
  padding: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius-md);
  background: rgba(0,0,0,0.18);
}

.kc-knowledge-overview strong {
  color: var(--text-primary);
  font-size: 30px;
  line-height: 1;
}

.kc-knowledge-overview span:last-child {
  color: var(--text-tertiary);
  font-size: 12px;
}

.kc-knowledge-overline {
  color: var(--category-accent, var(--accent-default));
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.kc-knowledge-category {
  --category-accent: var(--accent-default);
  width: 100%;
  text-align: left;
  color: var(--text-secondary);
  border: 1px solid rgba(255,255,255,0.07);
  border-left: 3px solid transparent;
  border-radius: var(--radius-md);
  padding: 14px;
  background: rgba(255,255,255,0.025);
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, transform 0.18s;
}

.kc-knowledge-category:hover,
.kc-knowledge-category.active {
  border-color: rgba(255,255,255,0.09);
  border-left-color: var(--category-accent);
  background: rgba(255,255,255,0.05);
  transform: translateY(-1px);
}

.kc-knowledge-category-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.kc-knowledge-category-title {
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 800;
}

.kc-knowledge-category-count {
  min-width: 32px;
  padding: 3px 8px;
  border-radius: 999px;
  color: #111;
  background: var(--category-accent);
  text-align: center;
  font-size: 12px;
  font-weight: 800;
}

.kc-knowledge-category p {
  margin: 8px 0 10px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.kc-knowledge-category-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-tertiary);
  font-size: 11px;
}

.kc-knowledge-main {
  display: grid;
  grid-template-columns: minmax(420px, 0.95fr) minmax(360px, 1.05fr);
  gap: 18px;
  min-height: 0;
  overflow: hidden;
  padding: 20px;
}

.kc-knowledge-category-panel,
.kc-subcategory-detail {
  min-height: 0;
  overflow-y: auto;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: var(--radius-lg);
  background: rgba(255,255,255,0.025);
}

.kc-knowledge-category-panel {
  --category-accent: var(--accent-default);
  padding: 20px;
}

.kc-knowledge-panel-header,
.kc-subcategory-detail-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.kc-knowledge-panel-header h2,
.kc-subcategory-detail-header h3 {
  margin: 4px 0 6px;
  color: var(--text-primary);
  font-size: 24px;
  line-height: 1.15;
}

.kc-subcategory-detail-header h3 {
  font-size: 22px;
}

.kc-knowledge-panel-header p,
.kc-subcategory-detail-header p {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 13px;
  line-height: 1.55;
}

.kc-knowledge-panel-count {
  min-width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  align-content: center;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
}

.kc-knowledge-panel-count strong {
  color: var(--text-primary);
  font-size: 26px;
  line-height: 1;
}

.kc-knowledge-panel-count span {
  color: var(--text-tertiary);
  font-size: 11px;
  text-transform: uppercase;
}

.kc-subcategory-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
  padding-top: 16px;
}

.kc-subcategory-card {
  position: relative;
  min-height: 170px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
  text-align: left;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius-md);
  padding: 14px;
  background: rgba(18,18,18,0.58);
  color: var(--text-secondary);
  cursor: pointer;
  transition: transform 0.18s, border-color 0.18s, background 0.18s;
}

.kc-subcategory-card:hover,
.kc-subcategory-card.active {
  transform: translateY(-2px);
  border-color: var(--category-accent, var(--accent-default));
  background: rgba(28,28,28,0.78);
}

.kc-subcategory-card-top,
.kc-subcategory-result-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 700;
}

.kc-subcategory-card-top strong {
  color: #111;
  background: var(--category-accent, var(--accent-default));
  border-radius: 999px;
  min-width: 28px;
  padding: 2px 7px;
  text-align: center;
}

.kc-subcategory-card h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  line-height: 1.25;
}

.kc-subcategory-card p {
  margin: 0;
  flex: 1;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.kc-subcategory-signals,
.kc-subcategory-result-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.kc-subcategory-signals span,
.kc-subcategory-result-tags span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 5px;
  padding: 2px 7px;
  background: rgba(255,255,255,0.06);
  color: var(--text-tertiary);
  font-size: 10px;
}

.kc-subcategory-card:hover .kc-arch-card-glow {
  opacity: 1;
}

.kc-subcategory-card > *:not(.kc-arch-card-glow) {
  position: relative;
  z-index: 1;
}

.kc-subcategory-detail {
  padding: 18px;
}

.kc-subcategory-detail.empty {
  display: grid;
  place-items: center;
}

.kc-subcategory-detail-actions {
  width: min(320px, 42%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.kc-subcategory-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 16px;
}

.kc-subcategory-result {
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: var(--radius-md);
  padding: 14px;
  background: rgba(255,255,255,0.025);
  cursor: pointer;
  transition: border-color 0.18s, background 0.18s, transform 0.18s;
}

.kc-subcategory-result:hover {
  transform: translateY(-1px);
  border-color: rgba(96,205,255,0.25);
  background: rgba(255,255,255,0.045);
}

.kc-subcategory-result h4 {
  margin: 8px 0 5px;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.35;
}

.kc-subcategory-result p {
  margin: 0 0 10px;
  color: var(--text-tertiary);
  font-size: 12px;
  line-height: 1.55;
}

.kc-subcategory-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 220px;
  text-align: center;
  color: var(--text-tertiary);
}

.kc-subcategory-empty.large {
  min-height: 360px;
}

.kc-subcategory-empty strong {
  color: var(--text-primary);
  font-size: 18px;
}

.kc-subcategory-empty span {
  max-width: 360px;
  font-size: 13px;
  line-height: 1.6;
}

@media (max-width: 1180px) {
  .kc-knowledge-view {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .kc-knowledge-main {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .kc-knowledge-category-panel,
  .kc-subcategory-detail {
    overflow: visible;
  }
}

@media (max-width: 760px) {
  .kc-knowledge-view {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .kc-knowledge-categories {
    border-right: 0;
    border-bottom: 1px solid var(--divider);
    overflow: visible;
  }

  .kc-knowledge-main {
    display: flex;
    flex-direction: column;
    padding: 14px;
  }

  .kc-knowledge-panel-header,
  .kc-subcategory-detail-header {
    flex-direction: column;
  }

  .kc-subcategory-detail-actions {
    width: 100%;
  }
}
</style>
