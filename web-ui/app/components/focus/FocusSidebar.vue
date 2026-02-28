<template>
  <aside class="focus-sidebar">
    <div class="focus-sidebar__header">
      <div class="focus-sidebar__logo">🍅</div>
      <div class="focus-sidebar__title">专注清单</div>
    </div>

    <nav class="focus-sidebar__nav">
      <!-- Smart Views -->
      <div class="focus-sidebar__section-label">智能视图</div>
      <div
        v-for="view in store.SMART_VIEWS"
        :key="view.key"
        class="focus-sidebar__item"
        :class="{
          active: store.currentView.value === view.key,
          'drop-hover': dropTarget === view.key
        }"
        @click="store.currentView.value = view.key"
        @dragover.prevent="onDragOver(view.key)"
        @dragleave="onDragLeave"
        @drop.prevent="onDrop(view.key)"
      >
        <span class="focus-sidebar__item-icon">{{ view.icon }}</span>
        <span>{{ view.label }}</span>
        <span
          v-if="(store.smartViewCounts.value as any)[view.key] > 0"
          class="focus-sidebar__item-count"
        >{{ (store.smartViewCounts.value as any)[view.key] }}</span>
      </div>

      <!-- Custom Lists -->
      <div class="focus-sidebar__section-label" style="margin-top:8px;">我的清单</div>

      <!-- Folders and lists -->
      <template v-for="folder in store.folders.value" :key="folder.id">
        <div
          class="focus-sidebar__item"
          style="font-weight:600; font-size:12px;"
          @click="folder.collapsed = !folder.collapsed"
        >
          <span class="focus-sidebar__item-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" :style="{ transform: folder.collapsed ? 'rotate(-90deg)' : '' , transition: '0.15s' }">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </span>
          <span>{{ folder.name }}</span>
        </div>
        <template v-if="!folder.collapsed">
          <div
            v-for="list in listsInFolder(folder.id)"
            :key="list.id"
            class="focus-sidebar__item"
            :class="{
              active: store.currentView.value === list.id,
              'drop-hover': dropTarget === list.id
            }"
            style="padding-left:36px;"
            @click="store.currentView.value = list.id"
            @dragover.prevent="onDragOver(list.id)"
            @dragleave="onDragLeave"
            @drop.prevent="onDrop(list.id)"
          >
            <span class="focus-sidebar__list-dot" :style="{ background: list.color }"></span>
            <span>{{ list.name }}</span>
            <span v-if="store.listTaskCounts.value[list.id]" class="focus-sidebar__item-count">
              {{ store.listTaskCounts.value[list.id] }}
            </span>
          </div>
        </template>
      </template>

      <!-- Lists without folder -->
      <div
        v-for="list in topLevelLists"
        :key="list.id"
        class="focus-sidebar__item"
        :class="{
          active: store.currentView.value === list.id,
          'drop-hover': dropTarget === list.id
        }"
        @click="store.currentView.value = list.id"
        @dragover.prevent="onDragOver(list.id)"
        @dragleave="onDragLeave"
        @drop.prevent="onDrop(list.id)"
      >
        <span class="focus-sidebar__list-dot" :style="{ background: list.color }"></span>
        <span>{{ list.name }}</span>
        <span v-if="store.listTaskCounts.value[list.id]" class="focus-sidebar__item-count">
          {{ store.listTaskCounts.value[list.id] }}
        </span>
      </div>
    </nav>

    <div class="focus-sidebar__footer">
      <button class="focus-sidebar__create-btn" @click="$emit('openCreateList')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        创建清单
      </button>
      <div style="display:flex; gap:4px; margin-top:8px;">
        <button class="focus-sidebar__create-btn" style="flex:1;" @click="$emit('openSettings')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          设置
        </button>
        <button class="focus-sidebar__create-btn" style="flex:1;" @click="$emit('openStats')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          报表
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, inject, type Ref } from 'vue'
import { useFocusStore } from '~/composables/useFocusStore'

const emit = defineEmits(['openSettings', 'openStats', 'openCreateList'])
const store = useFocusStore()

const topLevelLists = computed(() =>
  store.lists.value.filter(l => !l.folderId).sort((a, b) => a.order - b.order)
)

function listsInFolder(folderId: string) {
  return store.lists.value.filter(l => l.folderId === folderId).sort((a, b) => a.order - b.order)
}

// --- Drag & Drop ---
const handleTaskDrop = inject<(targetKey: string) => void>('handleTaskDrop')
const dropTarget = ref<string | null>(null)

function onDragOver(key: string) {
  dropTarget.value = key
}

function onDragLeave() {
  dropTarget.value = null
}

function onDrop(key: string) {
  dropTarget.value = null
  handleTaskDrop?.(key)
}
</script>
