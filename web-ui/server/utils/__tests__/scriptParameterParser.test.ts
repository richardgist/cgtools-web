import assert from 'node:assert/strict'
import { parsePowerShellParameters } from '../scriptParameterParser.ts'

const parameters = parsePowerShellParameters(`
[CmdletBinding()]
param(
    [string]$RootPath = "E:\\PUBGTrunk",

    [Alias('svn')]
    [switch]$SvnOnly,

    [Alias('p4')]
    [switch]$P4Only,

    [Alias('conflict-abort')]
    [switch]$ConflictAbort
)
`)

assert.deepEqual(parameters.map((param) => param.key), [
  'rootPath',
  'svnOnly',
  'p4Only',
  'conflictAbort',
])
assert.equal(parameters[0]?.type, 'folder')
assert.equal(parameters[0]?.defaultValue, 'E:\\PUBGTrunk')
assert.equal(parameters[0]?.argName, '-RootPath')
assert.equal(parameters[1]?.type, 'switch')
assert.equal(parameters[1]?.argName, '-SvnOnly')
assert.equal(parameters[1]?.aliases?.[0], 'svn')
assert.equal(parameters[3]?.aliases?.[0], 'conflict-abort')
