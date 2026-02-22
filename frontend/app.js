/**
 * CGTools Web - 前端应用逻辑
 */

// ==================== 全局状态 ====================
let selectedScript = null;
let patchContent = '';
let ws = null;

// ==================== 通用工具 ====================
function showPage(pageName) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    // Deactivate all nav items
    document.querySelectorAll('.nav-item').forEach(s => s.classList.remove('active'));

    // Show target page
    const targetPage = document.getElementById(pageName + '-page');
    if (targetPage) targetPage.classList.add('active');

    // Activate nav item
    // Find the nav item that corresponds to this page
    const navItem = document.querySelector(`.nav-item[onclick="showPage('${pageName}')"]`);
    if (navItem) navItem.classList.add('active');
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
    `).join('') || '<div style="color: var(--text-secondary); padding: 16px; text-align: center;">暂无脚本</div>';
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
        ? `<div style="color: var(--success); font-weight: 600; font-size: 15px;">⭐ 当前激活: ${currentConfig.name}</div>
           <div style="font-size: 12px; color: var(--text-secondary); margin-top: 6px;">${currentConfig.config.baseApi}</div>`
        : '<span style="color: var(--text-tertiary);">未激活任何配置</span>';

    container.innerHTML = configs.map(c => {
        const token = c.config.authToken || '';
        const safeToken = token.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
        <div class="config-item ${c.isCurrent ? 'current' : ''}">
            <div class="config-info">
                <span class="name">${c.isCurrent ? '⭐ ' : ''}${c.name}</span>
                <span class="api">${c.config.baseApi}</span>
                <div style="font-size: 12px; color: var(--text-tertiary); margin-top: 4px; display: flex; align-items: center; gap: 6px;">
                    <span class="token-text" data-token="${safeToken}" style="font-family: monospace;">••••••••••••••••••••••••••••</span>
                    <svg onclick="toggleToken(this)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="cursor: pointer; opacity: 0.7;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </div>
            </div>
            <div class="config-actions">
                <button class="fluent-btn sub" onclick="editConfigName('${c.name}', '${c.config.baseApi}', '${safeToken}', event)">编辑</button>
                ${!c.isCurrent ? `<button class="fluent-btn primary" onclick="switchConfigName('${c.name}', event)">启用</button>` : `<button class="fluent-btn" style="border-color: var(--success); color: var(--success);" onclick="switchConfigName('${c.name}', event)">重新启用</button>`}
                <button class="fluent-btn danger" onclick="deleteConfigName('${c.name}', event)">删除</button>
            </div>
        </div>
        `;
    }).join('') || '<div style="text-align: center; color: var(--text-tertiary); padding: 24px;">暂无配置，请添加</div>';
}

function toggleToken(btn) {
    const textSpan = btn.previousElementSibling;
    const token = textSpan.getAttribute('data-token');
    if (textSpan.textContent.includes('••••')) {
        textSpan.textContent = token;
        btn.style.stroke = 'var(--accent-default)';
        btn.style.opacity = '1';
    } else {
        textSpan.textContent = '••••••••••••••••••••••••••••';
        btn.style.stroke = 'currentColor';
        btn.style.opacity = '0.7';
    }
}

function editConfigName(name, api, token, event) {
    if (event) event.stopPropagation();
    document.getElementById('config-name').value = name;
    document.getElementById('config-api').value = api;
    document.getElementById('config-token').value = token;

    document.getElementById('config-name').focus();

    // 修改按钮文字为保存修改
    const addBtn = document.querySelector('button[onclick="addConfig()"]');
    if (addBtn) addBtn.textContent = '保存修改';
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

    alert('✓ 保存成功');
    document.getElementById('config-name').value = '';
    document.getElementById('config-token').value = '';

    const addBtn = document.querySelector('button[onclick="addConfig()"]');
    if (addBtn) addBtn.textContent = '+ 添加';

    loadConfigs();
}

async function switchConfigName(name, event) {
    if (event) event.stopPropagation();

    const btn = event ? event.target : null;
    let originalText = '';
    if (btn) {
        if (btn.disabled) return;
        btn.disabled = true;
        originalText = btn.textContent;
        btn.textContent = '⏳...';
    }

    setStatus('正在切换配置...');

    try {
        const result = await api('/api/claude/switch/' + name, { method: 'POST' });
        alert(result.message);
        loadConfigs();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
        setStatus('就绪');
    }
}

async function deleteConfigName(name, event) {
    if (event) event.stopPropagation();
    if (!confirm('确定删除 "' + name + '"?')) return;
    await api('/api/claude/configs/' + name, { method: 'DELETE' });
    alert('✓ 已删除: ' + name);
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
    // Default to home
    showPage('home');

    loadScripts();
    loadConfigs();
});
