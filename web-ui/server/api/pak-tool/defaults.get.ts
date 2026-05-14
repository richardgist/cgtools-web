import { defineEventHandler, getQuery } from 'h3'
import { DEFAULT_PAK_TOOL_EXE, getPakToolStatus } from '../../utils/pakToolPlus'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const projectRoot = typeof query.projectRoot === 'string' && query.projectRoot.trim()
    ? query.projectRoot
    : undefined
  const exePath = typeof query.exePath === 'string' && query.exePath.trim()
    ? query.exePath
    : DEFAULT_PAK_TOOL_EXE

  return getPakToolStatus(exePath, projectRoot)
})
