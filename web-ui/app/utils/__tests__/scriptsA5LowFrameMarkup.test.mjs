import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const scriptsPage = fs.readFileSync(
  fileURLToPath(new URL('../../pages/scripts.vue', import.meta.url)),
  'utf8',
)

const presetStart = scriptsPage.indexOf('aria-label="A5低帧点"')
assert(presetStart >= 0, 'A5 low-frame preset section should exist')

const presetEnd = scriptsPage.indexOf('</section>', scriptsPage.indexOf('class="a5-selected-panel"', presetStart))
const presetBlock = scriptsPage.slice(presetStart, presetEnd)

assert.match(presetBlock, /class="a5-selected-panel"/)
assert.match(presetBlock, /传送命令/)
assert.match(presetBlock, /抓帧命令/)
assert.match(presetBlock, /selectedA5TeleportCommand/)
assert.match(presetBlock, /selectedA5CaptureFrameCommand/)
assert.match(presetBlock, /runA5LowFrameSelectedCommand\('teleport'\)/)
assert.match(presetBlock, /runA5LowFrameSelectedCommand\('capture'\)/)
assert.doesNotMatch(presetBlock, /class="a5-command-box"/)
assert.doesNotMatch(presetBlock, /class="a5-point-copy"/)

const manualStart = scriptsPage.indexOf('class="console-manual-details"')
assert(manualStart > presetStart, 'manual console input should be below the A5 dedicated panel')
