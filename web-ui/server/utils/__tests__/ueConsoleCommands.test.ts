import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  filterConsoleCommandSuggestions,
  loadConsoleCommandSnapshotFromPath,
  parseConsoleCommandCsv,
} from '../ueConsoleCommands'

const csv = [
  'Name,Help,Flags',
  '"grass.HeightScale","Scale grass height",0',
  'grass.HeightScaleEnableAll,Enable grass scaling,0',
  'stat units,Show frame timing,0',
  'stat unit,Typo-like nearby command,0',
  'Name,Duplicated header should be ignored,Flags',
].join('\n')

const parsed = parseConsoleCommandCsv(csv)
assert.deepEqual(
  parsed.map((item) => item.name),
  ['grass.HeightScale', 'grass.HeightScaleEnableAll', 'stat units', 'stat unit'],
)

const grassMatches = filterConsoleCommandSuggestions(parsed, 'grass.')
assert.equal(grassMatches[0].name, 'grass.HeightScale')
assert.equal(grassMatches[1].name, 'grass.HeightScaleEnableAll')

const statMatches = filterConsoleCommandSuggestions(parsed, 'sta')
assert.deepEqual(statMatches.map((item) => item.name), ['stat units', 'stat unit'])

const indexedCsv = [
  'Index,Name,Value',
  '0,r.DumpingMovie,0',
  '1,VisualizeTexture,null',
  '2294,r.Landscape.EnableCombineSectionStrategy,0',
].join('\n')

const indexedParsed = parseConsoleCommandCsv(indexedCsv)
assert.deepEqual(
  indexedParsed.map((item) => item.name),
  ['r.DumpingMovie', 'VisualizeTexture', 'r.Landscape.EnableCombineSectionStrategy'],
)

const landscapeMatches = filterConsoleCommandSuggestions(indexedParsed, 'r.land')
assert.deepEqual(landscapeMatches.map((item) => item.name), ['r.Landscape.EnableCombineSectionStrategy'])

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgtools-cvar-'))
const localCsvPath = path.join(tempDir, 'CVarList.csv')
fs.writeFileSync(localCsvPath, csv, 'utf-8')

const localSnapshot = loadConsoleCommandSnapshotFromPath(localCsvPath)
assert.equal(localSnapshot.sourcePath, localCsvPath)
assert.deepEqual(
  localSnapshot.commands.map((item) => item.name),
  ['grass.HeightScale', 'grass.HeightScaleEnableAll', 'stat units', 'stat unit'],
)
