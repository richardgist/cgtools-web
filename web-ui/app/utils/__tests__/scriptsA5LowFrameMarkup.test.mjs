import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const scriptsPage = fs.readFileSync(
  fileURLToPath(new URL('../../pages/scripts.vue', import.meta.url)),
  'utf8',
)

assert.match(scriptsPage, /const consoleToolTab = ref\('manual'\)/)
assert.match(scriptsPage, /consoleToolTab === 'manual'/)
assert.match(scriptsPage, /consoleToolTab === 'map-points'/)
assert.match(scriptsPage, /手动命令/)
assert.match(scriptsPage, /地图点位/)
assert.match(scriptsPage, /新增地图/)
assert.match(scriptsPage, /删除地图/)
assert.match(scriptsPage, /更新当前地图/)
assert.match(scriptsPage, /生成新地图/)
assert.match(scriptsPage, /mapPointImportText/)
assert.match(scriptsPage, /CONSOLE_MAP_POINT_PRESETS_STORAGE_KEY/)

const manualStart = scriptsPage.indexOf('aria-label="手动 Console 命令"')
assert(manualStart >= 0, 'manual console command panel should be the default tab content')

const manualEnd = scriptsPage.indexOf('</section>', manualStart)
const suggestionStart = scriptsPage.indexOf('class="console-suggestion-popover"', manualStart)
assert(
  suggestionStart > manualStart && suggestionStart < manualEnd,
  'console suggestions should render directly under the manual command input',
)

const mapGateStart = scriptsPage.indexOf('v-if="consoleToolTab === \'map-points\'"')
assert(mapGateStart >= 0, 'map-point preset section should be gated by the map-points tab')

const presetStart = scriptsPage.indexOf('class="console-preset-page"', mapGateStart)
assert(presetStart > mapGateStart, 'A5 low-frame preset section should render only inside the map-points tab')

const presetEnd = scriptsPage.indexOf('</section>', scriptsPage.indexOf('class="a5-selected-panel"', presetStart))
const presetBlock = scriptsPage.slice(presetStart, presetEnd)

assert.match(presetBlock, /class="a5-selected-panel"/)
assert.match(presetBlock, /selectedConsoleMapPointPreset\.label/)
assert.match(presetBlock, /selectedConsoleMapPointPreset\.meta/)
assert.match(presetBlock, /传送命令/)
assert.match(presetBlock, /抓帧命令/)
assert.match(presetBlock, /selectedA5TeleportCommand/)
assert.match(presetBlock, /selectedA5CaptureFrameCommand/)
assert.match(presetBlock, /runA5LowFrameSelectedCommand\('teleport'\)/)
assert.match(presetBlock, /runA5LowFrameSelectedCommand\('capture'\)/)
assert.doesNotMatch(presetBlock, /class="a5-command-box"/)
assert.doesNotMatch(presetBlock, /class="a5-point-copy"/)
assert(manualStart < mapGateStart, 'manual console input should remain separate from map-point presets')

assert.match(scriptsPage, /\.page-grid\s*{[^}]*grid-template-columns:\s*420px minmax\(0,\s*1fr\)/s)
assert.match(scriptsPage, /\.terminal-panel\s*{[^}]*min-width:\s*0/s)
assert.match(scriptsPage, /\.console-panel\s*{[^}]*flex:\s*0 0 auto/s)
assert.match(scriptsPage, /\.console-panel\s*{[^}]*max-height:\s*70vh/s)
assert.match(scriptsPage, /\.console-panel\s*{[^}]*overflow-x:\s*hidden/s)
assert.match(scriptsPage, /\.console-panel\s*{[^}]*overflow-y:\s*auto/s)
assert.doesNotMatch(scriptsPage, /\.console-suggestion-popover\s*{[^}]*position:\s*absolute/s)
assert.doesNotMatch(scriptsPage, /\.console-suggestion-popover\s*{[^}]*top:\s*106px/s)
assert.match(scriptsPage, /\.a5-point-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(150px,\s*1fr\)\)/s)
assert.match(scriptsPage, /\.a5-point-grid\s*{[^}]*min-height:\s*96px/s)
