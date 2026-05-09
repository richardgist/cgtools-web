import { defineEventHandler } from 'h3'
import { spawn } from 'child_process'

export default defineEventHandler(async () => {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') {
            return resolve({ success: false, error: '目前选择文件夹功能仅支持 Windows 系统' })
        }

        // 用一个置顶的 owner 窗口承载文件夹选择器，避免从后台 Node 进程拉起时对话框藏在其它窗口后面。
        const script = `
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.Text = "CGTools"
$owner.StartPosition = "CenterScreen"
$owner.Width = 1
$owner.Height = 1
$owner.ShowInTaskbar = $false
$owner.TopMost = $true
$owner.Opacity = 0
$owner.Show()
$owner.Activate()

$f = New-Object System.Windows.Forms.OpenFileDialog
$f.ValidateNames = $false
$f.CheckFileExists = $false
$f.CheckPathExists = $true
$f.FileName = "选择此文件夹"
$f.Title = "请选择文件夹"
if ($f.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output (Split-Path $f.FileName)
}
$owner.Close()
$owner.Dispose()
`
        const child = spawn('powershell', ['-Sta', '-NoProfile', '-Command', script], {
            windowsHide: false
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (d: Buffer) => stdout += d.toString())
        child.stderr.on('data', (d: Buffer) => stderr += d.toString())

        child.on('close', (code: number) => {
            const path = stdout.trim()
            if (path && code === 0) {
                resolve({ success: true, path })
            } else if (stderr.trim()) {
                resolve({ success: false, error: stderr.trim() })
            } else {
                resolve({ success: false, error: '已取消选择文件夹' })
            }
        })
    })
})
