<template>
  <div class="page active" style="display: flex; flex-direction: column;">
    <div class="standard-page-header">
      <h1 class="header-title">Claude 配置</h1>
    </div>

    <div class="page-content-scroll">
      <div class="fluent-setting-group">
        <div class="setting-header">当前激活状态</div>
        <div class="fluent-card padding-md setting-card">
          <div class="setting-info" v-if="currentConfig">
            <div style="color: var(--success); font-weight: 600; font-size: 15px;">⭐ 当前激活: {{ currentConfig.name }}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 6px;">{{ currentConfig.config.baseApi }}</div>
          </div>
          <div class="setting-info" v-else>
            <span style="color: var(--text-tertiary);">未激活任何配置</span>
          </div>
        </div>
      </div>

      <div class="fluent-setting-group">
        <div class="setting-header">{{ isEditing ? '编辑配置' : '添加新配置' }}</div>
        <div class="fluent-card padding-lg">
          <div class="form-grid">
            <input type="text" class="fluent-input" v-model="form.name" placeholder="配置名称 (e.g. Production)">
            <input type="text" class="fluent-input" v-model="form.baseApi" placeholder="API URL">
            <input :type="showToken ? 'text' : 'password'" class="fluent-input span-2" v-model="form.authToken" placeholder="sk-...">
          </div>
          <div class="form-actions right" style="margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px;">
            <button v-if="isEditing" class="fluent-btn sub" @click="cancelEdit">取消</button>
            <button class="fluent-btn primary" @click="saveConfig">
              {{ isEditing ? '保存修改' : '+ 添加' }}
            </button>
          </div>
        </div>
      </div>

      <div class="fluent-setting-group">
        <div class="setting-header" style="display: flex; justify-content: space-between; align-items: center;">
          <span>已保存配置</span>
          <button class="fluent-btn sub" @click="loadConfigs" style="height: 24px; padding: 0 8px; font-size: 12px;">刷新列表</button>
        </div>
        <div class="fluent-card no-padding">
          <div class="config-list-container">
            <div v-if="configs.length === 0" style="text-align: center; color: var(--text-tertiary); padding: 24px;">暂无配置，请添加</div>
            <div v-for="c in configs" :key="c.name" class="config-item" :class="{ current: c.isCurrent }">
              <div class="config-info">
                <span class="name">{{ c.isCurrent ? '⭐ ' : '' }}{{ c.name }}</span>
                <span class="api">{{ c.config.baseApi }}</span>
                <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                  <span style="font-family: monospace;">
                    {{ revealedTokens[c.name] ? c.config.authToken : '••••••••••••••••••••••••••••' }}
                  </span>
                  <svg @click="toggleToken(c.name)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="cursor: pointer;" :style="{ opacity: revealedTokens[c.name] ? 1 : 0.7, stroke: revealedTokens[c.name] ? 'var(--accent-default)' : 'currentColor'}">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </div>
              </div>
              <div class="config-actions">
                <button class="fluent-btn sub" @click="editConfig(c)">编辑</button>
                <button v-if="!c.isCurrent" class="fluent-btn primary" @click="switchConfig(c.name)">启用</button>
                <button v-else class="fluent-btn" style="border-color: var(--success); color: var(--success);" @click="switchConfig(c.name)">重新启用</button>
                <button class="fluent-btn danger" @click="deleteConfig(c.name)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const configs = ref([])
const form = ref({
  name: '',
  baseApi: 'https://api.anthropic.com',
  authToken: ''
})
const isEditing = ref(false)
const showToken = ref(false)
const revealedTokens = ref({})

const currentConfig = computed(() => {
  return configs.value.find(c => c.isCurrent)
})

const loadConfigs = async () => {
  try {
    const data = await $fetch('/api/claude/configs')
    configs.value = data || []
  } catch (error) {
    console.error('Failed to load configs:', error)
  }
}

const saveConfig = async () => {
  if (!form.value.name || !form.value.baseApi || !form.value.authToken) {
    alert('请填写完整')
    return
  }
  try {
    await $fetch('/api/claude/configs', {
      method: 'POST',
      body: { 
        name: form.value.name, 
        config: { 
          baseApi: form.value.baseApi, 
          authToken: form.value.authToken 
        } 
      }
    })
    alert('✓ 保存成功')
    form.value.name = ''
    form.value.authToken = ''
    form.value.baseApi = 'https://api.anthropic.com'
    isEditing.value = false
    loadConfigs()
  } catch (e) {
    alert('保存失败: ' + e.message)
  }
}

const toggleToken = (name) => {
  revealedTokens.value[name] = !revealedTokens.value[name]
}

const editConfig = (config) => {
  form.value.name = config.name
  form.value.baseApi = config.config.baseApi
  form.value.authToken = config.config.authToken || ''
  isEditing.value = true
}

const cancelEdit = () => {
  form.value.name = ''
  form.value.authToken = ''
  form.value.baseApi = 'https://api.anthropic.com'
  isEditing.value = false
}

const switchConfig = async (name) => {
  try {
    const result = await $fetch('/api/claude/switch/' + name, { method: 'POST' })
    alert(result.message || '已切换')
    loadConfigs()
  } catch (e) {
    alert('切换失败: ' + e.message)
  }
}

const deleteConfig = async (name) => {
  if (!confirm('确定删除 "' + name + '"?')) return;
  try {
    await $fetch('/api/claude/configs/' + name, { method: 'DELETE' })
    alert('✓ 已删除: ' + name)
    loadConfigs()
  } catch (e) {
    alert('删除失败: ' + e.message)
  }
}

onMounted(() => {
  loadConfigs()
})
</script>
