import { defineEventHandler } from 'h3'
import { spawn } from 'child_process'

export default defineEventHandler(async () => {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') {
            return resolve({ success: false, error: '目前选择文件夹功能仅支持 Windows 系统' })
        }

        // Use a modern folder picker via PowerShell + .NET Shell.Application
        // This dialog supports typing paths in the address bar and is much more user-friendly
        const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic
$f = New-Object System.Windows.Forms.OpenFileDialog
$f.ValidateNames = $false
$f.CheckFileExists = $false
$f.CheckPathExists = $true
$f.FileName = "选择此文件夹"
$f.Title = "请选择文件夹"
if ($f.ShowDialog() -eq "OK") {
    Write-Output (Split-Path $f.FileName)
}
`
        const child = spawn('powershell', ['-Sta', '-NoProfile', '-Command', script])

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (d: Buffer) => stdout += d.toString())
        child.stderr.on('data', (d: Buffer) => stderr += d.toString())

        child.on('close', (code: number) => {
            const path = stdout.trim()
            if (path && code === 0) {
                resolve({ success: true, path })
            } else {
                resolve({ success: false, error: '' })
            }
        })
    })
})
