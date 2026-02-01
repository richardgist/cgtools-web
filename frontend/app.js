/**
 * CGTools Web - 前端应用逻辑
 */

// ==================== 全局状态 ====================
let selectedScript = null;
let selectedConfig = null;
let patchContent = '';
let ws = null;

// ==================== 通用工具 ====================
function showPage(pageName) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
    document.getElementById(pageName + '-page').classList.add('active');
    event.currentTarget.classList.add('active');
}

function setStatus(text) {
    document.getElementById('status-text').textContent = text;
}

async function api(url, options = {}) {
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    return response.json();
}

// ==================== 脚本运行器 ====================
async function loadScripts() {
    const scripts = await api('/api/scripts');
    const container = document.getElementById('script-items');
    container.innerHTML = scripts.map(s => `
        <div class="list-item ${selectedScript === s.path ? 'active' : ''}" 
             onclick="selectScript('${s.path}', '${s.name}')">
            <span>${s.icon}</span>
            <span>${s.name}</span>
        </div>
    `).join('') || '<div style="color: var(--text-muted); padding: 16px; text-align: center;">暂无脚本</div>';
}

function selectScript(path, name) {
    selectedScript = path;
    document.getElementById('selected-script').textContent = name;
    document.getElementById('run-btn').disabled = false;
    loadScripts();
}

function runScript() {
    if (!selectedScript) return;

    const terminal = document.getElementById('script-terminal');
    terminal.innerHTML = '<div class="info">▶ Starting: ' + selectedScript.split('\\').pop() + '\n</div>';

    document.getElementById('run-btn').disabled = true;
    document.getElementById('stop-btn').disabled = false;

    ws = new WebSocket('ws://' + location.host + '/ws/terminal');

    ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'run', script: selectedScript }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'stdout' || data.type === 'stderr') {
            const div = document.createElement('div');
            div.className = data.type;
            div.textContent = data.data;
            terminal.appendChild(div);
            terminal.scrollTop = terminal.scrollHeight;
        } else if (data.type === 'end') {
            const div = document.createElement('div');
            div.className = 'info';
            div.textContent = '\n✓ Process exited with code ' + data.exitCode;
            terminal.appendChild(div);
            document.getElementById('run-btn').disabled = false;
            document.getElementById('stop-btn').disabled = true;
        }
    };

    ws.onerror = () => {
        document.getElementById('run-btn').disabled = false;
        document.getElementById('stop-btn').disabled = true;
    };
}

function stopScript() {
    if (ws) ws.send(JSON.stringify({ action: 'terminate' }));
    api('/api/scripts/terminate', { method: 'POST' });
    document.getElementById('run-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
}

function clearTerminal() {
    document.getElementById('script-terminal').innerHTML = '';
}

// ==================== Claude 配置 ====================
async function loadConfigs() {
    const configs = await api('/api/claude/configs');
    const container = document.getElementById('config-list');
    const currentConfig = configs.find(c => c.isCurrent);

    document.getElementById('current-config').innerHTML = currentConfig
        ? `<div style="color: var(--success); font-weight: 600; font-size: 15px;">⭐ ${currentConfig.name}</div>
           <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">${currentConfig.config.baseApi}</div>`
        : '<span style="color: var(--text-muted);">未激活任何配置</span>';

    container.innerHTML = configs.map(c => `
        <div class="config-item ${c.isCurrent ? 'current' : ''} ${selectedConfig === c.name ? 'active' : ''}"
             onclick="selectConfig('${c.name}')">
            <span class="name">${c.isCurrent ? '⭐ ' : ''}${c.name}</span>
            <span class="api">${c.config.baseApi}</span>
            <span class="token">${c.config.authToken.substring(0, 16)}...</span>
        </div>
    `).join('') || '<div style="text-align: center; color: var(--text-muted); padding: 24px;">暂无配置，请添加</div>';
}

function selectConfig(name) {
    selectedConfig = name;
    loadConfigs();
}

async function addConfig() {
    const name = document.getElementById('config-name').value.trim();
    const baseApi = document.getElementById('config-api').value.trim();
    const authToken = document.getElementById('config-token').value.trim();

    if (!name || !baseApi || !authToken) { alert('请填写完整'); return; }

    await api('/api/claude/configs', {
        method: 'POST',
        body: JSON.stringify({ name, config: { baseApi, authToken } })
    });

    alert('✓ 添加成功');
    document.getElementById('config-name').value = '';
    document.getElementById('config-token').value = '';
    loadConfigs();
}

async function switchConfig() {
    if (!selectedConfig) { alert('请先选择配置'); return; }

    // 防止重复点击
    const btn = event.target;
    if (btn.disabled) return;
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = '⏳ 切换中...';
    setStatus('正在切换配置...');

    try {
        const result = await api('/api/claude/switch/' + selectedConfig, { method: 'POST' });
        alert(result.message);
        loadConfigs();
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
        setStatus('就绪');
    }
}

async function deleteConfig() {
    if (!selectedConfig) { alert('请先选择配置'); return; }
    if (!confirm('确定删除 "' + selectedConfig + '"?')) return;
    await api('/api/claude/configs/' + selectedConfig, { method: 'DELETE' });
    alert('✓ 已删除');
    selectedConfig = null;
    loadConfigs();
}

// ==================== SVN Patch ====================
function svnLog(message, level = 'info') {
    const log = document.getElementById('svn-log');
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = level;
    div.textContent = '[' + time + '] ' + message;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

function clearSvnLog() { document.getElementById('svn-log').innerHTML = ''; }

async function viewLog() {
    const revision = document.getElementById('revision').value.trim();
    const pathA = document.getElementById('path-a').value.trim();
    if (!revision || !pathA) { alert('请输入提交号和路径'); return; }

    setStatus('获取日志...');
    svnLog('获取 r' + revision + ' 日志...');

    const result = await api('/api/svn/log?revision=' + revision + '&url=' + encodeURIComponent(pathA), { method: 'POST' });
    document.getElementById('diff-content').textContent = result.log;
    svnLog(result.success ? '完成' : '失败', result.success ? 'info' : 'stderr');
    setStatus('就绪');
}

async function generatePatch() {
    const revision = document.getElementById('revision').value.trim();
    const pathA = document.getElementById('path-a').value.trim();
    if (!revision || !pathA) { alert('请输入提交号和路径'); return; }

    setStatus('生成 Patch...');
    svnLog('生成 r' + revision + ' Patch...');

    const result = await api('/api/svn/diff', {
        method: 'POST',
        body: JSON.stringify({
            revision, url: pathA,
            fromRepoRoot: document.getElementById('from-repo-root').checked,
            parentLevels: document.getElementById('use-parent').checked ? 1 : 0
        })
    });

    if (result.success) {
        patchContent = result.content;
        document.getElementById('diff-content').innerHTML = highlightDiff(result.content);
        document.getElementById('save-patch-btn').disabled = !result.content;
        document.getElementById('apply-patch-btn').disabled = !result.content;
        svnLog(result.content ? '成功 (' + result.content.length + ' bytes)' : '内容为空!', result.content ? 'info' : 'stderr');
    } else {
        svnLog('失败: ' + result.error, 'stderr');
    }
    setStatus('就绪');
}

function highlightDiff(content) {
    if (!content) return '';
    return content.split('\n').map(line => {
        const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (line.startsWith('+') && !line.startsWith('+++')) return '<span class="diff-add">' + escaped + '</span>';
        if (line.startsWith('-') && !line.startsWith('---')) return '<span class="diff-del">' + escaped + '</span>';
        if (line.startsWith('@@') || line.startsWith('Index:')) return '<span class="diff-header">' + escaped + '</span>';
        return escaped;
    }).join('\n');
}

function savePatch() {
    if (!patchContent) return;
    const blob = new Blob([patchContent], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'patch_r' + document.getElementById('revision').value.replace(':', '_') + '.patch';
    a.click();
    svnLog('已下载');
}

async function applyPatch() {
    if (!patchContent) return;
    const pathB = document.getElementById('path-b').value.trim();
    const pathA = document.getElementById('path-a').value.trim();
    if (!pathB) { alert('请输入目标路径 B'); return; }
    if (!confirm('应用到: ' + pathB + '?')) return;

    setStatus('应用 Patch...');
    svnLog('应用到 ' + pathB + '...');

    const result = await api('/api/svn/apply', {
        method: 'POST',
        body: JSON.stringify({ patchContent, targetDir: pathB, sourcePath: pathA, revision: document.getElementById('revision').value })
    });

    svnLog(result.message, result.success ? 'info' : 'stderr');
    alert(result.message);
    setStatus('就绪');
}

function swapPaths() {
    const a = document.getElementById('path-a');
    const b = document.getElementById('path-b');
    [a.value, b.value] = [b.value, a.value];
    svnLog('已交换路径');
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    loadScripts();
    loadConfigs();
});
