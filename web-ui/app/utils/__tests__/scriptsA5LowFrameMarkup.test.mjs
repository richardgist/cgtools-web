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

const manualStart = scriptsPage.indexOf('aria-label="手动 Console 命令"')
assert(manualStart >= 0, 'manual console command panel should be the default tab content')

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
