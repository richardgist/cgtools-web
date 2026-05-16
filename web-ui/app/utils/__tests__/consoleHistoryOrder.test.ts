import assert from 'node:assert/strict'

const { moveConsoleHistoryItem } = await import(new URL('../consoleHistoryOrder.ts', import.meta.url).href)

const history = [
  { id: 'capture', command: 'stat startfile' },
  { id: 'fsoc', command: 'r.FSOC.MinDiffViewLocation -1' },
  { id: 'terrain', command: 'Terrain.FSOCOcclusionWeight 999' },
  { id: 'csv', command: 'csvhelper stopss' },
]

const pickIds = (items: typeof history) => items.map((item) => item.id)

assert.deepEqual(
  pickIds(moveConsoleHistoryItem(history, 'terrain', 'capture', 'before') as typeof history),
  ['terrain', 'capture', 'fsoc', 'csv'],
)

assert.deepEqual(
  pickIds(moveConsoleHistoryItem(history, 'capture', 'csv', 'after') as typeof history),
  ['fsoc', 'terrain', 'csv', 'capture'],
)

assert.deepEqual(
  pickIds(moveConsoleHistoryItem(history, 'fsoc', 'fsoc', 'before') as typeof history),
  ['capture', 'fsoc', 'terrain', 'csv'],
)
