import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const scriptsPage = fs.readFileSync(
  fileURLToPath(new URL('../scripts.vue', import.meta.url)),
  'utf8',
)

const itemStart = scriptsPage.indexOf('class="console-history-item"')
const handleStart = scriptsPage.indexOf('class="history-drag-handle"')
assert(itemStart >= 0, 'console history item markup should exist')
assert(handleStart > itemStart, 'drag handle should stay inside the history item')

const itemBlock = scriptsPage.slice(itemStart, handleStart)
const handleBlock = scriptsPage.slice(handleStart, scriptsPage.indexOf('</button>', handleStart))

assert.match(itemBlock, /:draggable="editingConsoleHistoryId !== item\.id"/)
assert.match(itemBlock, /@dragstart\.stop="startConsoleHistoryDrag\(\$event, item\)"/)
assert.match(itemBlock, /@dragend="finishConsoleHistoryDrag"/)
assert.doesNotMatch(handleBlock, /draggable="true"/)
assert.doesNotMatch(handleBlock, /@dragstart/)
