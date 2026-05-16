import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  formatDefaultEngineIniSnippet,
  updateDefaultEngineIniAndroidAbi,
} from '../androidSoCommands'

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
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
