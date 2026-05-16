import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildAndroidSoJobPlan,
  formatDefaultEngineIniSnippet,
  updateDefaultEngineIniAndroidAbi,
} from '../androidSoCommands'
import { parseBuildVersionUpdateText } from '../versionUpdateCommands'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cgtools-android-so-'))

try {
  const iniPath = path.join(tempRoot, 'DefaultEngine.ini')
  fs.writeFileSync(
    iniPath,
    [
      '[Other.Section]',
      'Value=True',
      '',
      '[/Script/AndroidRuntimeSettings.AndroidRuntimeSettings]',
      'bBuildForArmV7=True',
      'bBuildForArm64=True',
      'bBuildForX86=True',
      'bBuildForX8664=True',
      '',
      '[/Script/AndroidRuntimeSettings.AndroidRuntimeSettings]',
      'bBuildForArmV7=True',
      'bBuildForArm64=True',
      'bBuildForX86=True',
      'bBuildForX8664=True',
      '',
    ].join('\r\n'),
    'utf-8',
  )

  const result = updateDefaultEngineIniAndroidAbi(iniPath, 'arm64-v8a')
  const content = fs.readFileSync(iniPath, 'utf-8')

  assert.equal(result.changed, true)
  assert.equal((content.match(/bBuildForArmV7=False/g) || []).length, 2)
  assert.equal((content.match(/bBuildForArm64=True/g) || []).length, 2)
  assert.equal((content.match(/bBuildForX86=False/g) || []).length, 2)
  assert.equal((content.match(/bBuildForX8664=False/g) || []).length, 2)
  assert.equal(content.includes('bBuildForArmV7=True'), false)
  assert.equal(content.includes('bBuildForX86=True'), false)

  const secondResult = updateDefaultEngineIniAndroidAbi(iniPath, 'arm64-v8a')
  assert.equal(secondResult.changed, false)

  const missingSectionPath = path.join(tempRoot, 'DefaultEngineNoSection.ini')
  fs.writeFileSync(missingSectionPath, '[Other.Section]\nValue=True\n', 'utf-8')
  updateDefaultEngineIniAndroidAbi(missingSectionPath, 'x86_64')

  const appendedContent = fs.readFileSync(missingSectionPath, 'utf-8')
  assert.match(appendedContent, /\[\/Script\/AndroidRuntimeSettings\.AndroidRuntimeSettings\]/)
  assert.match(appendedContent, /bBuildForX8664=True/)
  assert.match(appendedContent, /bBuildForArm64=False/)

  assert.equal(
    formatDefaultEngineIniSnippet('armeabi-v7a'),
    [
      '[/Script/AndroidRuntimeSettings.AndroidRuntimeSettings]',
      'bBuildForArmV7=True',
      'bBuildForArm64=False',
      'bBuildForX86=False',
      'bBuildForX8664=False',
    ].join('\n'),
  )

  const versionInfo = parseBuildVersionUpdateText('【CG】每日转测试版本  （MergedP4Head：5996891，MergedSvnHead：1466919  ，P4Merge：5996991-5997884，SVNMerge：1466941-1466969-1467034-1467057-1467136-1467216-1467223）')
  assert.equal(versionInfo.mergedP4Head, '5996891')
  assert.equal(versionInfo.mergedSvnHead, '1466919')
  assert.deepEqual(versionInfo.p4Merge, ['5996991', '5997884'])
  assert.deepEqual(versionInfo.svnMerge, ['1466941', '1466969', '1467034', '1467057', '1467136', '1467216', '1467223'])

  const projectDir = path.join(tempRoot, 'Survive')
  fs.mkdirSync(path.join(projectDir, 'Source'), { recursive: true })
  fs.writeFileSync(path.join(projectDir, 'ShadowTrackerExtra.uproject'), '{}', 'utf-8')
  fs.mkdirSync(path.join(tempRoot, 'UE4181', 'Engine'), { recursive: true })
  const updatePlan = buildAndroidSoJobPlan('updateCodeAssets', {
    projectRoot: tempRoot,
    versionUpdateText: 'MergedP4Head：5996891，MergedSvnHead：1466919，P4Merge：5996991-5997884，SVNMerge：1466941-1466969',
    p4SyncPaths: [path.join(projectDir, 'Source')],
    p4Parallel: true,
  })

  assert.deepEqual(updatePlan.steps.map((step) => step.name), ['Update Assets (P4)', 'Update SVN'])
  assert(updatePlan.preview.includes('svn update -r 1466919'))
  assert(updatePlan.preview.includes('5996991'))
  assert.equal(updatePlan.steps[0]?.cmd, 'python')
  assert(updatePlan.preview.includes('update-assets-p4.py'))
  assert(updatePlan.preview.includes('--merged-p4-head 5996891'))
  assert(updatePlan.preview.includes('--p4-merge-json'))
  assert(!updatePlan.preview.includes('function Invoke-P4SyncMany'))
  assert(!updatePlan.preview.includes('powershell.exe -NoProfile -ExecutionPolicy Bypass -File'))

  const fullBuildPlan = buildAndroidSoJobPlan('buildSo', {
    projectRoot: tempRoot,
    projectFile: path.join(projectDir, 'ShadowTrackerExtra.uproject'),
    engineRoot: path.join(tempRoot, 'UE4181', 'Engine'),
    defaultEngineIniPath: iniPath,
    config: 'Development',
    arch: 'arm64-v8a',
    versionUpdateText: 'MergedP4Head：5996891，MergedSvnHead：1466919，P4Merge：5996991-5997884，SVNMerge：1466941-1466969',
    p4SyncPaths: [path.join(projectDir, 'Source')],
    p4Parallel: true,
  } as any)

  assert(!fullBuildPlan.steps.some((step) => step.name.includes('P4') || step.name.includes('SVN') || step.name.includes('Assets')))
  assert(!fullBuildPlan.preview.includes('p4 sync'))
  assert(!fullBuildPlan.preview.includes('svn update'))

  const rebuildPlan = buildAndroidSoJobPlan('rebuildSo', {
    projectRoot: tempRoot,
    projectFile: path.join(tempRoot, 'Survive', 'ShadowTrackerExtra.uproject'),
    engineRoot: path.join(tempRoot, 'UE4181', 'Engine'),
    defaultEngineIniPath: iniPath,
    config: 'Development',
    arch: 'arm64-v8a',
  })

  assert.deepEqual(rebuildPlan.steps.map((step) => step.name), ['Rebuild Android SO with UBT'])
  assert.equal(rebuildPlan.cleanupSteps?.length || 0, 0)
  assert(!rebuildPlan.preview.includes('ReplaceManagerTool.py'))
  assert(!rebuildPlan.preview.includes('-generatemanifest'))
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
