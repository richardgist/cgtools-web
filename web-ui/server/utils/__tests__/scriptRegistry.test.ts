import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { listManagedScripts } from '../scriptRegistry.ts'

const statsPullScriptName = 'pull_latest_stats.ps1'
const statsPullScriptPath = path.resolve(process.cwd(), '../scripts', statsPullScriptName)
const savedPullScriptName = 'pull_saved_dir.ps1'
const savedPullScriptPath = path.resolve(process.cwd(), '../scripts', savedPullScriptName)
const savedLogsPullScriptName = 'pull_saved_logs.ps1'
const savedLogsPullScriptPath = path.resolve(process.cwd(), '../scripts', savedLogsPullScriptName)

const scripts = listManagedScripts()
const statsPullScript = scripts.find((script) => script.name === statsPullScriptName)
const savedPullScript = scripts.find((script) => script.name === savedPullScriptName)
const savedLogsPullScript = scripts.find((script) => script.name === savedLogsPullScriptName)

assert(fs.existsSync(statsPullScriptPath), `${statsPullScriptName} should exist in the built-in scripts directory`)
assert.equal(statsPullScript?.type, 'ps1')
assert.equal(statsPullScript?.path, statsPullScriptPath)
assert(statsPullScript?.params?.some((param) => (
  param.key === 'p4Client'
  && param.argName === '-P4Client'
  && param.label === 'P4 Client'
)), 'pull_latest_stats.ps1 should expose P4Client for project-specific P4 workspace config')
assert(statsPullScript?.params?.some((param) => (
  param.key === 'localDir'
  && param.placeholder === '默认保存到 PerformanceData/Stats'
)), 'pull_latest_stats.ps1 should default pulled stats into the unified performance data directory')

const statsPullScriptContent = fs.readFileSync(statsPullScriptPath, 'utf-8')
assert(statsPullScriptContent.includes("Split-Path -Parent $PSScriptRoot"), 'pull_latest_stats.ps1 should resolve its default output from the repo root')
assert(statsPullScriptContent.includes("Join-Path $repoRoot 'PerformanceData'"), 'pull_latest_stats.ps1 should use PerformanceData as the default output root')

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
  && param.placeholder === '默认保存到 PerformanceData/Saved'
)), 'pull_saved_dir.ps1 should expose a friendly local save directory parameter')

const savedPullScriptContent = fs.readFileSync(savedPullScriptPath, 'utf-8')
assert(savedPullScriptContent.includes("Split-Path -Parent $PSScriptRoot"), 'pull_saved_dir.ps1 should resolve its default output from the repo root')
assert(savedPullScriptContent.includes("Join-Path $repoRoot 'PerformanceData'"), 'pull_saved_dir.ps1 should use PerformanceData as the default output root')

assert(fs.existsSync(savedLogsPullScriptPath), `${savedLogsPullScriptName} should exist in the built-in scripts directory`)
assert.equal(savedLogsPullScript?.type, 'ps1')
assert.equal(savedLogsPullScript?.path, savedLogsPullScriptPath)
assert.deepEqual(savedLogsPullScript?.params?.map((param) => param.key), [
  'packageName',
  'projectName',
  'deviceSerial',
  'localDir',
])
assert(savedLogsPullScript?.params?.some((param) => (
  param.key === 'localDir'
  && param.argName === '-LocalDir'
  && param.label === '保存目录'
  && param.placeholder === '默认保存到 PerformanceData/Logs'
)), 'pull_saved_logs.ps1 should expose a friendly local save directory parameter')

const savedLogsPullScriptContent = fs.readFileSync(savedLogsPullScriptPath, 'utf-8')
assert(savedLogsPullScriptContent.includes("Split-Path -Parent $PSScriptRoot"), 'pull_saved_logs.ps1 should resolve its default output from the repo root')
assert(savedLogsPullScriptContent.includes("Join-Path $repoRoot 'PerformanceData'"), 'pull_saved_logs.ps1 should use PerformanceData as the default output root')
assert(savedLogsPullScriptContent.includes('/Saved/Logs'), 'pull_saved_logs.ps1 should pull the Saved/Logs directory rather than the whole Saved tree')

const logsPullScriptNames = ['pull_game_logs.bat', 'pull_cvar.bat']
for (const scriptName of logsPullScriptNames) {
  const scriptContent = fs.readFileSync(path.resolve(process.cwd(), '../scripts', scriptName), 'utf-8')
  assert(scriptContent.includes('set "LOCAL_DIR=%REPO_ROOT%\\PerformanceData\\Logs"'), `${scriptName} should default pulled logs into the unified performance data directory`)
  assert(!scriptContent.includes('set LOCAL_DIR=%~dp0Logs'), `${scriptName} should not save Logs under scripts by default`)
}

const updateAllReposScript = scripts.find((script) => script.name === 'Update-AllRepos.ps1')
assert.deepEqual(updateAllReposScript?.params?.map((param) => param.key), [
  'rootPath',
  'p4Client',
  'svnOnly',
  'p4Only',
  'p4Latest',
  'conflictAbort',
])
assert(updateAllReposScript?.params?.some((param) => (
  param.key === 'p4Client'
  && param.argName === '-P4Client'
  && param.label === 'P4 Client'
)), 'Update-AllRepos.ps1 should expose P4Client for project-specific P4 workspace config')
