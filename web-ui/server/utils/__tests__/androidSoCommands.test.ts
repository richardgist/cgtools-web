import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildAndroidSoJobPlan,
  formatDefaultEngineIniSnippet,
  updateDefaultEngineIniAndroidAbi,
} from '../androidSoCommands'
import {
  parseBuildVersionUpdateText,
  resolveP4ClientFromIniText,
  resolveP4SyncPathsFromIniText,
  resolveSvnUpdatePathsFromIniText,
} from '../versionUpdateCommands'

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

  const p4ClientMatch = resolveP4ClientFromIniText([
    '[P4Client]',
    '+Mapping=E:\\CJGame\\trunk|jesephjiang_JESEPHJIAN-PCBU_E_Trunk',
    '+Mapping=I:\\|jesephjiang_I_Trunk',
    '+Mapping=I:\\CJGame|jesephjiang_I_Nested',
  ].join('\n'), 'I:\\CJGame\\trunk')
  assert.equal(p4ClientMatch?.client, 'jesephjiang_I_Nested')
  assert.equal(resolveP4ClientFromIniText('[P4Client]\n+Mapping=E:\\CJGame\\trunk|e_trunk', 'I:\\CJGame\\trunk'), null)

  const projectDir = path.join(tempRoot, 'Survive')
  fs.mkdirSync(path.join(projectDir, 'AutoPatch'), { recursive: true })
  fs.mkdirSync(path.join(projectDir, 'Config'), { recursive: true })
  fs.mkdirSync(path.join(projectDir, 'Source'), { recursive: true })
  fs.mkdirSync(path.join(projectDir, 'Content', 'Maps'), { recursive: true })
  fs.mkdirSync(path.join(projectDir, 'Content', 'UI'), { recursive: true })
  fs.mkdirSync(path.join(projectDir, 'Content', '.svn'), { recursive: true })
  fs.mkdirSync(path.join(projectDir, 'Content', 'Saved'), { recursive: true })
  fs.mkdirSync(path.join(projectDir, 'Plugins'), { recursive: true })
  fs.mkdirSync(path.join(projectDir, 'Tools'), { recursive: true })
  fs.mkdirSync(path.join(projectDir, 'Saved'), { recursive: true })
  fs.writeFileSync(path.join(projectDir, 'ShadowTrackerExtra.uproject'), '{}', 'utf-8')
  fs.mkdirSync(path.join(tempRoot, 'UE4181', 'Engine', 'Source'), { recursive: true })
  fs.mkdirSync(path.join(tempRoot, 'UE4181', 'Samples'), { recursive: true })
  fs.mkdirSync(path.join(tempRoot, 'UE4181', 'Templates'), { recursive: true })

  const configuredIniText = [
    '[Root:Survive]',
    'Base=Survive',
    '+Paths=Source',
    '+Paths=Content',
    '+Paths=Saved',
    '+ExpandChildren=Content',
    '',
    '[Root:UE4181]',
    'Base=UE4181',
    '+Paths=Engine\\Source',
    '',
    '[Exclude]',
    '+ChildDirs=.git',
    '+ChildDirs=.svn',
    '+ChildDirs=Saved',
    '+ChildDirs=Intermediate',
    '+ChildDirs=Binaries',
    '+ChildDirs=DerivedDataCache',
  ].join('\n')
  const resolvedIniPaths = resolveP4SyncPathsFromIniText(configuredIniText, tempRoot)
  assert(resolvedIniPaths.includes(path.join(projectDir, 'Source')))
  assert(resolvedIniPaths.includes(path.join(projectDir, 'Content', 'Maps')))
  assert(resolvedIniPaths.includes(path.join(projectDir, 'Content', 'UI')))
  assert(resolvedIniPaths.includes(path.join(projectDir, 'Saved')))
  assert(resolvedIniPaths.includes(path.join(tempRoot, 'UE4181', 'Engine', 'Source')))
  assert(!resolvedIniPaths.includes(path.join(projectDir, 'Content')))
  assert(!resolvedIniPaths.includes(path.join(projectDir, 'Content', '.svn')))
  assert(!resolvedIniPaths.includes(path.join(projectDir, 'Content', 'Saved')))

  const resolvedSvnPaths = resolveSvnUpdatePathsFromIniText([
    '[SVN]',
    '+UpdatePath=Survive',
    '+UpdatePath=UE4181\\Engine\\Source',
  ].join('\n'), tempRoot, projectDir)
  assert.deepEqual(resolvedSvnPaths, [
    path.join(tempRoot, 'Survive'),
    path.join(tempRoot, 'UE4181', 'Engine', 'Source'),
  ])

  const updatePlan = buildAndroidSoJobPlan('updateCodeAssets', {
    projectRoot: tempRoot,
    versionUpdateText: 'MergedP4Head：5996891，MergedSvnHead：1466919，P4Merge：5996991-5997884，SVNMerge：1466941-1466969',
    p4SyncPaths: [path.join(projectDir, 'Source')],
    p4Parallel: true,
    dryRun: true,
  })

  assert.deepEqual(updatePlan.steps.map((step) => step.name), ['Update Assets (P4)', 'Update SVN'])
  assert(updatePlan.preview.includes('5996991'))
  assert.equal(updatePlan.steps[0]?.cmd, 'python')
  assert.equal(updatePlan.steps[1]?.cmd, 'python')
  assert(updatePlan.preview.includes('update-code-assets.py'))
  assert(updatePlan.preview.includes('--version-text'))
  assert(updatePlan.preview.includes('--step p4'))
  assert(updatePlan.preview.includes('--step svn'))
  const svnPathsJson = updatePlan.steps[1]?.args[updatePlan.steps[1]?.args.indexOf('--svn-update-paths-json') + 1] || '[]'
  const svnPaths = JSON.parse(svnPathsJson)
  assert(svnPaths.includes(path.join(tempRoot, 'Survive')))
  assert(svnPaths.includes(path.join(tempRoot, 'UE4181', 'Engine', 'Source')))
  assert(updatePlan.preview.includes('--dry-run'))
  assert(!updatePlan.preview.includes('function Invoke-P4SyncMany'))
  assert(!updatePlan.preview.includes('$svnUrl ='))
  assert(!updatePlan.preview.includes('svn update -r 1466919'))
  assert(!updatePlan.preview.includes('powershell.exe -NoProfile -ExecutionPolicy Bypass -File'))

  const updateScriptPath = path.resolve(process.cwd(), 'server', 'scripts', 'update-code-assets.py')
  const dryRunResult = spawnSync('python', [
    updateScriptPath,
    '--step',
    'svn',
    '--version-text',
    'MergedP4Head：5996891，MergedSvnHead：1466919，P4Merge：5996991-5997884，SVNMerge：1466941-1466969',
    '--svn-update-path',
    projectDir,
    '--p4-sync-paths-json',
    JSON.stringify([path.join(projectDir, 'Source')]),
    '--dry-run',
  ], { cwd: tempRoot, encoding: 'utf-8' })
  assert.equal(dryRunResult.status, 0)
  assert(dryRunResult.stdout.includes('[dry-run] svn revert --depth infinity'))
  assert(dryRunResult.stdout.includes('[dry-run] svn update -r 1466919'))
  assert(dryRunResult.stdout.includes('[dry-run] svn merge -c 1466941'))
  assert(!dryRunResult.stdout.includes('svn update -r 1466941'))

  const p4DryRunResult = spawnSync('python', [
    updateScriptPath,
    '--step',
    'p4',
    '--version-text',
    'MergedP4Head：5996891，MergedSvnHead：1466919，P4Merge：5996991-5997884，SVNMerge：1466941-1466969',
    '--p4-sync-paths-json',
    JSON.stringify([path.join(projectDir, 'Source')]),
    '--dry-run',
  ], { cwd: tempRoot, encoding: 'utf-8' })
  assert.equal(p4DryRunResult.status, 0)
  assert(p4DryRunResult.stdout.includes('[dry-run] p4 sync'))
  assert(p4DryRunResult.stdout.includes('@5996891'))
  assert(p4DryRunResult.stdout.includes('@=5996991'))

  const configuredContentPlan = buildAndroidSoJobPlan('updateCodeAssets', {
    projectRoot: tempRoot,
    versionUpdateText: 'MergedP4Head：5996891',
    p4SyncPaths: [
      path.join(projectDir, 'Content'),
      path.join(tempRoot, 'DoesNotMatter'),
    ],
  })
  const configuredP4PathsJson = configuredContentPlan.steps[0]?.args[configuredContentPlan.steps[0]?.args.indexOf('--p4-sync-paths-json') + 1] || '[]'
  const configuredP4Paths = JSON.parse(configuredP4PathsJson)
  assert(configuredP4Paths.includes(path.join(projectDir, 'AutoPatch')))
  assert(configuredP4Paths.includes(path.join(projectDir, 'Content', 'Maps')))
  assert(configuredP4Paths.includes(path.join(projectDir, 'Content', 'UI')))
  assert(!configuredP4Paths.includes(path.join(tempRoot, 'DoesNotMatter')))
  assert(!configuredP4Paths.includes(path.join(projectDir, 'Content')))
  assert(!configuredP4Paths.includes(path.join(projectDir, 'Content', '.svn')))

  const defaultContentPlan = buildAndroidSoJobPlan('updateCodeAssets', {
    projectRoot: tempRoot,
    versionUpdateText: 'MergedP4Head：5996891',
  })
  const defaultP4PathsJson = defaultContentPlan.steps[0]?.args[defaultContentPlan.steps[0]?.args.indexOf('--p4-sync-paths-json') + 1] || '[]'
  const defaultP4Paths = JSON.parse(defaultP4PathsJson)
  assert(defaultP4Paths.includes(path.join(projectDir, 'AutoPatch')))
  assert(defaultP4Paths.includes(path.join(projectDir, 'Content', 'Maps')))
  assert(defaultP4Paths.includes(path.join(projectDir, 'Content', 'UI')))
  assert(!defaultP4Paths.includes(path.join(projectDir, 'Content')))

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
