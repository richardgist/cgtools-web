import { readFile } from 'node:fs/promises'
import { defineEventHandler, setHeader } from 'h3'

const TABLE_VIEWER_HTML_PATH = 'E:/CJGame/trunk/xls/table_viewer/table_viewer.html'

export default defineEventHandler(async (event) => {
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')

  return await readFile(TABLE_VIEWER_HTML_PATH, 'utf-8')
})
