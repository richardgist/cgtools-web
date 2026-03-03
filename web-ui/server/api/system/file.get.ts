import { defineEventHandler, getQuery } from 'h3'
import { spawn } from 'child_process'

const FILTER_MAP: Record<string, string> = {
  apk: 'APK Files (*.apk)|*.apk|All Files (*.*)|*.*',
  so: 'SO Files (*.so)|*.so|All Files (*.*)|*.*',
  exe: 'Executable Files (*.exe)|*.exe|All Files (*.*)|*.*',
  any: 'All Files (*.*)|*.*',
}

const escapeSingleQuotedPowerShell = (input: string) => input.replace(/'/g, "''")

export default defineEventHandler(async (event) => {
  if (process.platform !== 'win32') {
    return { success: false, error: 'File picker currently supports Windows only.' }
  }

  const query = getQuery(event)
  const mode = String(query.mode || 'open').toLowerCase()
  const filter = String(query.filter || 'any').toLowerCase()

  if (mode !== 'open') {
    return { success: false, error: `Unsupported mode: ${mode}` }
  }

  const dialogFilter = FILTER_MAP[filter] || FILTER_MAP.any
  const escapedFilter = escapeSingleQuotedPowerShell(dialogFilter)

  const script = `
Add-Type -AssemblyName System.Windows.Forms
$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Filter = '${escapedFilter}'
$dlg.CheckFileExists = $true
$dlg.CheckPathExists = $true
$dlg.Multiselect = $false
$dlg.Title = 'Select file'
if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dlg.FileName
}
`

  return await new Promise<{ success: boolean; path?: string; error?: string }>((resolve) => {
    const child = spawn('powershell', ['-Sta', '-NoProfile', '-Command', script], {
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (buf: Buffer) => {
      stdout += buf.toString('utf-8')
    })
    child.stderr.on('data', (buf: Buffer) => {
      stderr += buf.toString('utf-8')
    })

    child.on('close', (code: number) => {
      const selectedPath = stdout.trim()
      if (code === 0 && selectedPath) {
        resolve({ success: true, path: selectedPath })
        return
      }
      if (stderr.trim()) {
        resolve({ success: false, error: stderr.trim() })
        return
      }
      resolve({ success: false, error: 'No file selected.' })
    })
  })
})

