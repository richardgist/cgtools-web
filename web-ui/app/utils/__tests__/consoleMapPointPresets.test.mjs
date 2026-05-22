import assert from 'node:assert/strict'
import {
  createDefaultConsoleMapPointPresets,
  normalizeConsoleMapPointPresets,
  parseConsoleMapPointText,
} from '../consoleMapPointPresets.js'

const defaults = createDefaultConsoleMapPointPresets()
assert.equal(defaults.length, 1)
assert.equal(defaults[0].id, 'a5-low-frame')
assert.equal(defaults[0].label, 'A5低帧点')
assert.equal(defaults[0].points.length, 21)

const parsed = parseConsoleMapPointText(`
#低帧点1:
# Pointdata ="164727,91180,1905,0,6,5"
#2:水
# Pointdata = "227525,139456,3611,0,358,337"
#16高DC面数：
# Pointdata = "278420,145291,3655,0,0,207"
`)

assert.deepEqual(parsed.map((point) => point.tag), ['pos1', 'pos2', 'pos3'])
assert.deepEqual(parsed.map((point) => point.label), ['低帧点1', '水', '高DC面数'])
assert.deepEqual(parsed[1].coords, [227525, 139456, 3611, 0, 358, 337])

const normalized = normalizeConsoleMapPointPresets([
  { id: '', label: '测试地图', points: parsed },
  { id: 'empty', label: '', points: [] },
  { id: 'empty-map', label: '空地图', points: [] },
])

assert.equal(normalized.length, 2)
assert.equal(normalized[0].label, '测试地图')
assert.equal(normalized[0].points.length, 3)
assert.equal(normalized[1].label, '空地图')
assert.equal(normalized[1].points.length, 0)
