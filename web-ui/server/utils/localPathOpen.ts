import * as fs from 'fs'
import * as path from 'path'

export type OpenPathMode = 'path' | 'folder'

const isDirectory = (targetPath: string) => fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()

export const resolveOpenTargetPath = (rawPath: string, mode: OpenPathMode = 'path') => {
  const targetPath = path.resolve(rawPath)
  if (!path.isAbsolute(targetPath)) {
    throw new Error('本地路径必须是绝对路径')
  }

  if (mode === 'folder') {
    if (isDirectory(targetPath)) {
      return targetPath
    }

    const parentPath = path.dirname(targetPath)
    if (isDirectory(parentPath)) {
      return parentPath
    }

    throw new Error('所在文件夹不存在')
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error('本地路径不存在')
  }

  return targetPath
}
