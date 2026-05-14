import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_GAME_NAME,
  DEFAULT_PACKAGE_NAME,
  DEFAULT_PATCH_PREFIX,
  DEFAULT_PROJECT_ROOT,
  DEFAULT_PAK_TOOL_EXE,
  buildPakToolPaths,
  buildPakToolPathsFromProjectRoot,
  buildAndroidSavedPaksDir,
  createPakToolLaunchPlan,
  createPakPushPlan,
  extractRemotePakVersions,
  findLatestGeneratedPakPair,
  getPakToolStatus,
  normalizePakBaseName,
  parsePakVersionFromName,
} from '../pakToolPlus'

const expectedProjectRoot = 'E:\\CJGame\\trunk'
const expectedExe = 'E:\\CJGame\\trunk\\Survive\\Paktools\\CookAndPakAssetPlus\\PakToolPlus.exe'

assert.equal(DEFAULT_PROJECT_ROOT, expectedProjectRoot)
assert.equal(DEFAULT_PAK_TOOL_EXE, expectedExe)
assert.equal(DEFAULT_PATCH_PREFIX, 'tex_patch_')

const rootPaths = buildPakToolPathsFromProjectRoot(DEFAULT_PROJECT_ROOT)
assert.equal(rootPaths.projectRoot, expectedProjectRoot)
assert.equal(rootPaths.exePath, expectedExe)
assert.equal(rootPaths.toolDir, path.dirname(expectedExe))

const paths = buildPakToolPaths(DEFAULT_PAK_TOOL_EXE)
assert.equal(paths.projectRoot, expectedProjectRoot)
assert.equal(paths.exePath, expectedExe)
assert.equal(paths.toolDir, path.dirname(expectedExe))
assert.equal(paths.batPath, path.join(path.dirname(expectedExe), 'PakToolPlus.bat'))
assert.equal(paths.tempPaksDir, path.join(path.dirname(expectedExe), 'Temp', 'Paks'))

const launchPlan = createPakToolLaunchPlan(DEFAULT_PAK_TOOL_EXE)
assert.equal(launchPlan.cmd, expectedExe)
assert.deepEqual(launchPlan.args, [])
assert.equal(launchPlan.cwd, path.dirname(expectedExe))

const status = getPakToolStatus(DEFAULT_PAK_TOOL_EXE)
assert.equal(status.exePath, expectedExe)
assert.equal(status.detected.windows, process.platform === 'win32')
assert.equal(status.detected.projectRootExists, true, 'default project root should exist')
assert.equal(status.detected.exeExists, true, 'PakToolPlus.exe should exist at the configured default path')
assert.equal(status.detected.toolDirExists, true, 'PakToolPlus directory should exist')

assert.equal(
  buildAndroidSavedPaksDir(DEFAULT_PACKAGE_NAME, DEFAULT_GAME_NAME),
  '/sdcard/Android/data/com.tencent.tmgp.pubgmhd/files/UE4Game/ShadowTrackerExtra/ShadowTrackerExtra/Saved/Paks',
)
assert.equal(normalizePakBaseName('hotfix_test.pak'), 'tex_patch_hotfix_test')
assert.equal(normalizePakBaseName('game_patch_1.37.0.21089.pak'), 'tex_patch_1.37.0.21089')
assert.equal(normalizePakBaseName('tex_patch_ui_1.37.0.21089.pak'), 'tex_patch_ui_1.37.0.21089')
assert.throws(() => normalizePakBaseName('../bad'), /pak 名称不能包含路径分隔符/)
assert.equal(parsePakVersionFromName('game_patch_1.37.0.21089.pak'), '1.37.0.21089')
assert.equal(parsePakVersionFromName('enc_036_bszg_1.37.0.23089.pak'), '1.37.0.23089')
assert.equal(parsePakVersionFromName('game_patch_without_version.pak'), null)

const remoteVersions = extractRemotePakVersions([
  'game_patch_0.0.0.0.pak',
  'enc_036_bszg_1.37.0.23089.pak',
  'map_lobby_1.37.0.21089.pak',
  'map_audio_1.37.0.21089.pak',
  'game_patch_1.37.0.21089.sig',
  'game_patch_1.37.0.21089.pak',
  'readme.txt',
].join('\n'))
assert.equal(remoteVersions.latestVersion, '1.37.0.21089')
assert.equal(remoteVersions.selectedVersion, '1.37.0.21089')
assert.deepEqual(remoteVersions.pakFiles, [
  'game_patch_0.0.0.0.pak',
  'enc_036_bszg_1.37.0.23089.pak',
  'map_lobby_1.37.0.21089.pak',
  'map_audio_1.37.0.21089.pak',
  'game_patch_1.37.0.21089.pak',
])
assert.deepEqual(remoteVersions.versions.map((item) => item.version), [
  '1.37.0.21089',
  '1.37.0.23089',
  '0.0.0.0',
])
assert.deepEqual(remoteVersions.versions.map((item) => item.count), [3, 1, 1])

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgtools-pak-push-'))
const oldPak = path.join(tempDir, 'old_patch.pak')
const newPak = path.join(tempDir, 'game_patch_0.0.0.0.pak')
const newSig = path.join(tempDir, 'game_patch_0.0.0.0.sig')
fs.writeFileSync(oldPak, 'old')
fs.writeFileSync(newPak, 'pak')
fs.writeFileSync(newSig, 'sig')
const oldDate = new Date('2026-01-01T00:00:00Z')
const newDate = new Date('2026-01-02T00:00:00Z')
fs.utimesSync(oldPak, oldDate, oldDate)
fs.utimesSync(newPak, newDate, newDate)
fs.utimesSync(newSig, newDate, newDate)

const latestPair = findLatestGeneratedPakPair(tempDir)
assert.equal(latestPair.pakPath, newPak)
assert.equal(latestPair.sigPath, newSig)

const pushPlan = createPakPushPlan({
  tempPaksDir: tempDir,
  targetPakName: 'hotfix_test.pak',
  packageName: DEFAULT_PACKAGE_NAME,
  gameName: DEFAULT_GAME_NAME,
  deviceSerial: 'DEVICE123',
})
assert.equal(pushPlan.targetPakName, 'tex_patch_hotfix_test.pak')
assert.equal(pushPlan.targetSigName, 'tex_patch_hotfix_test.sig')
assert.deepEqual(pushPlan.steps.map((step) => step.args.slice(0, 2)), [
  ['-s', 'DEVICE123'],
  ['-s', 'DEVICE123'],
  ['-s', 'DEVICE123'],
])
assert(pushPlan.steps.some((step) => step.args.includes(`${pushPlan.remoteDir}/tex_patch_hotfix_test.pak`)))
assert(pushPlan.steps.some((step) => step.args.includes(`${pushPlan.remoteDir}/tex_patch_hotfix_test.sig`)))
