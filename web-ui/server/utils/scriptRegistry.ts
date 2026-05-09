import * as fs from 'fs'
import * as path from 'path'

const SCRIPT_ICONS: Record<string, string> = {
  '.py': '🐍',
  '.bat': '⚙️',
  '.ps1': '🟦',
}

const SCRIPT_PARAMETER_DEFINITIONS: Record<string, { params: Array<Record<string, unknown>> }> = {
  'Update-AllRepos.ps1': {
    params: [
      {
        key: 'rootPath',
        label: '更新根目录',
        type: 'folder',
        defaultValue: 'E:\\PUBGTrunk',
        placeholder: '选择包含 Survive 和 UE4181 的根目录',
        argName: '-RootPath',
        required: true,
      },
    ],
  },
  'send_renderdoc_opengl_commands.ps1': {
    params: [
      {
        key: 'packageName',
        label: '包名',
        type: 'text',
        defaultValue: 'com.tencent.tmgp.pubgmhd',
        placeholder: 'Android package name',
        argName: '-PackageName',
        required: true,
      },
      {
        key: 'deviceSerial',
        label: '设备序列号',
        type: 'text',
        defaultValue: '',
        placeholder: '多设备时填写 adb serial',
        argName: '-DeviceSerial',
      },
      {
        key: 'commands',
        label: '执行命令',
        type: 'text',
        defaultValue: 'r.RHISetGPUCaptureOptions 1;r.ShowMaterialDrawEvents 1',
        placeholder: '用分号分隔多条 UE console command',
        argName: '-Commands',
        required: true,
      },
      {
        key: 'requireProcess',
        label: '要求进程',
        type: 'text',
        defaultValue: '1',
        placeholder: '1=游戏进程必须已启动，0=不检查',
        argName: '-RequireProcess',
      },
    ],
  },
}

export type ScriptInfo = {
  name: string
  path: string
  icon: string
  type: string
  params?: Array<Record<string, unknown>>
}

export const getScriptsDir = () => path.resolve(process.cwd(), '../scripts')

export const isSupportedScriptFile = (fileName: string) => {
  const ext = path.extname(fileName).toLowerCase()
  return Boolean(SCRIPT_ICONS[ext]) && !fileName.toLowerCase().includes('toolbox')
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
    scripts.push({
      name: file,
      path: fullPath,
      icon: SCRIPT_ICONS[ext],
      type: ext.substring(1),
      ...(SCRIPT_PARAMETER_DEFINITIONS[file] || {}),
    })
  }

  return scripts.sort((a, b) => a.name.localeCompare(b.name))
}
