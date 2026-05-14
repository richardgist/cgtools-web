import { defineEventHandler, getQuery } from 'h3'
import { spawn } from 'child_process'

const escapeSingleQuotedPowerShell = (input: string) => input.replace(/'/g, "''")

export default defineEventHandler(async (event) => {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') {
            return resolve({ success: false, error: '目前选择文件夹功能仅支持 Windows 系统' })
        }

        const query = getQuery(event)
        const initialPath = typeof query.path === 'string' ? query.path.trim() : ''
        const escapedInitialPath = escapeSingleQuotedPowerShell(initialPath)

        // 用 Windows Explorer 风格的 IFileOpenDialog 选择文件夹，比 WinForms FolderBrowserDialog 更适合粘贴路径和切换盘符。
        const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class ModernFolderPicker
{
    private const uint CLSCTX_INPROC_SERVER = 0x1;
    private const uint FOS_PICKFOLDERS = 0x20;
    private const uint FOS_FORCEFILESYSTEM = 0x40;
    private const uint FOS_NOCHANGEDIR = 0x8;
    private const uint FOS_PATHMUSTEXIST = 0x800;
    private const uint SIGDN_FILESYSPATH = 0x80058000;
    private const int ERROR_CANCELLED = unchecked((int)0x800704C7);

    [DllImport("ole32.dll")]
    private static extern int CoCreateInstance(ref Guid clsid, IntPtr outer, uint context, ref Guid iid, out IFileOpenDialog dialog);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string path,
        IntPtr bindContext,
        ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IShellItem item);

    [DllImport("ole32.dll")]
    private static extern void CoTaskMemFree(IntPtr pv);

    public static string Pick(string initialPath, IntPtr owner)
    {
        Guid clsid = new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7");
        Guid iid = new Guid("D57C7288-D4AD-4768-BE02-9D969532D960");
        IFileOpenDialog dialog;
        Marshal.ThrowExceptionForHR(CoCreateInstance(ref clsid, IntPtr.Zero, CLSCTX_INPROC_SERVER, ref iid, out dialog));

        uint options;
        dialog.GetOptions(out options);
        dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR | FOS_PATHMUSTEXIST);
        dialog.SetTitle("请选择文件夹");
        dialog.SetOkButtonLabel("选择文件夹");

        if (!string.IsNullOrWhiteSpace(initialPath) && Directory.Exists(initialPath))
        {
            Guid shellItemId = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
            IShellItem initialItem;
            SHCreateItemFromParsingName(initialPath, IntPtr.Zero, ref shellItemId, out initialItem);
            dialog.SetFolder(initialItem);
        }

        int result = dialog.Show(owner);
        if (result == ERROR_CANCELLED)
        {
            return null;
        }
        Marshal.ThrowExceptionForHR(result);

        IShellItem selectedItem;
        dialog.GetResult(out selectedItem);

        IntPtr pathPtr;
        selectedItem.GetDisplayName(SIGDN_FILESYSPATH, out pathPtr);
        try
        {
            return Marshal.PtrToStringUni(pathPtr);
        }
        finally
        {
            CoTaskMemFree(pathPtr);
        }
    }

    [ComImport]
    [Guid("D57C7288-D4AD-4768-BE02-9D969532D960")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint fileTypes, IntPtr filterSpec);
        void SetFileTypeIndex(uint fileType);
        void GetFileTypeIndex(out uint fileType);
        void Advise(IntPtr events, out uint cookie);
        void Unadvise(uint cookie);
        void SetOptions(uint options);
        void GetOptions(out uint options);
        void SetDefaultFolder(IShellItem folder);
        void SetFolder(IShellItem folder);
        void GetFolder(out IShellItem folder);
        void GetCurrentSelection(out IShellItem item);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string text);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
        void GetResult(out IShellItem item);
        void AddPlace(IShellItem item, uint alignment);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string extension);
        void Close(int result);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr filter);
        void GetResults(out IntPtr items);
        void GetSelectedItems(out IntPtr items);
    }

    [ComImport]
    [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        void BindToHandler(IntPtr bindContext, ref Guid handlerId, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem parent);
        void GetDisplayName(uint sigdnName, out IntPtr name);
        void GetAttributes(uint mask, out uint attributes);
        void Compare(IShellItem item, uint hint, out int order);
    }
}
"@

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

try {
    $selectedPath = [ModernFolderPicker]::Pick('${escapedInitialPath}', $owner.Handle)
    if ($selectedPath) {
        Write-Output $selectedPath
    }
} finally {
    $owner.Close()
    $owner.Dispose()
}
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
                resolve({ success: false, cancelled: true, error: '已取消选择文件夹' })
            }
        })
    })
})
