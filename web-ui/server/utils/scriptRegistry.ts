import * as fs from 'fs'
import * as path from 'path'
import { parsePowerShellParameters, type ScriptParameterInfo } from './scriptParameterParser.ts'

const SCRIPT_ICONS: Record<string, string> = {
  '.py': '🐍',
  '.bat': '⚙️',
  '.ps1': '🟦',
}

const SCRIPT_PARAMETER_OVERRIDES: Record<string, Record<string, Partial<ScriptParameterInfo>>> = {
  'Update-AllRepos.ps1': {
    rootPath: {
        label: '更新根目录',
        placeholder: '选择包含 Survive 和 UE4181 的根目录',
        required: true,
    },
    p4Client: {
      label: 'P4 Client',
      placeholder: '当前项目对应的 Perforce workspace/client 名',
      required: true,
    },
    svnOnly: {
      label: '只更新 SVN',
    },
    p4Only: {
      label: '只更新 P4',
    },
    conflictAbort: {
      label: '遇到冲突立即停止',
    },
  },
  'send_renderdoc_opengl_commands.ps1': {
    packageName: {
        label: '包名',
        placeholder: 'Android package name',
        required: true,
    },
    deviceSerial: {
        label: '设备序列号',
        placeholder: '多设备时填写 adb serial',
    },
    commands: {
        label: '执行命令',
        placeholder: '用分号分隔多条 UE console command',
        required: true,
    },
    delayMs: {
      label: '延迟毫秒',
    },
    requireProcess: {
        label: '要求进程',
        placeholder: '1=游戏进程必须已启动，0=不检查',
    },
    dryRun: {
      label: '仅预览命令',
      placeholder: '1=只打印不执行，0=实际执行',
    },
  },
  'pull_latest_stats.ps1': {
    packageName: {
        label: '包名',
        placeholder: 'Android package name',
        required: true,
    },
    projectName: {
        label: 'UE 项目名',
        placeholder: 'UE4Game 下的项目目录名',
        required: true,
    },
    deviceSerial: {
        label: '设备序列号',
        placeholder: '多设备时填写 adb serial',
    },
    localDir: {
        label: '保存目录',
        placeholder: '默认保存到 PerformanceData/Stats',
    },
    p4Client: {
        label: 'P4 Client',
        placeholder: '当前项目对应的 Perforce workspace/client 名',
        required: true,
    },
  },
  'pull_game_logs.ps1': {
    packageName: {
        label: '包名',
        placeholder: 'Android package name',
        required: true,
    },
    projectName: {
        label: 'UE 项目名',
        placeholder: 'UE4Game 下的项目目录名',
        required: true,
    },
    deviceSerial: {
        label: '设备序列号',
        placeholder: '多设备时填写 adb serial',
    },
    localDir: {
        label: '保存目录',
        placeholder: '默认保存到 PerformanceData/Logs',
    },
    fallbackToLogcat: {
        label: '失败时导出 logcat',
        placeholder: '1=Saved 日志被拒时导出当前进程 logcat，0=只拉 Saved 文件',
    },
  },
  'pull_saved_dir.ps1': {
    packageName: {
        label: '包名',
        placeholder: 'Android package name',
        required: true,
    },
    projectName: {
        label: 'UE 项目名',
        placeholder: 'UE4Game 下的项目目录名',
        required: true,
    },
    deviceSerial: {
        label: '设备序列号',
        placeholder: '多设备时填写 adb serial',
    },
    localDir: {
        label: '保存目录',
        placeholder: '默认保存到 PerformanceData/Saved',
    },
  },
  'pull_saved_logs.ps1': {
    packageName: {
        label: '包名',
        placeholder: 'Android package name',
        required: true,
    },
    projectName: {
        label: 'UE 项目名',
        placeholder: 'UE4Game 下的项目目录名',
        required: true,
    },
    deviceSerial: {
        label: '设备序列号',
        placeholder: '多设备时填写 adb serial',
    },
    localDir: {
        label: '保存目录',
        placeholder: '默认保存到 PerformanceData/Logs',
    },
  },
}

export type ScriptInfo = {
  name: string
  path: string
  icon: string
  type: string
  params?: ScriptParameterInfo[]
}

export const getScriptsDir = () => path.resolve(process.cwd(), '../scripts')

export const isSupportedScriptFile = (fileName: string) => {
  const ext = path.extname(fileName).toLowerCase()
  return Boolean(SCRIPT_ICONS[ext]) && !fileName.toLowerCase().includes('toolbox')
}

const getScriptParameters = (fileName: string, fullPath: string) => {
  if (path.extname(fileName).toLowerCase() !== '.ps1') {
    return []
  }

  const content = fs.readFileSync(fullPath, 'utf-8')
  const overrides = SCRIPT_PARAMETER_OVERRIDES[fileName] || {}
  return parsePowerShellParameters(content).map((param) => ({
    ...param,
    ...(overrides[param.key] || {}),
  }))
}

export const resolveManagedScriptPath = (scriptPath: unknown) => {
  if (typeof scriptPath !== 'string' || !scriptPath.trim()) {
    throw new Error('缺少脚本路径')
  }

  const scriptsDir = getScriptsDir()
  const resolvedPath = path.resolve(scriptPath)
  const relativePath = path.relative(scriptsDir, resolvedPath)

  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('脚本路径必须位于内置 scripts 目录内')
  }

  if (!isSupportedScriptFile(resolvedPath)) {
    throw new Error('不支持的脚本类型')
  }

  const stat = fs.statSync(resolvedPath)
  if (!stat.isFile()) {
    throw new Error('脚本路径不是文件')
  }

  return resolvedPath
}

export const listManagedScripts = () => {
  const scriptsDir = getScriptsDir()
  const scripts: ScriptInfo[] = []

  if (!fs.existsSync(scriptsDir)) {
    return scripts
  }

  const files = fs.readdirSync(scriptsDir)

  for (const file of files) {
    const fullPath = path.join(scriptsDir, file)
    const stat = fs.statSync(fullPath)

    if (!stat.isFile() || !isSupportedScriptFile(file)) {
      continue
    }

    const ext = path.extname(file).toLowerCase()
    const icon = SCRIPT_ICONS[ext]
    if (!icon) {
      continue
    }

    scripts.push({
      name: file,
      path: fullPath,
      icon,
      type: ext.substring(1),
      params: getScriptParameters(file, fullPath),
    })
  }

  return scripts.sort((a, b) => a.name.localeCompare(b.name))
}
