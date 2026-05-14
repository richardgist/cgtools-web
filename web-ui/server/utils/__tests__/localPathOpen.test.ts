import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveOpenTargetPath } from '../localPathOpen'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgtools-open-path-'))
const filePath = path.join(tempDir, 'LatestStats.ue4stats')
fs.writeFileSync(filePath, 'stats')

assert.equal(resolveOpenTargetPath(filePath, 'path'), filePath)
assert.equal(resolveOpenTargetPath(filePath, 'folder'), tempDir)
assert.equal(resolveOpenTargetPath(tempDir, 'folder'), tempDir)
assert.equal(resolveOpenTargetPath(path.join(tempDir, 'missing.ue4stats'), 'folder'), tempDir)
