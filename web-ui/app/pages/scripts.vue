<template>
  <div class="page active" style="display: flex;">
    <div class="standard-page-header">
      <h1 class="header-title">脚本运行器</h1>
      <div class="header-controls">
        <button class="fluent-btn-icon" @click="loadScripts" title="刷新">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
      </div>
    </div>

    <div class="page-content-scroll">
      <div class="page-grid">
        <section class="fluent-card script-list-panel" style="display: flex; flex-direction: column; height: 100%;">
          <div class="card-header script-list-header">
            <span>{{ activeMode === 'script' ? '可用脚本' : '最近命令' }}</span>
            <div class="mode-segment">
              <button :class="{ active: activeMode === 'script' }" @click="switchMode('script')">脚本</button>
              <button :class="{ active: activeMode === 'console' }" @click="switchMode('console')">Console</button>
            </div>
          </div>
          <div v-if="activeMode === 'script'" class="script-items">
            <div v-if="scripts.length === 0" style="color: var(--text-secondary); padding: 16px; text-align: center;">暂无脚本</div>
            <div 
              v-else 
              v-for="s in scripts" 
              :key="s.path"
              class="list-item" 
              :class="{ active: selectedScript && selectedScript.path === s.path }"
              :title="`右键打开所在文件夹：${s.path}`"
              @click="selectScript(s)"
              @contextmenu.prevent.stop="openLocalPathFolder(s.path)"
            >
              <span>{{ s.icon }}</span>
              <span>{{ s.name }}</span>
            </div>
          </div>
          <div v-else class="script-items console-history-list">
            <div v-if="consoleHistoryGroups.length === 0" class="empty-hint">暂无命令历史</div>
            <template v-else>
              <section v-for="group in consoleHistoryGroups" :key="group.key" class="console-history-group">
                <div class="console-history-group-title">
                  <span>{{ group.label }}</span>
                  <span>{{ group.items.length }}</span>
                </div>
                <div
                  v-for="item in group.items"
                  :key="item.id"
                  class="console-history-item"
                  :class="{
                    active: isConsoleHistoryItemActive(item),
                    editing: editingConsoleHistoryId === item.id,
                    dragging: draggedConsoleHistoryId === item.id,
                    'drop-before': dragOverConsoleHistoryId === item.id && dragOverConsoleHistoryPosition === 'before',
                    'drop-after': dragOverConsoleHistoryId === item.id && dragOverConsoleHistoryPosition === 'after',
                  }"
                  :draggable="editingConsoleHistoryId !== item.id"
                  @dragstart.stop="startConsoleHistoryDrag($event, item)"
                  @dragover.prevent="handleConsoleHistoryDragOver($event, item)"
                  @drop.prevent="dropConsoleHistoryItem(item)"
                  @dragenter.prevent
                  @dragend="finishConsoleHistoryDrag"
                >
                  <button
                    class="history-drag-handle"
                    type="button"
                    title="拖动调整命令位置"
                    @click.stop
                  >
                    <span></span>
                    <span></span>
                    <span></span>
                  </button>
                  <button class="history-select-btn" type="button" @click="selectConsoleHistory(item)">
                    <span class="history-command">{{ item.command }}</span>
                    <span class="history-meta">{{ item.packageName || 'com.tencent.tmgp.pubgmhd' }}{{ item.deviceSerial ? ` · ${item.deviceSerial}` : '' }}</span>
                    <span v-if="item.tags?.length" class="history-tags">
                      <span v-for="tag in item.tags" :key="tag" class="history-tag">{{ tag }}</span>
                    </span>
                  </button>
                  <div class="history-actions">
                    <button
                      class="history-tag-edit-btn"
                      type="button"
                      title="编辑备注标签"
                      @click.stop="startEditConsoleHistoryTags(item)"
                    >
                      标签
                    </button>
                    <button
                      class="history-delete-btn"
                      type="button"
                      title="删除这条收录"
                      @click.stop="deleteConsoleHistoryItem(item)"
                    >
                      删除
                    </button>
                  </div>
                  <div v-if="editingConsoleHistoryId === item.id" class="history-tag-editor" @click.stop>
                    <input
                      v-model="editingConsoleHistoryTags"
                      class="fluent-input history-tag-input"
                      placeholder="备注标签，用空格或逗号分隔"
                      @keydown.enter.prevent="saveConsoleHistoryTags(item)"
                      @keydown.esc.prevent="cancelEditConsoleHistoryTags"
                    />
                    <button class="command-btn command-save compact" type="button" @click="saveConsoleHistoryTags(item)">保存</button>
                    <button class="command-btn command-ghost compact" type="button" @click="cancelEditConsoleHistoryTags">取消</button>
                  </div>
                </div>
              </section>
            </template>
          </div>
        </section>

        <section class="fluent-card terminal-panel" style="display: flex; flex-direction: column; height: 100%;">
          <div class="card-header script-runner-header">
            <div class="script-title-stack">
              <span class="script-title">{{ currentRunnerTitle }}</span>
              <span class="script-save-state" :class="{ dirty: isScriptDirty && activeMode === 'script' }">{{ currentRunnerStatusText }}</span>
            </div>
            <div class="script-command-bar">
              <button class="command-btn command-primary" @click="runCurrent" :disabled="!canRunCurrent" :title="activeMode === 'script' ? '运行脚本' : '运行 Console 命令'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                <span>运行</span>
              </button>
              <button class="command-btn command-danger" @click="stopScript" :disabled="!isRunning" title="停止脚本">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                </svg>
                <span>停止</span>
              </button>
              <span class="command-divider"></span>
              <button class="command-btn command-ghost" @click="copySelectedTerminalText" :disabled="logs.length === 0" title="复制终端选中文本">
                复制选中
              </button>
              <button class="command-btn command-ghost" @click="copyAllTerminalText" :disabled="logs.length === 0" title="复制全部终端日志">
                复制全部
              </button>
              <button class="command-btn command-ghost icon-text" @click="clearTerminal" title="清空终端">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
                <span>清空</span>
              </button>
            </div>
          </div>
          <div v-if="activeMode === 'script' && selectedScriptParams.length" class="script-param-panel">
            <div class="script-param-project-row">
              <label>参数项目</label>
              <input
                v-model="scriptParamProjectName"
                class="fluent-input script-param-project-input"
                list="script-param-projects"
                placeholder="例如 trunk / PUBGTrunk / 测试分支"
                :disabled="isRunning"
                @change="applyScriptParamProjectName"
                @blur="applyScriptParamProjectName"
              />
              <datalist id="script-param-projects">
                <option
                  v-for="project in selectedScriptParamProjects"
                  :key="project"
                  :value="project"
                />
              </datalist>
            </div>
            <div v-for="param in selectedScriptParams" :key="param.key" class="script-param-row">
              <label class="script-param-label">{{ param.label }}</label>
              <label v-if="param.type === 'switch'" class="script-param-switch">
                <input
                  v-model="scriptParamValues[param.key]"
                  type="checkbox"
                  :disabled="isRunning"
                />
                <span>{{ scriptParamValues[param.key] ? '启用' : '关闭' }}</span>
              </label>
              <input
                v-else
                v-model="scriptParamValues[param.key]"
                class="fluent-input script-param-input"
                :type="param.type === 'number' ? 'number' : 'text'"
                :placeholder="param.placeholder || ''"
                :disabled="isRunning"
              />
              <button
                v-if="param.type === 'folder'"
                class="fluent-btn sub"
                @click="pickScriptFolder(param.key)"
                :disabled="isRunning || isPickingScriptFolder"
              >
                {{ isPickingScriptFolder ? '打开中...' : '选择文件夹' }}
              </button>
              <span v-else class="script-param-spacer"></span>
            </div>
            <div class="script-param-hint">参数会按“脚本 + 参数项目”自动保存，切换项目名会读取该项目上次使用的值。</div>
          </div>
          <div v-if="activeMode === 'console'" class="console-panel">
            <div class="console-row">
              <label>包名</label>
              <input
                v-model="consolePackageName"
                class="fluent-input console-package-input"
                placeholder="Android package name"
                :disabled="isRunning"
              />
              <label>设备</label>
              <input
                v-model="consoleDeviceSerial"
                class="fluent-input console-device-input"
                placeholder="多设备时填写 adb serial"
                :disabled="isRunning"
              />
              <label class="console-checkbox">
                <input v-model="consoleRequireProcess" type="checkbox" :disabled="isRunning" />
                要求进程已启动
              </label>
            </div>
            <div class="console-tool-tabs" role="tablist" aria-label="Console 工具">
              <button
                class="console-tool-tab"
                :class="{ active: consoleToolTab === 'manual' }"
                type="button"
                role="tab"
                :aria-selected="consoleToolTab === 'manual'"
                @click="consoleToolTab = 'manual'"
              >
                手动命令
              </button>
              <button
                class="console-tool-tab"
                :class="{ active: consoleToolTab === 'map-points' }"
                type="button"
                role="tab"
                :aria-selected="consoleToolTab === 'map-points'"
                @click="consoleToolTab = 'map-points'"
              >
                地图点位
              </button>
            </div>
            <section v-if="consoleToolTab === 'manual'" class="console-manual-panel" aria-label="手动 Console 命令">
              <textarea
                ref="consoleTextareaEl"
                v-model="consoleCommand"
                class="console-command-input"
                spellcheck="false"
                placeholder="输入要发送到游戏的 UE console command。支持一行一条，或用分号分隔多条命令。"
                :disabled="isRunning"
                @input="updateConsoleCursor"
                @click="updateConsoleCursor"
                @keyup="updateConsoleCursor"
                @keydown="handleConsoleCommandKeydown"
              ></textarea>
            </section>
            <section v-if="consoleToolTab === 'map-points'" class="console-preset-page" aria-label="地图点位">
              <div class="console-preset-head">
                <div class="console-preset-title-group">
                  <span class="console-preset-title">地图点位</span>
                  <span class="console-preset-meta">{{ selectedConsoleMapPointPreset.label }} · {{ selectedConsoleMapPointPreset.meta }}</span>
                </div>
                <button class="command-btn command-ghost compact" type="button" @click="copyA5LowFrameAllCommands">
                  复制全部
                </button>
              </div>
              <div class="console-map-manager">
                <label>
                  <span>当前地图</span>
                  <select v-model="selectedConsoleMapPointPresetId" class="fluent-input console-map-select" @change="ensureSelectedMapPointPreset">
                    <option v-for="preset in consoleMapPointPresets" :key="preset.id" :value="preset.id">
                      {{ preset.label }}
                    </option>
                  </select>
                </label>
                <label>
                  <span>新地图名</span>
                  <input
                    v-model="mapPointNewMapName"
                    class="fluent-input console-map-name-input"
                    placeholder="例如 A6低帧点"
                    @keydown.enter.prevent="addConsoleMapPointPreset"
                  />
                </label>
                <button class="command-btn command-save compact" type="button" @click="addConsoleMapPointPreset">新增地图</button>
                <button
                  class="command-btn command-danger compact"
                  type="button"
                  :disabled="consoleMapPointPresets.length <= 1"
                  @click="deleteSelectedConsoleMapPointPreset"
                >
                  删除地图
                </button>
              </div>
              <details class="console-map-import-details">
                <summary>批量导入 / 更新点位</summary>
                <div class="console-map-importer">
                  <label>
                    <span>批量 Pointdata</span>
                    <textarea
                      v-model="mapPointImportText"
                      class="console-map-import-input"
                      rows="4"
                      placeholder="#1:低帧点&#10;# Pointdata = &quot;164727,91180,1905,0,6,5&quot;"
                    ></textarea>
                  </label>
                  <div class="console-map-import-actions">
                    <input
                      v-model="mapPointImportMapName"
                      class="fluent-input console-map-name-input"
                      placeholder="生成新地图时填写地图名"
                    />
                    <button class="command-btn command-save compact" type="button" @click="updateSelectedConsoleMapPointPresetFromText">更新当前地图</button>
                    <button class="command-btn command-primary compact" type="button" @click="createConsoleMapPointPresetFromText">生成新地图</button>
                    <span v-if="mapPointImportError" class="console-map-error">{{ mapPointImportError }}</span>
                  </div>
                </div>
              </details>
              <div class="a5-point-grid">
                <div v-if="!a5LowFramePoints.length" class="a5-point-empty">
                  当前地图还没有点位，展开“批量导入 / 更新点位”粘贴 Pointdata 后更新当前地图。
                </div>
                <article v-for="point in a5LowFramePoints" :key="point.tag" class="a5-point-card">
                  <button
                    class="a5-point-head"
                    type="button"
                    :class="{ active: selectedA5LowFramePoint.tag === point.tag }"
                    @click="selectA5LowFramePoint(point)"
                  >
                    <span class="a5-point-tag">{{ point.tag }}</span>
                    <span class="a5-point-label">{{ point.label }}</span>
                    <span class="a5-point-coords">{{ point.coords.join(', ') }}</span>
                  </button>
                </article>
              </div>
              <section v-if="selectedA5LowFramePoint" class="a5-selected-panel">
                <div class="a5-selected-title">
                  <span>{{ selectedA5LowFramePoint.tag }} {{ selectedA5LowFramePoint.label }}</span>
                  <span>{{ selectedA5LowFramePoint.coords.join(', ') }}</span>
                </div>
                <div class="a5-selected-command">
                  <label>传送命令</label>
                  <textarea
                    class="a5-command-input"
                    :value="selectedA5TeleportCommand"
                    readonly
                    rows="2"
                    @focus="$event.target.select()"
                  ></textarea>
                  <button
                    class="a5-command-run"
                    type="button"
                    :disabled="isRunning"
                    @click="runA5LowFrameSelectedCommand('teleport')"
                  >
                    发送传送
                  </button>
                </div>
                <div class="a5-selected-command">
                  <label>抓帧命令</label>
                  <textarea
                    class="a5-command-input"
                    :value="selectedA5CaptureFrameCommand"
                    readonly
                    rows="2"
                    @focus="$event.target.select()"
                  ></textarea>
                  <button
                    class="a5-command-run capture"
                    type="button"
                    :disabled="isRunning"
                    @click="runA5LowFrameSelectedCommand('capture')"
                  >
                    发送抓帧
                  </button>
                </div>
              </section>
            </section>
            <div class="console-tag-row">
              <label>备注标签</label>
              <input
                v-model="consoleHistoryTagInput"
                class="fluent-input console-tag-input"
                placeholder="例如：传送点 复现用 雨林"
                :disabled="isRunning"
                @keydown.enter.prevent="rememberConsoleCommand"
              />
              <span class="console-tag-hint">收录后会显示在左侧历史命令上</span>
            </div>
            <div v-if="consoleToolTab === 'manual' && consoleSuggestions.length" class="console-suggestion-popover">
              <button
                v-for="(suggestion, index) in consoleSuggestions"
                :key="suggestion.name"
                class="console-suggestion-item"
                :class="{ active: index === consoleSuggestionIndex }"
                type="button"
                @mousedown.prevent="acceptConsoleSuggestion(suggestion)"
              >
                <span class="suggestion-name">{{ suggestion.name }}</span>
                <span v-if="suggestion.description" class="suggestion-desc">{{ suggestion.description }}</span>
              </button>
            </div>
            <div class="console-sync-row">
              <span class="console-sync-state" :class="{ error: consoleCommandLoadError }">{{ consoleCommandStatusText }}</span>
              <button class="command-btn command-save compact" @click="rememberConsoleCommand" :disabled="!consoleCommand.trim()">
                {{ currentConsoleHistoryActionText }}
              </button>
              <input
                v-model="consoleCommandLocalPath"
                class="fluent-input console-local-path-input"
                placeholder="本地 CVarList.csv 路径"
                :disabled="isSyncingConsoleCommands || isLoadingLocalConsoleCommands"
              />
              <button class="command-btn command-ghost compact" @click="pickConsoleCommandCsv" :disabled="isSyncingConsoleCommands || isLoadingLocalConsoleCommands">
                选择 CSV
              </button>
              <button class="command-btn command-ghost compact" @click="loadConsoleCommands({ notify: true })" :disabled="isSyncingConsoleCommands || isLoadingLocalConsoleCommands">
                {{ isLoadingLocalConsoleCommands ? '读取中' : '读取路径' }}
              </button>
              <button class="command-btn command-save compact" @click="syncConsoleCommands" :disabled="isSyncingConsoleCommands || isLoadingLocalConsoleCommands">
                {{ isSyncingConsoleCommands ? '同步中' : '同步命令' }}
              </button>
            </div>
          </div>
          <div v-if="activeMode === 'script' && selectedScript" class="script-editor-panel">
            <div class="script-editor-head">
              <div class="script-editor-title-group">
                <span class="script-editor-title">脚本内容</span>
                <span class="script-editor-meta">{{ scriptEditorStatusText }}</span>
              </div>
              <div class="script-editor-actions">
                <button class="command-btn command-ghost compact" @click="reloadScriptContent" :disabled="isLoadingScriptContent || isSavingScriptContent || isRunning">
                  重载
                </button>
                <button class="command-btn command-save compact" @click="saveScriptContent" :disabled="!canSaveScriptContent">
                  保存脚本
                </button>
              </div>
            </div>
            <textarea
              v-model="scriptContent"
              class="script-editor"
              spellcheck="false"
              :placeholder="isLoadingScriptContent ? '正在加载脚本...' : '选择脚本后可在这里修改内容'"
              :disabled="isLoadingScriptContent || isSavingScriptContent || isRunning"
            ></textarea>
          </div>
          <div v-if="activeMode === 'script' && isCvarScriptSelected" class="cvar-viewer-panel">
            <div class="cvar-viewer-head">
              <div class="script-editor-title-group">
                <span class="script-editor-title">CVar 列表</span>
                <span class="script-editor-meta" :class="{ error: cvarLoadError }">{{ cvarStatusText }}</span>
              </div>
              <div class="cvar-viewer-actions">
                <input
                  v-model="cvarFilter"
                  class="fluent-input cvar-filter-input"
                  placeholder="按 Name / Value 搜索"
                />
                <button class="command-btn command-ghost compact" @click="loadCvars({ notify: true })" :disabled="isLoadingCvars">
                  {{ isLoadingCvars ? '读取中' : '刷新 CVar' }}
                </button>
                <button class="command-btn command-ghost compact" @click="openCvarSource" :disabled="!cvarSourcePath">
                  打开 CSV
                </button>
                <button class="command-btn command-ghost compact" @click="copyVisibleCvars" :disabled="filteredCvarRows.length === 0">
                  复制结果
                </button>
              </div>
            </div>
            <div v-if="visibleCvarRows.length" class="cvar-table-wrap">
              <table class="cvar-table">
                <thead>
                  <tr>
                    <th class="cvar-index-col">#</th>
                    <th>Name</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in visibleCvarRows" :key="`${row.index}-${row.name}`">
                    <td class="cvar-index-col">{{ row.index }}</td>
                    <td class="cvar-name">{{ row.name }}</td>
                    <td class="cvar-value">{{ row.value }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="cvar-empty">
              {{ cvarLoadError || '还没有可展示的 CVar 数据。运行 pull_cvar.bat 成功后会自动刷新。' }}
            </div>
          </div>
          <div class="terminal" ref="terminalEl">
            <div v-for="(log, idx) in logs" :key="idx" :class="['terminal-line', log.type]">
              <template v-for="(part, partIndex) in formatTerminalLogParts(log.text)" :key="`${idx}-${partIndex}`">
                <button
                  v-if="part.kind === 'local-path'"
                  type="button"
                  class="terminal-path-link"
                  :title="`左键打开路径，右键打开所在文件夹：${part.path}`"
                  @click="openLocalPath(part.path)"
                  @contextmenu.prevent="openLocalPathFolder(part.path)"
                >{{ part.text }}</button>
                <span v-else>{{ part.text }}</span>
              </template>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, nextTick, watch } from 'vue'
import { moveConsoleHistoryItem } from '~/utils/consoleHistoryOrder'
import {
  buildA5LowFrameCaptureCommand,
  buildA5LowFrameCaptureFrameCommand,
  buildA5LowFrameTeleportCommand,
} from '~/utils/a5LowFramePoints.js'
import {
  DEFAULT_CONSOLE_MAP_POINT_PRESET_ID,
  createDefaultConsoleMapPointPresets,
  normalizeConsoleMapPointPresets,
  parseConsoleMapPointText,
} from '~/utils/consoleMapPointPresets.js'

const LEGACY_PARAM_STORAGE_KEY = 'cgtools_script_runner_params_v1'
const PARAM_STORAGE_KEY = 'cgtools_script_runner_params_v2'
const MODE_STORAGE_KEY = 'cgtools_script_runner_mode_v1'
const CONSOLE_SETTINGS_STORAGE_KEY = 'cgtools_console_runner_settings_v1'
const CONSOLE_HISTORY_STORAGE_KEY = 'cgtools_console_runner_history_v1'
const CONSOLE_MAP_POINT_PRESETS_STORAGE_KEY = 'cgtools_console_map_point_presets_v1'
const CONSOLE_LOG_KEY = '__console__'
const CONSOLE_HISTORY_LIMIT = 36
const CONSOLE_HISTORY_TAG_LIMIT = 8
const CONSOLE_HISTORY_TAG_MAX_LENGTH = 18
const DEFAULT_SCRIPT_PARAM_PROJECT = '默认项目'
const DEFAULT_CONSOLE_COMMAND_LOCAL_PATH = 'E:\\CJGame\\trunk\\Survive\\Saved\\Profiling\\CVar\\CVarList.csv'
const CONSOLE_HISTORY_CATEGORIES = [
  {
    key: 'performance-recording',
    label: '性能录制',
    matchers: [
      /^stat\s+startfile\b/i,
      /^stat\s+stopfile\b/i,
      /^trace\./i,
      /^csvprofile\b/i,
      /^csv\s/i,
      /^startfpschart\b/i,
      /^stopfpschart\b/i,
    ],
  },
  {
    key: 'performance-stats',
    label: '性能观察',
    matchers: [
      /^stat\s/i,
      /^stats\s/i,
      /^statunit\b/i,
      /^profilegpu\b/i,
      /^dumpticks\b/i,
      /^dumpparticle/i,
    ],
  },
  {
    key: 'log-level',
    label: '日志级别',
    matchers: [
      /^log\s/i,
      /^log(?:global|net|ai|script|render|rhi)/i,
      /^.*log.*\b(?:verbose|veryverbose|warning|error|off)\b/i,
    ],
  },
  {
    key: 'rendering',
    label: '渲染画质',
    matchers: [
      /^r\./i,
      /^sg\./i,
      /^show\b/i,
      /^viewmode\b/i,
      /^foliage\./i,
      /^grass\./i,
    ],
  },
  {
    key: 'debug-tools',
    label: '调试工具',
    matchers: [
      /^debug/i,
      /^display/i,
      /^toggle/i,
      /^dump/i,
      /^obj\b/i,
      /^gc\b/i,
    ],
  },
  {
    key: 'other',
    label: '其它命令',
    matchers: [],
  },
]
const scripts = ref([])
const selectedScript = ref(null)
const activeMode = ref('script')
const isRunning = ref(false)
const isPickingScriptFolder = ref(false)
const isLoadingScriptContent = ref(false)
const isSavingScriptContent = ref(false)
const logsByScript = ref({})
const terminalEl = ref(null)
const consoleTextareaEl = ref(null)
const scriptParamValues = ref({})
const scriptParamStore = ref({})
const scriptParamProjectName = ref(DEFAULT_SCRIPT_PARAM_PROJECT)
const consolePackageName = ref('com.tencent.tmgp.pubgmhd')
const consoleDeviceSerial = ref('')
const consoleRequireProcess = ref(true)
const consoleCommand = ref('')
const consoleCommandLocalPath = ref(DEFAULT_CONSOLE_COMMAND_LOCAL_PATH)
const consoleHistoryTagInput = ref('')
const consoleHistory = ref([])
const consoleCommands = ref([])
const consoleToolTab = ref('manual')
const consoleMapPointPresets = ref(createDefaultConsoleMapPointPresets())
const selectedConsoleMapPointPresetId = ref(DEFAULT_CONSOLE_MAP_POINT_PRESET_ID)
const selectedA5LowFramePoint = ref(consoleMapPointPresets.value[0].points[0])
const mapPointNewMapName = ref('')
const mapPointImportText = ref('')
const mapPointImportMapName = ref('')
const mapPointImportError = ref('')
const consoleCommandSourcePath = ref('')
const consoleCommandUpdatedAt = ref(0)
const consoleCommandLoadError = ref('')
const cvarRows = ref([])
const cvarSourcePath = ref('')
const cvarUpdatedAt = ref(0)
const cvarLoadError = ref('')
const cvarFilter = ref('')
const consoleCursorIndex = ref(0)
const consoleSuggestionIndex = ref(0)
const isLoadingLocalConsoleCommands = ref(false)
const isSyncingConsoleCommands = ref(false)
const isLoadingCvars = ref(false)
const editingConsoleHistoryId = ref('')
const editingConsoleHistoryTags = ref('')
const draggedConsoleHistoryId = ref('')
const dragOverConsoleHistoryId = ref('')
const dragOverConsoleHistoryPosition = ref('before')
const scriptContent = ref('')
const savedScriptContent = ref('')
const scriptContentLoaded = ref(false)
let ws = null
let scriptContentLoadId = 0

const fetchScripts = async () => {
  try {
    const data = await $fetch('/api/scripts')
    scripts.value = data || []
    if (selectedScript.value) {
      const refreshed = scripts.value.find((script) => script.path === selectedScript.value.path)
      if (refreshed) {
        selectedScript.value = refreshed
        applySavedScriptParams(refreshed)
      }
    }
  } catch (e) {
    console.error('Failed to load scripts', e)
  }
}

const loadScripts = () => {
  fetchScripts()
}

const selectScript = (script) => {
  if (selectedScript.value?.path !== script.path && isScriptDirty.value) {
    const shouldSwitch = window.confirm('当前脚本有未保存修改，切换后会丢失这些修改。继续切换吗？')
    if (!shouldSwitch) return
  }

  activeMode.value = 'script'
  localStorage.setItem(MODE_STORAGE_KEY, activeMode.value)
  selectedScript.value = script
  applySavedScriptParams(script)
  loadScriptContent(script)
  if (isCvarScript(script)) {
    loadCvars()
  }
}

const switchMode = (mode) => {
  if (mode === activeMode.value) return
  if (activeMode.value === 'script' && isScriptDirty.value) {
    const shouldSwitch = window.confirm('当前脚本有未保存修改，切换后会丢失这些修改。继续切换吗？')
    if (!shouldSwitch) return
  }

  activeMode.value = mode
  localStorage.setItem(MODE_STORAGE_KEY, mode)
}

const isCvarScript = (script) => String(script?.name || '').toLowerCase() === 'pull_cvar.bat'
const isCvarScriptPath = (scriptPath) => /(^|[\\/])pull_cvar\.bat$/i.test(String(scriptPath || ''))
const selectedScriptParams = computed(() => selectedScript.value?.params || [])
const selectedScriptParamProjects = computed(() => {
  const key = getScriptParamKey(selectedScript.value)
  if (!key) return [DEFAULT_SCRIPT_PARAM_PROJECT]
  const entry = normalizeScriptParamStoreEntry(scriptParamStore.value[key])
  return Object.keys(entry.projects).length
    ? Object.keys(entry.projects)
    : [DEFAULT_SCRIPT_PARAM_PROJECT]
})
const isScriptDirty = computed(() => scriptContentLoaded.value && scriptContent.value !== savedScriptContent.value)
const canSaveScriptContent = computed(() => Boolean(
  selectedScript.value
  && scriptContentLoaded.value
  && isScriptDirty.value
  && !isSavingScriptContent.value
  && !isLoadingScriptContent.value
  && !isRunning.value
))
const scriptStatusText = computed(() => {
  if (isLoadingScriptContent.value) return '读取中'
  if (isSavingScriptContent.value) return '保存中'
  if (!scriptContentLoaded.value) return '未加载'
  return isScriptDirty.value ? '有未保存修改' : '已保存'
})
const scriptEditorStatusText = computed(() => {
  if (isLoadingScriptContent.value) return '正在读取文件内容'
  if (isSavingScriptContent.value) return '正在写入文件'
  if (!scriptContentLoaded.value) return '脚本内容尚未加载'
  return isScriptDirty.value ? '修改后请先保存再运行' : '已同步到磁盘文件'
})
const currentRunnerTitle = computed(() => {
  if (activeMode.value === 'console') return 'Console 命令'
  return selectedScript.value ? selectedScript.value.name : '请选择脚本'
})
const currentRunnerStatusText = computed(() => {
  if (activeMode.value === 'console') {
    return '通过 adb broadcast 发送到游戏'
  }
  return selectedScript.value ? scriptStatusText.value : '未选择'
})
const isCvarScriptSelected = computed(() => isCvarScript(selectedScript.value))
const canRunCurrent = computed(() => {
  if (isRunning.value) return false
  if (activeMode.value === 'console') return Boolean(consoleCommand.value.trim())
  return Boolean(selectedScript.value && !isScriptDirty.value)
})
const currentConsolePrefix = computed(() => {
  const beforeCursor = consoleCommand.value.slice(0, consoleCursorIndex.value)
  const segment = beforeCursor.split(/[;\r\n]/).pop() || ''
  return segment.trimStart()
})
const consoleSuggestions = computed(() => {
  const prefix = currentConsolePrefix.value.toLowerCase()
  if (!prefix) return []

  const startsWith = []
  const contains = []
  for (const command of consoleCommands.value) {
    const name = command.name.toLowerCase()
    if (name.startsWith(prefix)) {
      startsWith.push(command)
    } else if (name.includes(prefix)) {
      contains.push(command)
    }
  }

  return [...startsWith, ...contains].slice(0, 16)
})
const consoleCommandStatusText = computed(() => {
  if (isLoadingLocalConsoleCommands.value) return '正在读取本地命令库...'
  if (isSyncingConsoleCommands.value) return '正在从设备同步最新命令...'
  if (consoleCommandLoadError.value) return consoleCommandLoadError.value
  if (!consoleCommands.value.length) return '尚未加载命令库，可读取本地路径或同步命令'

  const timeText = consoleCommandUpdatedAt.value
    ? new Date(consoleCommandUpdatedAt.value).toLocaleString()
    : '未知时间'
  const sourceName = consoleCommandSourcePath.value ? consoleCommandSourcePath.value.split(/[\\/]/).pop() : '未知来源'
  return `${consoleCommands.value.length} 条命令 · ${sourceName} · ${timeText}`
})
const normalizedCvarFilter = computed(() => cvarFilter.value.trim().toLowerCase())
const filteredCvarRows = computed(() => {
  const filter = normalizedCvarFilter.value
  if (!filter) return cvarRows.value

  return cvarRows.value.filter((row) => {
    const name = String(row.name || '').toLowerCase()
    const value = String(row.value || '').toLowerCase()
    return name.includes(filter) || value.includes(filter)
  })
})
const visibleCvarRows = computed(() => filteredCvarRows.value.slice(0, 500))
const cvarStatusText = computed(() => {
  if (isLoadingCvars.value) return '正在读取 PerformanceData/Logs 最新 CVar CSV...'
  if (cvarLoadError.value) return cvarLoadError.value
  if (!cvarRows.value.length) return '未找到 CVar CSV'

  const sourceName = cvarSourcePath.value ? cvarSourcePath.value.split(/[\\/]/).pop() : '未知来源'
  const timeText = cvarUpdatedAt.value ? new Date(cvarUpdatedAt.value).toLocaleString() : '未知时间'
  const matchText = normalizedCvarFilter.value
    ? `，匹配 ${filteredCvarRows.value.length} 条`
    : ''
  const limitText = filteredCvarRows.value.length > visibleCvarRows.value.length
    ? `，当前显示前 ${visibleCvarRows.value.length} 条`
    : ''
  return `${cvarRows.value.length} 条 CVar${matchText}${limitText} · ${sourceName} · ${timeText}`
})
const currentScriptLogKey = computed(() => activeMode.value === 'console' ? CONSOLE_LOG_KEY : selectedScript.value?.path || '')
const logs = computed(() => {
  const key = currentScriptLogKey.value
  return key ? (logsByScript.value[key] || []) : []
})
const isCurrentConsoleCommandCollected = computed(() => {
  const commandKey = normalizeConsoleCommandKey(consoleCommand.value)
  if (!commandKey) return false
  return normalizeConsoleHistory(consoleHistory.value).some((item) => item.commandKey === commandKey)
})
const currentConsoleHistoryActionText = computed(() => (
  isCurrentConsoleCommandCollected.value ? '更新收录' : '收录命令'
))
const selectedConsoleMapPointPreset = computed(() => (
  consoleMapPointPresets.value.find((preset) => preset.id === selectedConsoleMapPointPresetId.value)
  || consoleMapPointPresets.value[0]
))
const a5LowFramePoints = computed(() => selectedConsoleMapPointPreset.value.points)
const selectedA5TeleportCommand = computed(() => (
  selectedA5LowFramePoint.value ? buildA5LowFrameTeleportCommand(selectedA5LowFramePoint.value) : ''
))
const selectedA5CaptureFrameCommand = computed(() => (
  selectedA5LowFramePoint.value ? buildA5LowFrameCaptureFrameCommand(selectedA5LowFramePoint.value) : ''
))
const consoleHistoryGroups = computed(() => {
  const groups = []
  let currentGroup = null

  for (const item of consoleHistory.value) {
    const category = getConsoleCommandCategory(item.command)
    if (!currentGroup || currentGroup.categoryKey !== category.key) {
      currentGroup = {
        key: `${category.key}-${groups.length}`,
        categoryKey: category.key,
        label: category.label,
        items: [],
      }
      groups.push(currentGroup)
    }
    currentGroup.items.push(item)
  }

  return groups
})

const WINDOWS_LOCAL_PATH_RE = /[A-Za-z]:\\[^\r\n<>"|?*]+/g

const trimLocalPathMatch = (rawPath) => {
  let text = rawPath.trimEnd()
  while (/[.,;:]+$/.test(text)) {
    text = text.slice(0, -1)
  }
  return text
}

const formatTerminalLogParts = (text) => {
  const parts = []
  let lastIndex = 0

  for (const match of text.matchAll(WINDOWS_LOCAL_PATH_RE)) {
    const rawPath = match[0]
    const pathText = trimLocalPathMatch(rawPath)
    const start = match.index ?? 0
    const end = start + pathText.length

    if (!pathText || end <= lastIndex) continue
    if (start > lastIndex) {
      parts.push({ kind: 'text', text: text.slice(lastIndex, start) })
    }

    parts.push({ kind: 'local-path', text: pathText, path: pathText })
    lastIndex = end
  }

  if (lastIndex < text.length) {
    parts.push({ kind: 'text', text: text.slice(lastIndex) })
  }

  return parts.length ? parts : [{ kind: 'text', text }]
}

const getScriptParamKey = (script) => script?.name || script?.path || ''

const getDefaultScriptParams = (script) => {
  const defaults = {}
  for (const param of script?.params || []) {
    defaults[param.key] = param.defaultValue ?? (param.type === 'switch' ? false : '')
  }
  return defaults
}

const normalizeScriptParamProjectName = (name) => {
  const normalized = String(name || '').trim()
  return normalized || DEFAULT_SCRIPT_PARAM_PROJECT
}

const normalizeScriptParamStoreEntry = (entry) => {
  if (entry?.projects && typeof entry.projects === 'object') {
    return {
      activeProject: normalizeScriptParamProjectName(entry.activeProject),
      projects: entry.projects,
    }
  }

  if (entry && typeof entry === 'object') {
    return {
      activeProject: DEFAULT_SCRIPT_PARAM_PROJECT,
      projects: {
        [DEFAULT_SCRIPT_PARAM_PROJECT]: entry,
      },
    }
  }

  return {
    activeProject: DEFAULT_SCRIPT_PARAM_PROJECT,
    projects: {},
  }
}

const migrateLegacyParamStore = () => {
  try {
    const raw = localStorage.getItem(LEGACY_PARAM_STORAGE_KEY)
    const legacyStore = raw ? JSON.parse(raw) : {}
    const migrated = {}

    for (const [scriptKey, values] of Object.entries(legacyStore || {})) {
      migrated[scriptKey] = normalizeScriptParamStoreEntry(values)
    }

    return migrated
  } catch {
    return {}
  }
}

const loadParamStore = () => {
  try {
    const raw = localStorage.getItem(PARAM_STORAGE_KEY)
    scriptParamStore.value = raw ? JSON.parse(raw) : migrateLegacyParamStore()
  } catch {
    scriptParamStore.value = migrateLegacyParamStore()
  }
}

const loadConsoleState = () => {
  try {
    const savedMode = localStorage.getItem(MODE_STORAGE_KEY)
    if (savedMode === 'console' || savedMode === 'script') {
      activeMode.value = savedMode
    }

    const rawSettings = localStorage.getItem(CONSOLE_SETTINGS_STORAGE_KEY)
    const settings = rawSettings ? JSON.parse(rawSettings) : {}
    consolePackageName.value = typeof settings.packageName === 'string' && settings.packageName.trim()
      ? settings.packageName
      : 'com.tencent.tmgp.pubgmhd'
    consoleDeviceSerial.value = typeof settings.deviceSerial === 'string' ? settings.deviceSerial : ''
    consoleRequireProcess.value = typeof settings.requireProcess === 'boolean' ? settings.requireProcess : true
    consoleCommand.value = typeof settings.command === 'string' ? settings.command : ''
    consoleHistoryTagInput.value = typeof settings.historyTags === 'string' ? settings.historyTags : ''
    consoleCommandLocalPath.value = typeof settings.commandLocalPath === 'string' && settings.commandLocalPath.trim()
      ? settings.commandLocalPath
      : DEFAULT_CONSOLE_COMMAND_LOCAL_PATH

    const rawHistory = localStorage.getItem(CONSOLE_HISTORY_STORAGE_KEY)
    const history = rawHistory ? JSON.parse(rawHistory) : []
    consoleHistory.value = normalizeConsoleHistory(history)
    persistConsoleHistory()
  } catch {
    activeMode.value = 'script'
    consolePackageName.value = 'com.tencent.tmgp.pubgmhd'
    consoleDeviceSerial.value = ''
    consoleRequireProcess.value = true
    consoleCommand.value = ''
    consoleHistoryTagInput.value = ''
    consoleCommandLocalPath.value = DEFAULT_CONSOLE_COMMAND_LOCAL_PATH
    consoleHistory.value = []
  }
}

const persistConsoleSettings = () => {
  localStorage.setItem(CONSOLE_SETTINGS_STORAGE_KEY, JSON.stringify({
    packageName: consolePackageName.value,
    deviceSerial: consoleDeviceSerial.value,
    requireProcess: consoleRequireProcess.value,
    command: consoleCommand.value,
    historyTags: consoleHistoryTagInput.value,
    commandLocalPath: consoleCommandLocalPath.value,
  }))
}

const ensureSelectedMapPointPreset = () => {
  const preset = selectedConsoleMapPointPreset.value
  selectedConsoleMapPointPresetId.value = preset.id
  if (!preset.points.length) {
    selectedA5LowFramePoint.value = null
    return
  }
  if (!preset.points.some((point) => point.tag === selectedA5LowFramePoint.value?.tag)) {
    selectedA5LowFramePoint.value = preset.points[0]
  }
}

const persistConsoleMapPointPresets = () => {
  localStorage.setItem(CONSOLE_MAP_POINT_PRESETS_STORAGE_KEY, JSON.stringify(consoleMapPointPresets.value))
}

const loadConsoleMapPointPresets = () => {
  try {
    const rawPresets = localStorage.getItem(CONSOLE_MAP_POINT_PRESETS_STORAGE_KEY)
    consoleMapPointPresets.value = normalizeConsoleMapPointPresets(rawPresets ? JSON.parse(rawPresets) : null)
  } catch {
    consoleMapPointPresets.value = createDefaultConsoleMapPointPresets()
  }
  ensureSelectedMapPointPreset()
  persistConsoleMapPointPresets()
}

const persistConsoleHistory = () => {
  localStorage.setItem(CONSOLE_HISTORY_STORAGE_KEY, JSON.stringify(consoleHistory.value))
}

const getConsoleHistoryItemDragKey = (item) => item?.id || item?.commandKey || normalizeConsoleCommandKey(item?.command)

const normalizeConsoleCommandKey = (command) => {
  const normalized = String(command || '').trim().replace(/\s+/g, ' ').toLowerCase()
  return normalized.replace(/^stats?\s+units?\b/, 'stat unit')
}

const parseConsoleHistoryTags = (rawTags) => {
  const source = Array.isArray(rawTags) ? rawTags.join(' ') : String(rawTags || '')
  const tags = []
  const seen = new Set()

  for (const rawTag of source.split(/[\s,，、;；]+/)) {
    const tag = rawTag.trim().replace(/^#+/, '').slice(0, CONSOLE_HISTORY_TAG_MAX_LENGTH)
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue

    seen.add(key)
    tags.push(tag)
    if (tags.length >= CONSOLE_HISTORY_TAG_LIMIT) break
  }

  return tags
}

const formatConsoleHistoryTags = (tags) => parseConsoleHistoryTags(tags).join(' ')

const getConsoleCommandCategory = (command) => {
  const text = String(command || '').trim()
  return CONSOLE_HISTORY_CATEGORIES.find((category) => (
    category.key === 'other' || category.matchers.some((matcher) => matcher.test(text))
  )) || CONSOLE_HISTORY_CATEGORIES[CONSOLE_HISTORY_CATEGORIES.length - 1]
}

const normalizeConsoleHistory = (history) => {
  const seen = new Set()
  const normalized = []

  for (const rawItem of Array.isArray(history) ? history : []) {
    const command = typeof rawItem?.command === 'string' ? rawItem.command.trim() : ''
    const commandKey = normalizeConsoleCommandKey(command)
    if (!commandKey || seen.has(commandKey)) continue

    const category = getConsoleCommandCategory(command)
    seen.add(commandKey)
    normalized.push({
      id: typeof rawItem?.id === 'string' ? rawItem.id : `${Date.now()}-${normalized.length}`,
      command,
      commandKey,
      category: category.key,
      packageName: typeof rawItem?.packageName === 'string' && rawItem.packageName.trim()
        ? rawItem.packageName.trim()
        : 'com.tencent.tmgp.pubgmhd',
      deviceSerial: typeof rawItem?.deviceSerial === 'string' ? rawItem.deviceSerial.trim() : '',
      requireProcess: typeof rawItem?.requireProcess === 'boolean' ? rawItem.requireProcess : true,
      tags: parseConsoleHistoryTags(rawItem?.tags || rawItem?.remarkTags || rawItem?.labels || rawItem?.note),
    })
  }

  return normalized.slice(0, CONSOLE_HISTORY_LIMIT)
}

const persistSelectedScriptParams = () => {
  if (!selectedScript.value) return
  const key = getScriptParamKey(selectedScript.value)
  if (!key) return

  const projectName = normalizeScriptParamProjectName(scriptParamProjectName.value)
  const currentEntry = normalizeScriptParamStoreEntry(scriptParamStore.value[key])
  scriptParamStore.value = {
    ...scriptParamStore.value,
    [key]: {
      activeProject: projectName,
      projects: {
        ...currentEntry.projects,
        [projectName]: { ...scriptParamValues.value },
      },
    },
  }
  localStorage.setItem(PARAM_STORAGE_KEY, JSON.stringify(scriptParamStore.value))
}

const applySavedScriptParams = (script) => {
  const key = getScriptParamKey(script)
  const entry = key ? normalizeScriptParamStoreEntry(scriptParamStore.value[key]) : normalizeScriptParamStoreEntry(null)
  const projectName = normalizeScriptParamProjectName(entry.activeProject)
  const saved = entry.projects[projectName] || {}
  scriptParamProjectName.value = projectName
  scriptParamValues.value = {
    ...getDefaultScriptParams(script),
    ...saved,
  }
}

const applyScriptParamProjectName = () => {
  if (!selectedScript.value) return
  const projectName = normalizeScriptParamProjectName(scriptParamProjectName.value)
  const key = getScriptParamKey(selectedScript.value)
  const entry = normalizeScriptParamStoreEntry(scriptParamStore.value[key])
  const saved = entry.projects[projectName] || {}

  scriptParamProjectName.value = projectName
  scriptParamValues.value = {
    ...getDefaultScriptParams(selectedScript.value),
    ...saved,
  }
  persistSelectedScriptParams()
}

const rememberConsoleCommand = () => {
  const command = consoleCommand.value.trim()
  if (!command) return
  const commandKey = normalizeConsoleCommandKey(command)
  const category = getConsoleCommandCategory(command)

  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    command,
    commandKey,
    category: category.key,
    packageName: consolePackageName.value.trim() || 'com.tencent.tmgp.pubgmhd',
    deviceSerial: consoleDeviceSerial.value.trim(),
    requireProcess: consoleRequireProcess.value,
    tags: parseConsoleHistoryTags(consoleHistoryTagInput.value),
  }
  const deduped = normalizeConsoleHistory(consoleHistory.value).filter((entry) => (
    (entry.commandKey || normalizeConsoleCommandKey(entry.command)) !== item.commandKey
  ))
  consoleHistory.value = [item, ...deduped].slice(0, CONSOLE_HISTORY_LIMIT)
  persistConsoleHistory()
}

const deleteConsoleHistoryItem = (item) => {
  const commandKey = item.commandKey || normalizeConsoleCommandKey(item.command)
  consoleHistory.value = normalizeConsoleHistory(consoleHistory.value).filter((entry) => (
    (entry.commandKey || normalizeConsoleCommandKey(entry.command)) !== commandKey
  ))
  if (editingConsoleHistoryId.value === item.id) {
    cancelEditConsoleHistoryTags()
  }
  persistConsoleHistory()
}

const selectConsoleHistory = (item) => {
  consoleCommand.value = item.command || ''
  consolePackageName.value = item.packageName || 'com.tencent.tmgp.pubgmhd'
  consoleDeviceSerial.value = item.deviceSerial || ''
  consoleRequireProcess.value = typeof item.requireProcess === 'boolean' ? item.requireProcess : true
  consoleHistoryTagInput.value = formatConsoleHistoryTags(item.tags)
  persistConsoleSettings()
  nextTick(() => {
    if (!consoleTextareaEl.value) return
    const cursor = consoleCommand.value.length
    consoleTextareaEl.value.focus()
    consoleTextareaEl.value.setSelectionRange(cursor, cursor)
    updateConsoleCursor()
  })
}

const isConsoleHistoryItemActive = (item) => {
  const commandKey = item.commandKey || normalizeConsoleCommandKey(item.command)
  return Boolean(commandKey && commandKey === normalizeConsoleCommandKey(consoleCommand.value))
}

const startEditConsoleHistoryTags = (item) => {
  editingConsoleHistoryId.value = item.id
  editingConsoleHistoryTags.value = formatConsoleHistoryTags(item.tags)
}

const cancelEditConsoleHistoryTags = () => {
  editingConsoleHistoryId.value = ''
  editingConsoleHistoryTags.value = ''
}

const saveConsoleHistoryTags = (item) => {
  const tags = parseConsoleHistoryTags(editingConsoleHistoryTags.value)
  const commandKey = item.commandKey || normalizeConsoleCommandKey(item.command)

  consoleHistory.value = normalizeConsoleHistory(consoleHistory.value).map((entry) => {
    const entryKey = entry.commandKey || normalizeConsoleCommandKey(entry.command)
    return entryKey === commandKey ? { ...entry, tags } : entry
  })

  if (commandKey && commandKey === normalizeConsoleCommandKey(consoleCommand.value)) {
    consoleHistoryTagInput.value = formatConsoleHistoryTags(tags)
    persistConsoleSettings()
  }

  cancelEditConsoleHistoryTags()
  persistConsoleHistory()
}

const startConsoleHistoryDrag = (event, item) => {
  const dragKey = getConsoleHistoryItemDragKey(item)
  if (!dragKey) return

  draggedConsoleHistoryId.value = dragKey
  dragOverConsoleHistoryId.value = dragKey
  dragOverConsoleHistoryPosition.value = 'before'
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', dragKey)
}

const handleConsoleHistoryDragOver = (event, item) => {
  const targetKey = getConsoleHistoryItemDragKey(item)
  if (!draggedConsoleHistoryId.value || !targetKey) return

  const rect = event.currentTarget.getBoundingClientRect()
  const position = event.clientY > rect.top + rect.height / 2 ? 'after' : 'before'
  dragOverConsoleHistoryId.value = targetKey
  dragOverConsoleHistoryPosition.value = position
  event.dataTransfer.dropEffect = 'move'
}

const finishConsoleHistoryDrag = () => {
  draggedConsoleHistoryId.value = ''
  dragOverConsoleHistoryId.value = ''
  dragOverConsoleHistoryPosition.value = 'before'
}

const dropConsoleHistoryItem = (item) => {
  const draggedKey = draggedConsoleHistoryId.value
  const targetKey = getConsoleHistoryItemDragKey(item)
  const position = dragOverConsoleHistoryPosition.value
  if (!draggedKey || !targetKey) {
    finishConsoleHistoryDrag()
    return
  }

  consoleHistory.value = moveConsoleHistoryItem(consoleHistory.value, draggedKey, targetKey, position)
  persistConsoleHistory()
  finishConsoleHistoryDrag()
}

const getErrorMessage = (error, fallback) => {
  return error?.data?.statusMessage || error?.statusMessage || error?.message || fallback
}

const applyConsoleCommandSnapshot = (snapshot) => {
  consoleCommands.value = Array.isArray(snapshot.commands) ? snapshot.commands : []
  consoleCommandSourcePath.value = snapshot.sourcePath || ''
  consoleCommandUpdatedAt.value = Number(snapshot.updatedAt || 0)
  consoleCommandLoadError.value = ''
  consoleSuggestionIndex.value = 0
}

const applyCvarSnapshot = (snapshot) => {
  cvarRows.value = Array.isArray(snapshot.rows) ? snapshot.rows : []
  cvarSourcePath.value = snapshot.sourcePath || ''
  cvarUpdatedAt.value = Number(snapshot.updatedAt || 0)
  cvarLoadError.value = ''
}

const loadCvars = async (options = {}) => {
  if (isLoadingCvars.value) return

  const shouldNotify = options.notify === true
  isLoadingCvars.value = true
  cvarLoadError.value = ''
  if (shouldNotify) {
    appendLog('info', '[info] 正在读取最新 CVar CSV...\n')
  }

  try {
    const snapshot = await $fetch('/api/scripts/cvars')
    applyCvarSnapshot(snapshot)
    if (shouldNotify) {
      appendLog('info', `[info] 已读取 ${cvarRows.value.length} 条 CVar：${cvarSourcePath.value || '无本地 CVar 文件'}\n`)
    }
  } catch (error) {
    const message = getErrorMessage(error, '未知错误')
    cvarLoadError.value = `读取 CVar 失败：${message}`
    if (shouldNotify) {
      appendLog('stderr', `[error] 读取 CVar 失败：${message}\n`)
    }
  } finally {
    isLoadingCvars.value = false
  }
}

const openCvarSource = () => {
  if (!cvarSourcePath.value) return
  openLocalPath(cvarSourcePath.value)
}

const copyVisibleCvars = async () => {
  const rows = filteredCvarRows.value
  if (!rows.length) return

  const text = [
    'Index,Name,Value',
    ...rows.map((row) => [row.index, row.name, row.value].map((cell) => {
      const value = String(cell ?? '')
      return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
    }).join(',')),
  ].join('\n')
  const copied = await copyText(text)
  appendLog(copied ? 'info' : 'stderr', copied ? `[info] 已复制 ${rows.length} 条 CVar。\n` : '[error] 复制 CVar 失败。\n')
}

const loadConsoleCommands = async (options = {}) => {
  if (isLoadingLocalConsoleCommands.value) return

  const shouldNotify = options.notify === true
  isLoadingLocalConsoleCommands.value = true
  consoleCommandLoadError.value = ''
  const localPath = consoleCommandLocalPath.value.trim()

  if (shouldNotify) {
    appendLog('info', `[info] 正在读取本地 UE Console 命令库：${localPath || '默认 PerformanceData/Logs 最新 CSV'}\n`, CONSOLE_LOG_KEY)
  }

  try {
    const snapshot = await $fetch('/api/scripts/console-commands', {
      query: localPath ? { path: localPath } : {},
    })
    applyConsoleCommandSnapshot(snapshot)
    if (shouldNotify) {
      appendLog(
        'info',
        `[info] 已读取 ${consoleCommands.value.length} 条 UE Console 命令：${consoleCommandSourcePath.value || '无本地命令库文件'}\n`,
        CONSOLE_LOG_KEY,
      )
    }
  } catch (error) {
    const message = getErrorMessage(error, '未知错误')
    consoleCommandLoadError.value = `读取命令库失败：${message}`
    if (shouldNotify) {
      appendLog('stderr', `[error] 读取命令库失败：${message}\n`, CONSOLE_LOG_KEY)
    }
  } finally {
    isLoadingLocalConsoleCommands.value = false
  }
}

const pickConsoleCommandCsv = async () => {
  try {
    const res = await $fetch('/api/system/file', {
      query: {
        mode: 'open',
        filter: 'csv',
      },
    })

    if (res.success && res.path) {
      consoleCommandLocalPath.value = res.path
      persistConsoleSettings()
      await loadConsoleCommands({ notify: true })
      return
    }

    consoleCommandLoadError.value = res.error || '未选择 CSV 文件'
  } catch (error) {
    consoleCommandLoadError.value = `选择 CSV 失败：${getErrorMessage(error, '未知错误')}`
  }
}

const syncConsoleCommands = async () => {
  if (isSyncingConsoleCommands.value) return

  isSyncingConsoleCommands.value = true
  consoleCommandLoadError.value = ''
  appendLog('info', '[info] 正在从设备同步 UE Console 命令库...\n', CONSOLE_LOG_KEY)

  try {
    const snapshot = await $fetch('/api/scripts/console-commands/sync', {
      method: 'POST',
      body: {
        packageName: consolePackageName.value.trim() || 'com.tencent.tmgp.pubgmhd',
        deviceSerial: consoleDeviceSerial.value.trim(),
      },
    })
    applyConsoleCommandSnapshot(snapshot)
    appendLog('info', `[info] 已同步 ${consoleCommands.value.length} 条命令。\n`, CONSOLE_LOG_KEY)
  } catch (error) {
    const message = getErrorMessage(error, '未知错误')
    consoleCommandLoadError.value = `同步命令失败：${message}`
    appendLog('stderr', `[error] 同步命令失败：${message}\n`, CONSOLE_LOG_KEY)
  } finally {
    isSyncingConsoleCommands.value = false
  }
}

const updateConsoleCursor = () => {
  consoleCursorIndex.value = consoleTextareaEl.value?.selectionStart ?? consoleCommand.value.length
  if (consoleSuggestionIndex.value >= consoleSuggestions.value.length) {
    consoleSuggestionIndex.value = 0
  }
}

const acceptConsoleSuggestion = (suggestion = consoleSuggestions.value[consoleSuggestionIndex.value]) => {
  if (!suggestion || !consoleTextareaEl.value) return

  const cursor = consoleTextareaEl.value.selectionStart ?? consoleCommand.value.length
  const beforeCursor = consoleCommand.value.slice(0, cursor)
  const afterCursor = consoleCommand.value.slice(cursor)
  const separators = [';', '\n', '\r']
  const lastSeparatorIndex = Math.max(...separators.map((separator) => beforeCursor.lastIndexOf(separator)))
  let replaceStart = lastSeparatorIndex + 1
  while (replaceStart < beforeCursor.length && /\s/.test(beforeCursor[replaceStart])) {
    replaceStart += 1
  }

  const suggestionText = suggestion.insertText || suggestion.name
  const nextValue = `${consoleCommand.value.slice(0, replaceStart)}${suggestionText}${afterCursor}`
  const nextCursor = replaceStart + suggestionText.length
  consoleCommand.value = nextValue
  consoleSuggestionIndex.value = 0

  nextTick(() => {
    consoleTextareaEl.value.focus()
    consoleTextareaEl.value.setSelectionRange(nextCursor, nextCursor)
    updateConsoleCursor()
  })
}

const handleConsoleCommandKeydown = (event) => {
  if (event.ctrlKey && event.key === 'Enter') {
    event.preventDefault()
    runCurrent()
    return
  }

  if (!consoleSuggestions.value.length) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    consoleSuggestionIndex.value = (consoleSuggestionIndex.value + 1) % consoleSuggestions.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    consoleSuggestionIndex.value = (consoleSuggestionIndex.value - 1 + consoleSuggestions.value.length) % consoleSuggestions.value.length
  } else if (event.key === 'Tab' || event.key === 'Enter') {
    event.preventDefault()
    acceptConsoleSuggestion()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    consoleSuggestionIndex.value = 0
    consoleCursorIndex.value = 0
  }
}

const resetScriptContent = () => {
  scriptContent.value = ''
  savedScriptContent.value = ''
  scriptContentLoaded.value = false
}

const loadScriptContent = async (script = selectedScript.value) => {
  if (!script) {
    resetScriptContent()
    return
  }

  const loadId = ++scriptContentLoadId
  isLoadingScriptContent.value = true
  resetScriptContent()

  try {
    const res = await $fetch('/api/scripts/content', { query: { path: script.path } })
    if (loadId !== scriptContentLoadId) return

    const content = typeof res.content === 'string' ? res.content : ''
    scriptContent.value = content
    savedScriptContent.value = content
    scriptContentLoaded.value = true
  } catch (error) {
    if (loadId === scriptContentLoadId) {
      appendLog('stderr', `[error] 读取脚本失败：${getErrorMessage(error, '未知错误')}\n`)
    }
  } finally {
    if (loadId === scriptContentLoadId) {
      isLoadingScriptContent.value = false
    }
  }
}

const reloadScriptContent = async () => {
  if (!selectedScript.value) return
  if (isScriptDirty.value) {
    const shouldReload = window.confirm('当前脚本有未保存修改，重载后会丢失这些修改。继续重载吗？')
    if (!shouldReload) return
  }

  await loadScriptContent(selectedScript.value)
}

const saveScriptContent = async () => {
  if (!selectedScript.value || !canSaveScriptContent.value) return

  isSavingScriptContent.value = true
  try {
    await $fetch('/api/scripts/content', {
      method: 'POST',
      body: {
        path: selectedScript.value.path,
        content: scriptContent.value,
      },
    })
    savedScriptContent.value = scriptContent.value
    scriptContentLoaded.value = true
    appendLog('info', `[info] 已保存脚本：${selectedScript.value.name}\n`)
  } catch (error) {
    appendLog('stderr', `[error] 保存脚本失败：${getErrorMessage(error, '未知错误')}\n`)
  } finally {
    isSavingScriptContent.value = false
  }
}

const buildScriptArgs = () => {
  const args = []

  for (const param of selectedScriptParams.value) {
    const rawValue = scriptParamValues.value[param.key]
    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue

    if (param.required && !value) {
      appendLog('stderr', `[error] 缺少必填参数：${param.label}\n`)
      return null
    }

    if (!value) continue

    if (param.type === 'switch') {
      if (value && param.argName) {
        args.push(param.argName)
      }
      continue
    }

    if (param.argName) {
      args.push(param.argName, String(value))
    } else {
      args.push(String(value))
    }
  }

  return args
}

const pickFolder = async (initialPath = '') => {
  if (isPickingScriptFolder.value) return
  isPickingScriptFolder.value = true
  appendLog('info', '[info] 正在打开文件夹选择器...\n')

  try {
    const query = initialPath ? { path: initialPath } : {}
    const res = await $fetch('/api/system/folder', { query })
    if (res.success && res.path) {
      appendLog('info', `[info] 已选择文件夹：${res.path}\n`)
      return res.path
    }

    if (res.cancelled) return ''
    appendLog('stderr', `[warning] ${res.error || '选择文件夹失败'}\n`)
  } catch (error) {
    appendLog('stderr', `[error] 选择文件夹失败：${error.message}\n`)
  } finally {
    isPickingScriptFolder.value = false
  }
}

const pickScriptFolder = async (key) => {
  const path = await pickFolder(scriptParamValues.value[key])
  if (!path) return

  scriptParamValues.value = {
    ...scriptParamValues.value,
    [key]: path,
  }
  persistSelectedScriptParams()
}

const appendLog = (type, text, scriptPath = currentScriptLogKey.value) => {
  if (!scriptPath) return

  const scriptLogs = logsByScript.value[scriptPath] || []
  logsByScript.value = {
    ...logsByScript.value,
    [scriptPath]: [...scriptLogs, { type, text }],
  }

  nextTick(() => {
    if (terminalEl.value && scriptPath === currentScriptLogKey.value) {
      terminalEl.value.scrollTop = terminalEl.value.scrollHeight
    }
  })
}

const clearTerminal = () => {
  const key = currentScriptLogKey.value
  if (!key) return

  logsByScript.value = {
    ...logsByScript.value,
    [key]: [],
  }
}

const copyText = async (text) => {
  if (!text) return false

  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  }
}

const getSelectedTerminalText = () => {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !terminalEl.value || selection.rangeCount === 0) {
    return ''
  }

  const range = selection.getRangeAt(0)
  const ancestor = range.commonAncestorContainer
  const selectedNode = ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : ancestor.parentNode
  if (!selectedNode || !terminalEl.value.contains(selectedNode)) {
    return ''
  }

  return selection.toString()
}

const copySelectedTerminalText = async () => {
  const selectedText = getSelectedTerminalText()
  if (!selectedText.trim()) {
    appendLog('stderr', '[warning] 请先在终端里选中要复制的文本。\n')
    return
  }

  const copied = await copyText(selectedText)
  appendLog(copied ? 'info' : 'stderr', copied ? '[info] 已复制选中文本。\n' : '[error] 复制选中文本失败。\n')
}

const copyAllTerminalText = async () => {
  const allText = logs.value.map((log) => log.text).join('')
  const copied = await copyText(allText)
  appendLog(copied ? 'info' : 'stderr', copied ? '[info] 已复制全部日志。\n' : '[error] 复制全部日志失败。\n')
}

const selectA5LowFramePoint = (point) => {
  selectedA5LowFramePoint.value = point
}

const selectConsoleMapPointPreset = (preset) => {
  selectedConsoleMapPointPresetId.value = preset.id
  if (!preset.points.some((point) => point.tag === selectedA5LowFramePoint.value?.tag)) {
    selectedA5LowFramePoint.value = preset.points[0]
  }
}

const buildConsoleMapPointPreset = (label, points) => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  label,
  meta: `${points.length} 组 · ServerCMD TeleportAndRotateTo + fa.captureframe`,
  points,
})

const addConsoleMapPointPreset = () => {
  const label = mapPointNewMapName.value.trim()
  if (!label) {
    mapPointImportError.value = '请输入地图名。'
    return
  }

  const preset = buildConsoleMapPointPreset(label, [])
  consoleMapPointPresets.value = normalizeConsoleMapPointPresets([...consoleMapPointPresets.value, preset])
  selectedConsoleMapPointPresetId.value = preset.id
  selectedA5LowFramePoint.value = null
  mapPointNewMapName.value = ''
  mapPointImportError.value = ''
  persistConsoleMapPointPresets()
}

const deleteSelectedConsoleMapPointPreset = () => {
  if (consoleMapPointPresets.value.length <= 1) {
    mapPointImportError.value = '至少保留一个地图。'
    return
  }

  const currentId = selectedConsoleMapPointPreset.value.id
  consoleMapPointPresets.value = consoleMapPointPresets.value.filter((preset) => preset.id !== currentId)
  selectedConsoleMapPointPresetId.value = consoleMapPointPresets.value[0].id
  selectedA5LowFramePoint.value = consoleMapPointPresets.value[0].points[0] || null
  mapPointImportError.value = ''
  persistConsoleMapPointPresets()
}

const updateSelectedConsoleMapPointPresetFromText = () => {
  const points = parseConsoleMapPointText(mapPointImportText.value)
  if (!points.length) {
    mapPointImportError.value = '没有解析到 Pointdata。'
    return
  }

  const currentId = selectedConsoleMapPointPreset.value.id
  consoleMapPointPresets.value = consoleMapPointPresets.value.map((preset) => (
    preset.id === currentId
      ? {
          ...preset,
          meta: `${points.length} 组 · ServerCMD TeleportAndRotateTo + fa.captureframe`,
          points,
        }
      : preset
  ))
  selectedA5LowFramePoint.value = points[0]
  mapPointImportError.value = ''
  persistConsoleMapPointPresets()
}

const createConsoleMapPointPresetFromText = () => {
  const label = mapPointImportMapName.value.trim() || mapPointNewMapName.value.trim()
  if (!label) {
    mapPointImportError.value = '请输入新地图名。'
    return
  }

  const points = parseConsoleMapPointText(mapPointImportText.value)
  if (!points.length) {
    mapPointImportError.value = '没有解析到 Pointdata。'
    return
  }

  const preset = buildConsoleMapPointPreset(label, points)
  consoleMapPointPresets.value = normalizeConsoleMapPointPresets([...consoleMapPointPresets.value, preset])
  selectedConsoleMapPointPresetId.value = preset.id
  selectedA5LowFramePoint.value = preset.points[0]
  mapPointImportMapName.value = ''
  mapPointNewMapName.value = ''
  mapPointImportError.value = ''
  persistConsoleMapPointPresets()
}

const applyA5LowFrameCommandToConsole = (commandKind) => {
  const point = selectedA5LowFramePoint.value
  if (!point) return
  const commandText = commandKind === 'teleport'
    ? selectedA5TeleportCommand.value
    : selectedA5CaptureFrameCommand.value
  const commandTag = commandKind === 'teleport' ? '传送' : '抓帧'
  consoleCommand.value = commandText
  consoleHistoryTagInput.value = `${selectedConsoleMapPointPreset.value.label} ${point.tag} ${commandTag}`
  persistConsoleSettings()
}

const runA5LowFrameSelectedCommand = (commandKind) => {
  if (isRunning.value) return
  applyA5LowFrameCommandToConsole(commandKind)
  nextTick(runConsoleCommand)
}

const copyA5LowFrameAllCommands = async () => {
  const preset = selectedConsoleMapPointPreset.value
  if (!preset.points.length) {
    appendLog('stderr', `[error] ${preset.label} 还没有点位。\n`, CONSOLE_LOG_KEY)
    return
  }
  const allCommands = preset.points.map(buildA5LowFrameCaptureCommand).join('\n')
  const copied = await copyText(allCommands)
  appendLog(copied ? 'info' : 'stderr', copied ? `[info] 已复制 ${preset.label} ${preset.points.length} 组命令。\n` : `[error] 复制 ${preset.label} 命令失败。\n`, CONSOLE_LOG_KEY)
}

const openLocalPath = async (path) => {
  try {
    const res = await $fetch('/api/system/open', {
      method: 'POST',
      body: { path },
    })
    if (!res?.success) {
      appendLog('stderr', `[error] 打开本地路径失败：${res?.error || path}\n`)
    }
  } catch (error) {
    appendLog('stderr', `[error] 打开本地路径失败：${getErrorMessage(error, '未知错误')}\n`)
  }
}

const openLocalPathFolder = async (path) => {
  try {
    const res = await $fetch('/api/system/open', {
      method: 'POST',
      body: { path, mode: 'folder' },
    })
    if (!res?.success) {
      appendLog('stderr', `[error] 打开所在文件夹失败：${res?.error || path}\n`)
    }
  } catch (error) {
    appendLog('stderr', `[error] 打开所在文件夹失败：${getErrorMessage(error, '未知错误')}\n`)
  }
}

const startTerminalRun = (runLogKey, startLine, payload) => {
  appendLog('info', startLine, runLogKey)
  isRunning.value = true

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProtocol}//${window.location.host}/ws/terminal`
  
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    ws.send(JSON.stringify(payload))
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.type === 'stdout' || data.type === 'stderr') {
      appendLog(data.type, data.data, runLogKey)
    } else if (data.type === 'error') {
      appendLog('stderr', `\n${data.data}`, runLogKey)
    } else if (data.type === 'end') {
      appendLog('info', '\n✓ Process exited with code ' + data.exitCode, runLogKey)
      isRunning.value = false
      if (data.exitCode === 0 && isCvarScriptPath(runLogKey)) {
        loadCvars({ notify: true })
      }
      if (ws) ws.close()
    }
  }

  ws.onerror = () => {
    appendLog('stderr', `\nWebSocket error: ${wsUrl}`, runLogKey)
    isRunning.value = false
  }

  ws.onclose = () => {
    isRunning.value = false
  }
}

const runScript = () => {
  if (!selectedScript.value) return
  const runScriptPath = selectedScript.value.path
  const runScriptName = selectedScript.value.path.split(/[\\/]/).pop()

  if (isScriptDirty.value) {
    appendLog('stderr', '[warning] 脚本有未保存修改，请先保存后再运行。\n', runScriptPath)
    return
  }

  const args = buildScriptArgs()
  if (!args) return

  persistSelectedScriptParams()
  startTerminalRun(runScriptPath, '▶ Starting: ' + runScriptName + '\n', {
    action: 'run',
    script: runScriptPath,
    args,
  })
}

const runConsoleCommand = () => {
  const command = consoleCommand.value.trim()
  if (!command) {
    appendLog('stderr', '[error] 请输入要执行的 Console 命令。\n', CONSOLE_LOG_KEY)
    return
  }

  persistConsoleSettings()
  const packageName = consolePackageName.value.trim() || 'com.tencent.tmgp.pubgmhd'
  const deviceText = consoleDeviceSerial.value.trim() || '默认设备'
  startTerminalRun(CONSOLE_LOG_KEY, `▶ UE Console: ${command}\n[pkg] ${packageName}\n[device] ${deviceText}\n`, {
    action: 'run',
    mode: 'ue-console',
    command,
    packageName,
    deviceSerial: consoleDeviceSerial.value.trim(),
    requireProcess: consoleRequireProcess.value,
  })
}

const runCurrent = () => {
  if (activeMode.value === 'console') {
    runConsoleCommand()
    return
  }

  runScript()
}

const stopScript = async () => {
  if (ws) {
    ws.send(JSON.stringify({ action: 'terminate' }))
  }
  try {
    await $fetch('/api/scripts/terminate', { method: 'POST' })
  } catch(e) {}
  
  isRunning.value = false
}

onMounted(() => {
  loadParamStore()
  loadConsoleState()
  loadConsoleMapPointPresets()
  loadConsoleCommands()
  loadScripts()
})

watch(scriptParamValues, () => {
  persistSelectedScriptParams()
}, { deep: true })

watch(consoleCommand, (command, previousCommand) => {
  const commandKey = normalizeConsoleCommandKey(command)
  if (commandKey === normalizeConsoleCommandKey(previousCommand)) return

  const historyItem = normalizeConsoleHistory(consoleHistory.value).find((item) => item.commandKey === commandKey)
  consoleHistoryTagInput.value = historyItem ? formatConsoleHistoryTags(historyItem.tags) : ''
})

watch([consolePackageName, consoleDeviceSerial, consoleRequireProcess, consoleCommand, consoleHistoryTagInput, consoleCommandLocalPath], () => {
  persistConsoleSettings()
})
</script>

<style scoped>
/* Page-specific overrides for scripts if needed */
.page-grid {
  display: grid;
  min-width: 0;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 24px;
  height: calc(100vh - 150px);
}

.script-list-header {
  gap: 12px;
}

.mode-segment {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
}

.mode-segment button {
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  color: var(--text-secondary);
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.mode-segment button.active {
  color: #071318;
  background: var(--accent-default);
}

.empty-hint {
  color: var(--text-secondary);
  padding: 16px;
  text-align: center;
}

.console-history-list {
  gap: 12px;
}

.console-history-group {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.console-history-group-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 10px 4px;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
}

.console-history-item {
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 6px;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: grab;
}

.console-history-item:hover,
.console-history-item:focus-within,
.console-history-item.active {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.04);
}

.console-history-item.editing {
  background: rgba(96, 205, 255, 0.06);
}

.console-history-item.dragging {
  cursor: grabbing;
  opacity: 0.52;
}

.console-history-item.drop-before::before,
.console-history-item.drop-after::after {
  position: absolute;
  left: 10px;
  right: 10px;
  height: 2px;
  border-radius: 999px;
  background: var(--accent-default);
  box-shadow: 0 0 12px rgba(96, 205, 255, 0.44);
  content: "";
}

.console-history-item.drop-before::before {
  top: -4px;
}

.console-history-item.drop-after::after {
  bottom: -4px;
}

.history-drag-handle {
  display: inline-flex;
  width: 28px;
  flex: 0 0 28px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 3px;
  margin: 6px 0 6px 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-tertiary);
  background: transparent;
}

.history-drag-handle:hover,
.history-drag-handle:focus-visible {
  border-color: rgba(96, 205, 255, 0.2);
  color: #b7ecff;
  background: rgba(96, 205, 255, 0.08);
}

.history-drag-handle span {
  width: 12px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
}

.history-select-btn {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  padding: 10px 0 10px 12px;
  border: 0;
  color: var(--text-secondary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.history-actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  padding-right: 6px;
}

.history-tag-edit-btn,
.history-delete-btn {
  flex: 0 0 auto;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.history-tag-edit-btn {
  border: 1px solid rgba(96, 205, 255, 0.2);
  color: #9de5ff;
  background: rgba(96, 205, 255, 0.08);
}

.history-tag-edit-btn:hover {
  border-color: rgba(96, 205, 255, 0.44);
  color: #d8f7ff;
  background: rgba(96, 205, 255, 0.14);
}

.history-delete-btn {
  border: 1px solid rgba(248, 113, 113, 0.18);
  color: #fca5a5;
  background: rgba(127, 29, 29, 0.08);
}

.history-delete-btn:hover {
  border-color: rgba(248, 113, 113, 0.42);
  color: #fecaca;
  background: rgba(127, 29, 29, 0.22);
}

.history-command,
.history-meta,
.history-tag {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-command {
  color: inherit;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
}

.history-meta {
  color: var(--text-tertiary);
  font-size: 11px;
}

.history-tags {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 4px;
}

.history-tag {
  max-width: 118px;
  padding: 2px 6px;
  border: 1px solid rgba(96, 205, 255, 0.18);
  border-radius: 999px;
  color: #b7ecff;
  background: rgba(96, 205, 255, 0.08);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.35;
}

.history-tag-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 6px;
  width: 100%;
  padding: 0 6px 8px 12px;
}

.history-tag-input {
  min-width: 0;
  height: 28px;
  font-size: 12px;
}

.script-param-panel {
  padding: 14px 16px;
  border-bottom: 1px solid var(--divider);
  background: rgba(255, 255, 255, 0.015);
}

.script-param-project-row {
  display: grid;
  grid-template-columns: 120px minmax(260px, 420px);
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.script-param-row {
  display: grid;
  grid-template-columns: 120px minmax(260px, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.script-param-project-row label,
.script-param-label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.script-param-project-input {
  min-width: 0;
}

.script-param-input {
  width: 100%;
  min-width: 0;
}

.script-param-switch {
  display: inline-flex;
  width: fit-content;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.18);
  font-size: 12px;
  font-weight: 700;
}

.script-param-switch input {
  width: 15px;
  height: 15px;
}

.script-param-spacer {
  width: 1px;
}

.script-param-hint {
  margin-top: 8px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.terminal-panel {
  min-width: 0;
  overflow: hidden;
}

.script-runner-header {
  align-items: center;
  gap: 16px;
  min-height: 56px;
}

.script-title-stack {
  display: flex;
  flex: 1;
  min-width: 180px;
  flex-direction: column;
  gap: 4px;
}

.script-title {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.script-save-state {
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 600;
}

.script-save-state.dirty {
  color: #fbbf24;
}

.script-command-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  overflow-x: auto;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.18);
}

.command-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 32px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.command-btn svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.command-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.command-btn:active:not(:disabled) {
  transform: translateY(0);
}

.command-btn:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.command-primary {
  min-width: 78px;
  border-color: rgba(96, 205, 255, 0.32);
  color: #071318;
  background: linear-gradient(180deg, #77d9ff 0%, #4bbdea 100%);
  box-shadow: 0 8px 20px rgba(75, 189, 234, 0.22);
}

.command-primary:hover:not(:disabled) {
  border-color: rgba(154, 230, 255, 0.74);
  background: linear-gradient(180deg, #92e4ff 0%, #5cc7f0 100%);
}

.command-danger {
  min-width: 74px;
  border-color: rgba(255, 153, 164, 0.2);
  color: #ffb4bd;
  background: rgba(255, 153, 164, 0.1);
}

.command-danger:hover:not(:disabled) {
  background: rgba(255, 153, 164, 0.17);
}

.command-ghost {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.035);
}

.command-ghost:hover:not(:disabled) {
  border-color: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.075);
}

.command-save {
  border-color: rgba(108, 203, 95, 0.3);
  color: #d8ffd2;
  background: rgba(108, 203, 95, 0.12);
}

.command-save:hover:not(:disabled) {
  background: rgba(108, 203, 95, 0.18);
}

.command-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.08);
}

.command-btn.compact {
  height: 28px;
  padding: 0 11px;
}

.icon-text {
  padding-left: 10px;
}

.console-panel {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
  min-height: 360px;
  max-height: 70vh;
  flex-direction: column;
  gap: 12px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 14px;
  border-bottom: 1px solid var(--divider);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.018), rgba(255, 255, 255, 0.006));
}

.console-row {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(180px, 1fr) auto minmax(160px, 0.72fr) auto;
  gap: 10px;
  align-items: center;
}

.console-row label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.console-package-input,
.console-device-input {
  min-width: 0;
  width: 100%;
}

.console-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.console-checkbox input {
  width: 15px;
  height: 15px;
  accent-color: var(--accent-default);
}

.console-command-input {
  flex: 0 0 116px;
  min-height: 116px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  outline: none;
  resize: vertical;
  color: #e8e8e8;
  background: #101010;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
  tab-size: 2;
}

.console-command-input:focus {
  border-color: rgba(96, 205, 255, 0.55);
  box-shadow: 0 0 0 1px rgba(96, 205, 255, 0.28);
}

.console-tool-tabs,
.console-map-preset-tabs {
  display: inline-flex;
  width: max-content;
  max-width: 100%;
  gap: 2px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
}

.console-tool-tab,
.console-map-preset-tab {
  border: 0;
  border-radius: 6px;
  padding: 7px 12px;
  color: var(--text-tertiary);
  background: transparent;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.console-tool-tab:hover,
.console-tool-tab.active,
.console-map-preset-tab:hover,
.console-map-preset-tab.active {
  color: #101217;
  background: #9f7cff;
}

.console-manual-panel {
  min-height: 0;
}

.console-manual-panel .console-command-input {
  width: 100%;
}

.console-preset-page {
  display: flex;
  width: 100%;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  overflow: visible;
  padding: 12px;
  border: 1px solid rgba(96, 205, 255, 0.12);
  border-radius: 8px;
  background: rgba(7, 18, 24, 0.62);
}

.console-preset-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.console-map-preset-tabs {
  width: 100%;
  overflow-x: auto;
}

.console-map-manager {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(180px, 0.8fr) auto auto;
  gap: 8px;
  align-items: end;
}

.console-map-manager label,
.console-map-importer label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: var(--text-tertiary);
  font-size: 11px;
  font-weight: 800;
}

.console-map-select,
.console-map-name-input {
  min-width: 0;
}

.console-map-import-details {
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
}

.console-map-import-details summary {
  padding: 8px 10px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.console-map-importer {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(260px, 1fr) minmax(220px, 0.6fr);
  gap: 8px;
  align-items: stretch;
  padding: 0 10px 10px;
}

.console-map-import-input {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 7px;
  outline: none;
  resize: vertical;
  color: #d8e7ed;
  background: #101010;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 11px;
  line-height: 1.45;
}

.console-map-import-actions {
  display: grid;
  min-width: 0;
  grid-template-columns: 1fr;
  gap: 7px;
}

.console-map-error {
  overflow: hidden;
  color: #ffb4bd;
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console-preset-title-group {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.console-preset-title {
  color: #dff6ff;
  font-size: 13px;
  font-weight: 800;
}

.console-preset-meta {
  overflow: hidden;
  color: var(--text-tertiary);
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a5-point-grid {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
  min-height: 96px;
  max-height: 150px;
  overflow: auto;
  padding-right: 2px;
}

.a5-point-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
}

.a5-point-empty {
  grid-column: 1 / -1;
  display: flex;
  min-height: 78px;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border: 1px dashed rgba(96, 205, 255, 0.22);
  border-radius: 8px;
  color: var(--text-tertiary);
  background: rgba(255, 255, 255, 0.02);
  font-size: 12px;
  text-align: center;
}

.a5-point-card:hover,
.a5-point-card:focus-within {
  border-color: rgba(96, 205, 255, 0.32);
  background: rgba(96, 205, 255, 0.07);
}

.a5-point-head {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px 7px;
  padding: 10px;
  border: 0;
  color: var(--text-secondary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.a5-point-head:hover,
.a5-point-head.active {
  color: var(--text-primary);
  background: rgba(96, 205, 255, 0.08);
}

.a5-point-tag {
  color: #9de5ff;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  font-weight: 800;
}

.a5-point-label {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a5-point-coords {
  grid-column: 1 / -1;
  overflow: hidden;
  color: var(--text-tertiary);
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a5-selected-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(96, 205, 255, 0.2);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.24);
}

.a5-selected-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.a5-selected-title span:last-child {
  overflow: hidden;
  color: var(--text-tertiary);
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.a5-selected-command {
  display: grid;
  min-width: 0;
  grid-template-columns: 72px minmax(0, 1fr) 88px;
  gap: 8px;
  align-items: stretch;
}

.a5-selected-command label {
  display: inline-flex;
  align-items: center;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
}

.a5-command-input {
  min-width: 0;
  padding: 8px 9px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 7px;
  outline: none;
  resize: none;
  color: #d8e7ed;
  background: #101010;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 11px;
  line-height: 1.35;
  cursor: text;
}

.a5-command-input:focus {
  border-color: rgba(96, 205, 255, 0.45);
  box-shadow: 0 0 0 1px rgba(96, 205, 255, 0.18);
}

.a5-command-run {
  border: 1px solid rgba(108, 203, 95, 0.24);
  border-radius: 7px;
  padding: 0 8px;
  color: #d8ffd2;
  font-size: 11px;
  font-weight: 800;
  background: rgba(108, 203, 95, 0.1);
  cursor: pointer;
}

.a5-command-run.capture {
  border-color: rgba(96, 205, 255, 0.22);
  color: #dff6ff;
  background: rgba(96, 205, 255, 0.1);
}

.a5-command-run:hover:not(:disabled) {
  color: #f0ffed;
  background: rgba(108, 203, 95, 0.18);
}

.a5-command-run.capture:hover:not(:disabled) {
  color: #ffffff;
  background: rgba(96, 205, 255, 0.18);
}

.a5-command-run:disabled {
  cursor: not-allowed;
  opacity: 0.44;
}

.console-tag-row {
  display: grid;
  grid-template-columns: auto minmax(240px, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.console-tag-row label {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.console-tag-input {
  min-width: 0;
}

.console-tag-hint {
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console-suggestion-popover {
  position: absolute;
  left: 14px;
  right: 14px;
  top: 106px;
  z-index: 10;
  display: flex;
  max-height: 260px;
  flex-direction: column;
  overflow-y: auto;
  border: 1px solid rgba(96, 205, 255, 0.25);
  border-radius: 8px;
  background: rgba(18, 18, 18, 0.98);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.42);
}

.console-suggestion-item {
  display: grid;
  grid-template-columns: minmax(220px, 0.38fr) minmax(260px, 1fr);
  gap: 12px;
  align-items: center;
  padding: 7px 10px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.045);
  color: var(--text-secondary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.console-suggestion-item:last-child {
  border-bottom: 0;
}

.console-suggestion-item.active {
  color: #071318;
  background: var(--accent-default);
}

.console-suggestion-item:hover:not(.active) {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.console-suggestion-item:focus {
  outline: none;
}

.suggestion-name {
  overflow: hidden;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggestion-desc {
  overflow: hidden;
  color: inherit;
  font-size: 12px;
  opacity: 0.82;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console-sync-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.console-sync-state {
  flex: 0 1 260px;
  min-width: 0;
  overflow: hidden;
  color: var(--text-tertiary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console-sync-state.error {
  color: #ffb4bd;
}

.console-local-path-input {
  flex: 1 1 360px;
  min-width: 220px;
}

.script-editor-panel {
  display: flex;
  flex: 0 0 34%;
  min-height: 210px;
  flex-direction: column;
  border-bottom: 1px solid var(--divider);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.018), rgba(255, 255, 255, 0.006));
}

.script-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
}

.script-editor-title-group {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.script-editor-title {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
}

.script-editor-meta {
  color: var(--text-tertiary);
  font-size: 11px;
}

.script-editor-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.script-editor {
  flex: 1;
  width: 100%;
  min-height: 150px;
  padding: 12px 14px;
  border: 0;
  outline: none;
  resize: vertical;
  color: #e8e8e8;
  background: #101010;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
  tab-size: 2;
}

.script-editor:focus {
  box-shadow: inset 0 0 0 1px rgba(96, 205, 255, 0.35);
}

.cvar-viewer-panel {
  display: flex;
  flex: 0 0 30%;
  min-height: 210px;
  flex-direction: column;
  border-bottom: 1px solid var(--divider);
  background: rgba(8, 12, 14, 0.48);
}

.cvar-viewer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
}

.script-editor-meta.error {
  color: #ffb4bd;
}

.cvar-viewer-actions {
  display: flex;
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
  gap: 8px;
}

.cvar-filter-input {
  width: min(360px, 34vw);
  min-width: 180px;
}

.cvar-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.cvar-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
}

.cvar-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
  color: var(--text-secondary);
  background: #15191b;
}

.cvar-table th,
.cvar-table td {
  overflow: hidden;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.045);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cvar-index-col {
  width: 74px;
  color: var(--text-tertiary);
}

.cvar-name {
  color: #dff6ff;
}

.cvar-value {
  width: 210px;
  color: #d8ffd2;
}

.cvar-empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 18px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
}

@media (max-width: 900px) {
  .script-param-project-row,
  .script-param-row,
  .console-row,
  .console-tag-row,
  .console-map-manager,
  .console-map-importer,
  .a5-selected-command {
    grid-template-columns: 1fr;
  }

  .script-runner-header,
  .script-editor-head,
  .cvar-viewer-head {
    align-items: stretch;
    flex-direction: column;
  }

  .script-command-bar,
  .script-editor-actions,
  .cvar-viewer-actions {
    width: 100%;
  }

  .cvar-filter-input {
    width: 100%;
  }
}

.terminal {
  flex: 1;
  min-height: 140px;
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}

.terminal :deep(*) {
  user-select: text;
  -webkit-user-select: text;
  white-space: pre-wrap;
}

.terminal-line {
  white-space: pre-wrap;
}

.terminal-path-link {
  display: inline;
  padding: 0 2px;
  border: 0;
  border-radius: 3px;
  color: var(--accent-default);
  background: rgba(96, 205, 255, 0.12);
  font: inherit;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.terminal-path-link:hover {
  color: #071318;
  background: var(--accent-default);
}
</style>
