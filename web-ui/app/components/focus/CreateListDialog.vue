<template>
  <div class="focus-dialog-overlay" @click.self="$emit('close')">
    <div class="focus-dialog" style="max-width:420px;">
      <div class="focus-dialog__header">
        <div class="focus-dialog__title">创建清单</div>
        <button class="focus-dialog__close" @click="$emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="focus-dialog__body">
        <div class="focus-detail__field">
          <div class="focus-detail__label">清单名称</div>
          <input
            ref="nameInput"
            class="focus-detail__input"
            v-model="listName"
            placeholder="输入清单名称"
            @keydown.enter="create"
            autofocus
          />
        </div>

        <div class="focus-detail__field">
          <div class="focus-detail__label">选择颜色</div>
          <div class="focus-color-picker">
            <div
              v-for="color in store.LIST_COLORS"
              :key="color"
              class="focus-color-picker__swatch"
              :class="{ selected: selectedColor === color }"
              :style="{ background: color }"
              @click="selectedColor = color"
            ></div>
          </div>
        </div>
      </div>
      <div class="focus-dialog__footer">
        <button class="focus-btn focus-btn--secondary" @click="$emit('close')">取消</button>
        <button class="focus-btn focus-btn--primary" @click="create" :disabled="!listName.trim()">创建</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useFocusStore } from '~/composables/useFocusStore'

const emit = defineEmits(['close'])
const store = useFocusStore()

const listName = ref('')
const selectedColor = ref(store.LIST_COLORS[5]) // default blue
const nameInput = ref<HTMLInputElement | null>(null)

onMounted(() => { nameInput.value?.focus() })

function create() {
  const name = listName.value.trim()
  if (!name) return
  const list = store.addList(name, selectedColor.value)
  store.currentView.value = list.id
  emit('close')
}
</script>
