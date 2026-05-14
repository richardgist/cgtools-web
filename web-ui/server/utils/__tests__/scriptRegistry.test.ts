import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { listManagedScripts } from '../scriptRegistry.ts'

const statsPullScriptName = 'pull_latest_stats.ps1'
const statsPullScriptPath = path.resolve(process.cwd(), '../scripts', statsPullScriptName)
const savedPullScriptName = 'pull_saved_dir.ps1'
const savedPullScriptPath = path.resolve(process.cwd(), '../scripts', savedPullScriptName)

const scripts = listManagedScripts()
const statsPullScript = scripts.find((script) => script.name === statsPullScriptName)
const savedPullScript = scripts.find((script) => script.name === savedPullScriptName)

assert(fs.existsSync(statsPullScriptPath), `${statsPullScriptName} should exist in the built-in scripts directory`)
assert.equal(statsPullScript?.type, 'ps1')
assert.equal(statsPullScript?.path, statsPullScriptPath)
assert(statsPullScript?.params?.some((param) => (
  param.key === 'p4Client'
  && param.argName === '-P4Client'
  && param.label === 'P4 Client'
)), 'pull_latest_stats.ps1 should expose P4Client for project-specific P4 workspace config')

assert(fs.existsSync(savedPullScriptPath), `${savedPullScriptName} should exist in the built-in scripts directory`)
assert.equal(savedPullScript?.type, 'ps1')
assert.equal(savedPullScript?.path, savedPullScriptPath)
assert.deepEqual(savedPullScript?.params?.map((param) => param.key), [
  'packageName',
  'projectName',
  'deviceSerial',
  'localDir',
])
assert(savedPullScript?.params?.some((param) => (
  param.key === 'localDir'
  && param.argName === '-LocalDir'
  && param.label === '保存目录'
)), 'pull_saved_dir.ps1 should expose a friendly local save directory parameter')

const updateAllReposScript = scripts.find((script) => script.name === 'Update-AllRepos.ps1')
assert.deepEqual(updateAllReposScript?.params?.map((param) => param.key), [
  'rootPath',
  'p4Client',
  'svnOnly',
  'p4Only',
  'conflictAbort',
])
assert(updateAllReposScript?.params?.some((param) => (
  param.key === 'p4Client'
  && param.argName === '-P4Client'
  && param.label === 'P4 Client'
)), 'Update-AllRepos.ps1 should expose P4Client for project-specific P4 workspace config')
