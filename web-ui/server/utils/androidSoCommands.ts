import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawnSync } from 'child_process'

export type AndroidArch = 'arm64-v8a' | 'armeabi-v7a' | 'x86_64'
export type BuildConfig = 'Development' | 'Test' | 'Shipping'
export type AndroidSoJobType = 'buildSo' | 'replaceA' | 'injectB' | 'pushSo'

export interface BuildSoPayload {
  projectRoot: string
  projectFile: string
  engineRoot: string
  config: BuildConfig
  arch: AndroidArch
  logPath?: string
  maxParallelActions?: number
}

export interface ReplaceAPayload {
  apkPath: string
  soPath: string
  arch: AndroidArch
  ueAppToolsExe: string
  showInstallHint?: boolean
}

export interface InjectBPayload {
  packageName: string
  androidInjectDir: string
  soPath: string
  launchActivity: string
}

export interface PushSoPayload {
  soPath: string
  remotePath: string
  packageName?: string
  useRunAs?: boolean
}

export type AndroidSoPayload = BuildSoPayload | ReplaceAPayload | InjectBPayload | PushSoPayload

export interface CommandStep {
  name: string
  cmd: string
  args: string[]
  cwd?: string
}

export interface JobPlan {
  steps: CommandStep[]
  preview: string
  validationErrors: string[]
  warnings: string[]
  outputs: Record<string, string>
}

const VALID_ARCHES = new Set<AndroidArch>(['arm64-v8a', 'armeabi-v7a', 'x86_64'])
const VALID_CONFIGS = new Set<BuildConfig>(['Development', 'Test', 'Shipping'])

const quoteArg = (value: string) => {
  if (value.length === 0) return '""'
  return /[\s"&|<>^]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
}

const renderCommand = (cmd: string, args: string[], cwd?: string) => {
  const commandLine = [quoteArg(cmd), ...args.map(quoteArg)].join(' ')
  if (!cwd) {
    return commandLine
  }
  return `(cwd=${cwd}) ${commandLine}`
}

const addValidation = (errors: string[], condition: boolean, message: string) => {
  if (!condition) {
    errors.push(message)
  }
}

const isAdbAvailable = () => {
  const probe = spawnSync('adb', ['version'], { encoding: 'utf-8', shell: false, windowsHide: true })
  return probe.status === 0
}

const buildReplaceOutputApk = (apkPath: string) => {
  const ext = path.extname(apkPath)
  if (!ext) {
    return `${apkPath}_so_replaced`
  }
  return `${apkPath.slice(0, -ext.length)}_so_replaced${ext}`
}

const buildBuildSoPlan = (payload: BuildSoPayload): JobPlan => {
  const errors: string[] = []
  const warnings: string[] = []
  const projectDir = path.dirname(payload.projectFile || '')
  const targetName = path.basename(payload.projectFile || '', path.extname(payload.projectFile || ''))
  const ubtExe = path.join(payload.engineRoot || '', 'Binaries', 'DotNET', 'UnrealBuildTool.exe')
  const defaultLogPath = path.join(projectDir, 'Saved', 'Logs', 'Build', `AndroidSO_${payload.config}_${payload.arch}.log`)
  const resolvedLogPath = (payload.logPath || '').trim()
    ? (path.isAbsolute((payload.logPath || '').trim()) ? (payload.logPath || '').trim() : path.join(payload.projectRoot || '', (payload.logPath || '').trim()))
    : defaultLogPath
  const outputSoPath = path.join(projectDir, 'Intermediate', 'Android', 'APK', 'jni', payload.arch || 'arm64-v8a', 'libUE4.so')
  const archArgMap: Record<AndroidArch, string> = {
    'arm64-v8a': '-arm64',
    'armeabi-v7a': '-armv7',
    x86_64: '-x64',
  }
  const archArg = archArgMap[payload.arch]
  const maxParallelActions = Number(payload.maxParallelActions)
  const hasMaxParallelActions = Number.isInteger(maxParallelActions) && maxParallelActions > 0

  addValidation(errors, process.platform === 'win32', 'Only Windows is supported for this flow.')
  addValidation(errors, fs.existsSync(payload.projectRoot || ''), `projectRoot not found: ${payload.projectRoot}`)
  addValidation(errors, fs.existsSync(payload.projectFile || ''), `projectFile not found: ${payload.projectFile}`)
  addValidation(errors, fs.existsSync(payload.engineRoot || ''), `engineRoot not found: ${payload.engineRoot}`)
  addValidation(errors, fs.existsSync(ubtExe), `UnrealBuildTool.exe not found: ${ubtExe}`)
  addValidation(errors, VALID_ARCHES.has(payload.arch), `Unsupported arch: ${payload.arch}`)
  addValidation(errors, VALID_CONFIGS.has(payload.config), `Unsupported config: ${payload.config}`)
  addValidation(errors, !!targetName, `Unable to resolve target name from projectFile: ${payload.projectFile}`)
  addValidation(
    errors,
    !payload.maxParallelActions || (hasMaxParallelActions && maxParallelActions <= 128),
    `maxParallelActions must be an integer between 1 and 128, got: ${payload.maxParallelActions}`,
  )

  const args = [
    targetName,
    'Android',
    payload.config,
    `-Project=${payload.projectFile}`,
    payload.projectFile,
    '-NoUBTMakefiles',
    `-remoteini=${projectDir}`,
    '-skipdeploy',
    '-BuildPipeline=',
    archArg,
    ...(payload.config === 'Shipping' ? ['-ShippingDev'] : []),
    '-forceframepointer',
    '-noxge',
    '-generatemanifest',
    ...(hasMaxParallelActions ? [`-MaxParallelActions=${maxParallelActions}`] : []),
    `-log=${resolvedLogPath}`,
    '-NoHotReload',
  ].filter(Boolean) as string[]

  if (payload.config !== 'Shipping') {
    warnings.push('ShippingDev is only added when config=Shipping.')
  }
  warnings.push(`UBT log will be written to: ${resolvedLogPath}`)

  const step: CommandStep = {
    name: 'Build Android SO with UBT',
    cmd: ubtExe,
    args,
    cwd: payload.projectRoot,
  }

  return {
    steps: [step],
    preview: renderCommand(step.cmd, step.args, step.cwd),
    validationErrors: errors,
    warnings,
    outputs: {
      soPath: outputSoPath,
      buildLogPath: resolvedLogPath,
    },
  }
}

const buildReplaceSoPlan = (payload: ReplaceAPayload): JobPlan => {
  const errors: string[] = []
  const warnings: string[] = []

  addValidation(errors, process.platform === 'win32', 'Only Windows is supported for this flow.')
  addValidation(errors, fs.existsSync(payload.ueAppToolsExe || ''), `UEAppTools.exe not found: ${payload.ueAppToolsExe}`)
  addValidation(errors, fs.existsSync(payload.apkPath || ''), `APK not found: ${payload.apkPath}`)
  addValidation(errors, payload.apkPath.toLowerCase().endsWith('.apk'), 'apkPath must end with .apk')
  addValidation(errors, fs.existsSync(payload.soPath || ''), `SO not found: ${payload.soPath}`)
  addValidation(errors, payload.soPath.toLowerCase().endsWith('.so'), 'soPath must end with .so')
  addValidation(errors, VALID_ARCHES.has(payload.arch), `Unsupported arch: ${payload.arch}`)

  const step: CommandStep = {
    name: 'Replace SO in APK',
    cmd: payload.ueAppToolsExe,
    args: [
      '-mode=replaceSo',
      '-platform=android',
      `-apkPath=${payload.apkPath}`,
      `-soPath=${payload.soPath}`,
      `-arch=${payload.arch}`,
    ],
    cwd: path.dirname(payload.ueAppToolsExe),
  }

  const outputApk = buildReplaceOutputApk(payload.apkPath)
  if (payload.showInstallHint) {
    warnings.push(`Install hint: adb install -r "${outputApk}"`)
  }

  return {
    steps: [step],
    preview: renderCommand(step.cmd, step.args, step.cwd),
    validationErrors: errors,
    warnings,
    outputs: {
      outputApk,
    },
  }
}

const normalizeActivityComponent = (packageName: string, launchActivity: string) => {
  if (!launchActivity) {
    return `${packageName}/com.epicgames.ue4.SplashActivity`
  }
  if (launchActivity.includes('/')) {
    return launchActivity
  }
  return `${packageName}/${launchActivity}`
}

const buildInjectPlan = (payload: InjectBPayload): JobPlan => {
  const errors: string[] = []
  const warnings: string[] = []

  const injectDemoPath = path.join(payload.androidInjectDir || '', 'inject_demo')
  const injectEntrySoPath = path.join(payload.androidInjectDir || '', 'lib_inject_entry.so')
  const localLogPath = path.join(os.tmpdir(), `android_inject_${Date.now()}.txt`)
  const activityComponent = normalizeActivityComponent(payload.packageName, payload.launchActivity)

  addValidation(errors, process.platform === 'win32', 'Only Windows is supported for this flow.')
  addValidation(errors, !!payload.packageName, 'packageName is required.')
  addValidation(errors, fs.existsSync(payload.androidInjectDir || ''), `androidInjectDir not found: ${payload.androidInjectDir}`)
  addValidation(errors, fs.existsSync(injectDemoPath), `inject_demo not found: ${injectDemoPath}`)
  addValidation(errors, fs.existsSync(injectEntrySoPath), `lib_inject_entry.so not found: ${injectEntrySoPath}`)
  addValidation(errors, fs.existsSync(payload.soPath || ''), `SO not found: ${payload.soPath}`)
  addValidation(errors, payload.soPath.toLowerCase().endsWith('.so'), 'soPath must end with .so')
  addValidation(errors, isAdbAvailable(), 'adb is not available in PATH.')

  const copyRuntimeCmd = `run-as ${payload.packageName} sh -c 'cp /data/local/tmp/libUE4.so . && cp /data/local/tmp/inject_demo . && cp /data/local/tmp/lib_inject_entry.so . && chmod 777 ./inject_demo && chmod 777 ./lib_inject_entry.so'`
  const injectCmd = `run-as ${payload.packageName} sh -c './inject_demo ${payload.packageName} > /data/local/tmp/log_android_inject.txt'`

  const steps: CommandStep[] = [
    {
      name: 'Push inject_demo',
      cmd: 'adb',
      args: ['push', injectDemoPath, '/data/local/tmp/'],
    },
    {
      name: 'Push lib_inject_entry.so',
      cmd: 'adb',
      args: ['push', injectEntrySoPath, '/data/local/tmp/'],
    },
    {
      name: 'Push target libUE4.so',
      cmd: 'adb',
      args: ['push', payload.soPath, '/data/local/tmp/libUE4.so'],
    },
    {
      name: 'Prepare log file',
      cmd: 'adb',
      args: ['shell', 'touch /data/local/tmp/log_android_inject.txt'],
    },
    {
      name: 'Copy runtime files into app sandbox',
      cmd: 'adb',
      args: ['shell', copyRuntimeCmd],
    },
    {
      name: 'Launch game activity',
      cmd: 'adb',
      args: ['shell', 'am', 'start', '-n', activityComponent],
    },
    {
      name: 'Execute injector',
      cmd: 'adb',
      args: ['shell', injectCmd],
    },
    {
      name: 'Pull injector log',
      cmd: 'adb',
      args: ['pull', '/data/local/tmp/log_android_inject.txt', localLogPath],
    },
  ]

  warnings.push('If the app crashes right after injection, re-run once to verify stability.')

  return {
    steps,
    preview: steps.map((step) => renderCommand(step.cmd, step.args, step.cwd)).join('\n'),
    validationErrors: errors,
    warnings,
    outputs: {
      localLogPath,
      expectedMarker: 'inject dlclose_addr res : 0',
    },
  }
}

const normalizePushDestination = (remotePath: string) => {
  const sanitized = (remotePath || '').trim().replace(/\\/g, '/')
  if (!sanitized) {
    return '/data/local/tmp/libUE4.so'
  }
  if (sanitized.endsWith('/')) {
    return `${sanitized}libUE4.so`
  }
  if (sanitized.toLowerCase().endsWith('.so')) {
    const parentDir = path.posix.dirname(sanitized)
    return `${parentDir}/libUE4.so`
  }
  return `${sanitized}/libUE4.so`
}

const buildPushSoPlan = (payload: PushSoPayload): JobPlan => {
  const errors: string[] = []
  const warnings: string[] = []

  addValidation(errors, process.platform === 'win32', 'Only Windows is supported for this flow.')
  addValidation(errors, fs.existsSync(payload.soPath || ''), `SO not found: ${payload.soPath}`)
  addValidation(errors, payload.soPath.toLowerCase().endsWith('.so'), 'soPath must end with .so')
  addValidation(errors, !!(payload.remotePath || '').trim(), 'remotePath is required.')
  addValidation(errors, isAdbAvailable(), 'adb is not available in PATH.')
  if (payload.useRunAs) {
    addValidation(errors, !!(payload.packageName || '').trim(), 'packageName is required when useRunAs=true.')
  }

  const remotePath = normalizePushDestination(payload.remotePath || '')
  if (payload.useRunAs) {
    const packageName = (payload.packageName || '').trim()
    const parentDir = path.posix.dirname(remotePath)
    const copyCmd = `run-as ${packageName} sh -c 'mkdir -p ${parentDir} && cp /data/local/tmp/libUE4.so ${remotePath} && ls -l ${remotePath}'`
    const steps: CommandStep[] = [
      {
        name: 'Push SO to /data/local/tmp',
        cmd: 'adb',
        args: ['push', payload.soPath, '/data/local/tmp/libUE4.so'],
      },
      {
        name: 'Copy SO into app sandbox target path',
        cmd: 'adb',
        args: ['shell', copyCmd],
      },
    ]
    warnings.push(`Run-as mode enabled, target package: ${packageName}`)
    return {
      steps,
      preview: steps.map((step) => renderCommand(step.cmd, step.args, step.cwd)).join('\n'),
      validationErrors: errors,
      warnings,
      outputs: {
        remoteSoPath: remotePath,
      },
    }
  }

  const step: CommandStep = {
    name: 'Push SO via adb',
    cmd: 'adb',
    args: ['push', payload.soPath, remotePath],
  }

  return {
    steps: [step],
    preview: renderCommand(step.cmd, step.args, step.cwd),
    validationErrors: errors,
    warnings,
    outputs: {
      remoteSoPath: remotePath,
    },
  }
}

export const buildAndroidSoJobPlan = (jobType: AndroidSoJobType, payload: AndroidSoPayload): JobPlan => {
  if (jobType === 'buildSo') {
    return buildBuildSoPlan(payload as BuildSoPayload)
  }
  if (jobType === 'replaceA') {
    return buildReplaceSoPlan(payload as ReplaceAPayload)
  }
  if (jobType === 'injectB') {
    return buildInjectPlan(payload as InjectBPayload)
  }
  if (jobType === 'pushSo') {
    return buildPushSoPlan(payload as PushSoPayload)
  }
  return {
    steps: [],
    preview: '',
    validationErrors: [`Unsupported jobType: ${jobType}`],
    warnings: [],
    outputs: {},
  }
}
