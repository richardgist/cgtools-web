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
  createPakPushFilesPlan,
  createPakToolLaunchPlan,
  createRemotePakDeletePlan,
  createPakPushPlan,
  extractRemotePakVersions,
  findLatestGeneratedPakPair,
  getPakToolStatus,
  inferPakTargetBaseName,
  listLocalPakFiles,
  normalizePakBaseName,
  normalizeRemotePakFileName,
  parsePakVersionFromName,
} from '../pakToolPlus'

const expectedProjectRoot = 'E:\\CJGame\\trunk'
const expectedExe = 'E:\\CJGame\\trunk\\Survive\\Paktools\\CookAndPakAsset\\Do.bat'

assert.equal(DEFAULT_PROJECT_ROOT, expectedProjectRoot)
assert.equal(DEFAULT_PAK_TOOL_EXE, expectedExe)
assert.equal(DEFAULT_PATCH_PREFIX, 'game_patch_')

const rootPaths = buildPakToolPathsFromProjectRoot(DEFAULT_PROJECT_ROOT)
assert.equal(rootPaths.projectRoot, expectedProjectRoot)
assert.equal(rootPaths.exePath, expectedExe)
assert.equal(rootPaths.toolDir, path.dirname(expectedExe))

const paths = buildPakToolPaths(DEFAULT_PAK_TOOL_EXE)
assert.equal(paths.projectRoot, expectedProjectRoot)
assert.equal(paths.exePath, expectedExe)
assert.equal(paths.toolDir, path.dirname(expectedExe))
assert.equal(paths.batPath, expectedExe)
assert.equal(paths.tempPaksDir, path.join(path.dirname(expectedExe), 'Temp', 'Paks'))

const launchPlan = createPakToolLaunchPlan(DEFAULT_PAK_TOOL_EXE)
assert.equal(launchPlan.cmd, expectedExe)
assert.deepEqual(launchPlan.args, [])
assert.equal(launchPlan.cwd, path.dirname(expectedExe))

const status = getPakToolStatus(DEFAULT_PAK_TOOL_EXE)
assert.equal(status.exePath, expectedExe)
assert.equal(status.detected.windows, process.platform === 'win32')
assert.equal(status.detected.projectRootExists, true, 'default project root should exist')
assert.equal(status.detected.exeExists, true, 'Do.bat should exist at the configured default path')
assert.equal(status.detected.toolDirExists, true, 'CookAndPakAsset directory should exist')

assert.equal(
  buildAndroidSavedPaksDir(DEFAULT_PACKAGE_NAME, DEFAULT_GAME_NAME),
  '/sdcard/Android/data/com.tencent.tmgp.pubgmhd/files/UE4Game/ShadowTrackerExtra/ShadowTrackerExtra/Saved/Paks',
)
assert.equal(normalizePakBaseName('hotfix_test.pak'), 'game_patch_hotfix_test')
assert.equal(normalizePakBaseName('game_patch_1.37.0.21089.pak'), 'game_patch_1.37.0.21089')
assert.equal(normalizePakBaseName('tex_patch_ui_1.37.0.21089.pak'), 'tex_patch_ui_1.37.0.21089')
assert.equal(normalizePakBaseName('test_patch_1.37.0.21089.pak'), 'game_patch_1.37.0.21089')
assert.equal(normalizePakBaseName('hotfix_test.pak', [
  'game_patch_1.37.0.21089.pak',
  'tex_patch_ui_1.37.0.21089.pak',
]), 'game_patch_hotfix_test_1.37.0.21089')
assert.equal(normalizePakBaseName('game_patch_0.0.0.0.pak', [
  'game_patch_1.37.0.21089.pak',
  'tex_patch_ui_1.37.0.21089.pak',
]), 'game_patch_1.37.0.21089')
assert.equal(inferPakTargetBaseName('game_patch_9.9.9.9bbb.pak', [
  'tex_patch_9.9.9.9bbb.pak',
]), 'game_patch_9.9.9.9bbb')
assert.equal(inferPakTargetBaseName('ui_1.37.0.21089.pak', [
  'tex_patch_ui_1.37.0.21089.pak',
]), 'tex_patch_ui_1.37.0.21089')
assert.throws(() => normalizePakBaseName('../bad'), /pak 名称不能包含路径分隔符/)
assert.equal(normalizeRemotePakFileName('tex_patch_ui_1.37.0.21089.pak'), 'tex_patch_ui_1.37.0.21089.pak')
assert.throws(() => normalizeRemotePakFileName('../bad.pak'), /pak 名称不能包含路径分隔符/)
assert.throws(() => normalizeRemotePakFileName('tex_patch_ui_1.37.0.21089.sig'), /只能删除合法的 .pak 文件名/)
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
const extraPak = path.join(tempDir, 'ui_1.37.0.21089.pak')
fs.writeFileSync(oldPak, 'old')
fs.writeFileSync(newPak, 'pak')
fs.writeFileSync(newSig, 'sig')
fs.writeFileSync(extraPak, 'extra')
const oldDate = new Date('2026-01-01T00:00:00Z')
const newDate = new Date('2026-01-02T00:00:00Z')
fs.utimesSync(oldPak, oldDate, oldDate)
fs.utimesSync(newPak, newDate, newDate)
fs.utimesSync(newSig, newDate, newDate)
fs.utimesSync(extraPak, oldDate, oldDate)

const latestPair = findLatestGeneratedPakPair(tempDir)
assert.equal(latestPair.pakPath, newPak)
assert.equal(latestPair.sigPath, newSig)

const localPaks = listLocalPakFiles(tempDir)
assert.deepEqual(localPaks.map((file) => file.name), [
  'game_patch_0.0.0.0.pak',
  'old_patch.pak',
  'ui_1.37.0.21089.pak',
])
assert.equal(localPaks.find((file) => file.name === 'game_patch_0.0.0.0.pak')?.hasSig, true)
assert.equal(localPaks.find((file) => file.name === 'ui_1.37.0.21089.pak')?.hasSig, false)

const pushPlan = createPakPushPlan({
  tempPaksDir: tempDir,
  targetPakName: 'hotfix_test.pak',
  packageName: DEFAULT_PACKAGE_NAME,
  gameName: DEFAULT_GAME_NAME,
  deviceSerial: 'DEVICE123',
})
assert.equal(pushPlan.targetPakName, 'game_patch_hotfix_test.pak')
assert.equal(pushPlan.targetSigName, 'game_patch_hotfix_test.sig')
assert.equal(pushPlan.remoteTempDir, '/data/local/tmp/cgtools-pak-push')
assert.deepEqual(pushPlan.steps.map((step) => step.args.slice(0, 2)), [
  ['-s', 'DEVICE123'],
  ['-s', 'DEVICE123'],
  ['-s', 'DEVICE123'],
  ['-s', 'DEVICE123'],
  ['-s', 'DEVICE123'],
  ['-s', 'DEVICE123'],
  ['-s', 'DEVICE123'],
  ['-s', 'DEVICE123'],
  ['-s', 'DEVICE123'],
])
assert(pushPlan.steps.some((step) => step.args.join(' ').includes(`${pushPlan.remoteDir}/game_patch_hotfix_test.pak`)))
assert(pushPlan.steps.some((step) => step.args.join(' ').includes(`${pushPlan.remoteDir}/game_patch_hotfix_test.sig`)))
assert(pushPlan.steps.some((step) => step.args.includes(`${pushPlan.remoteTempDir}/game_patch_hotfix_test.pak`)))
assert(pushPlan.steps.some((step) => step.args.includes(`${pushPlan.remoteTempDir}/game_patch_hotfix_test.sig`)))
assert.equal(pushPlan.steps.filter((step) => step.cmd === 'adb' && step.args.includes('push')).length, 2)
assert(pushPlan.steps
  .filter((step) => step.name.startsWith('Push '))
  .every((step) => String(step.args.at(-1)).startsWith(pushPlan.remoteTempDir)))

const multiPushPlan = createPakPushFilesPlan({
  sources: [
    { pakPath: newPak },
    { pakPath: extraPak },
  ],
  packageName: DEFAULT_PACKAGE_NAME,
  gameName: DEFAULT_GAME_NAME,
  remotePakFiles: ['tex_patch_ui_1.37.0.21089.pak'],
})
assert.equal(multiPushPlan.files.length, 2)
assert.deepEqual(multiPushPlan.files.map((file) => file.targetPakName), [
  'game_patch_1.37.0.21089.pak',
  'tex_patch_ui_1.37.0.21089.pak',
])
assert.equal(multiPushPlan.files[0].hasSig, true)
assert.equal(multiPushPlan.files[1].hasSig, false)
assert.equal(multiPushPlan.steps.filter((step) => step.cmd === 'adb' && step.args.includes('push')).length, 3)
assert.throws(() => createPakPushFilesPlan({
  sources: [{ pakPath: extraPak }],
  packageName: DEFAULT_PACKAGE_NAME,
  gameName: DEFAULT_GAME_NAME,
  requireSig: true,
}), /缺少同名 \.sig 文件/)
assert.throws(() => createPakPushFilesPlan({
  sources: [
    { pakPath: newPak, targetPakName: 'game_patch_0.0.0.0.pak' },
    { pakPath: newPak, targetPakName: 'test_patch_0.0.0.0.pak' },
  ],
}), /推送目标名重复/)

const deletePlan = createRemotePakDeletePlan({
  fileNames: ['tex_patch_ui_1.37.0.21089.pak'],
  packageName: DEFAULT_PACKAGE_NAME,
  gameName: DEFAULT_GAME_NAME,
  deviceSerial: 'DEVICE123',
})
assert.deepEqual(deletePlan.steps[0].args.slice(0, 4), ['-s', 'DEVICE123', 'shell', 'rm'])
assert(deletePlan.steps[0].args.includes(`${deletePlan.remoteDir}/tex_patch_ui_1.37.0.21089.pak`))
assert(deletePlan.steps[0].args.includes(`${deletePlan.remoteDir}/tex_patch_ui_1.37.0.21089.sig`))
