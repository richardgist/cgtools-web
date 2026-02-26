---
name: svn-paths-persistence
overview: 为旧前端 (frontend/app.js) 的 SVN Patch 页面添加路径 A、路径 B 的 localStorage 持久化功能，使页面刷新或服务器重启后自动恢复上次填写的路径。
todos:
  - id: add-svn-localstorage
    content: 在 frontend/app.js 中实现 SVN 设置的 localStorage 持久化：新增 saveSvnSettings/loadSvnSettings 函数，在 DOMContentLoaded 中恢复设置并绑定 input/change 事件，在 swapPaths 末尾追加保存调用
    status: pending
---

## 用户需求

在旧版前端（`frontend/app.js`）的 SVN Patch 页面中，为路径 A、路径 B 以及两个复选框（从仓库根目录、包含上级目录）添加本地持久化功能，使用户刷新页面或服务器重启后，之前输入的路径和勾选状态仍然保留，无需重新输入。

## 产品概述

SVN Patch 页面包含路径 A（源/基准）和路径 B（目标）两个输入框，以及"从仓库根目录"和"包含上级目录"两个复选框。当前每次页面刷新后这些字段都会清空，用户需要反复手动输入相同路径，体验不佳。需要通过浏览器本地存储自动保存和恢复这些设置。

## 核心功能

- 页面加载时自动恢复上次保存的路径 A、路径 B 以及两个复选框的状态
- 用户修改路径输入框或切换复选框时自动保存当前设置
- 交换路径操作（swapPaths）后自动保存交换后的状态
- 与 Vue 新版前端使用相同的 localStorage key（`cgtools_svn_settings`），保持数据一致性

## 技术栈

- 原生 JavaScript（与现有 `frontend/app.js` 保持一致）
- 浏览器 `localStorage` API 进行数据持久化

## 实现方案

### 整体策略

在 `frontend/app.js` 中新增 localStorage 读写逻辑，参考 Vue 版本（`web-ui/app/pages/svn.vue` 第 186-209 行）的实现，使用相同的 key `cgtools_svn_settings` 和相同的数据结构 `{ pathA, pathB, fromRepoRoot, useParent }`，确保两套前端的设置数据互通。

### 关键技术决策

1. **使用与 Vue 版本相同的 localStorage key 和数据格式**：两套前端共享设置数据，用户在任一版本中设置的路径在另一版本中也能恢复，减少切换成本。
2. **事件监听方式**：对输入框监听 `input` 事件（实时保存），对复选框监听 `change` 事件，保证任何修改都能及时持久化。
3. **在 `swapPaths()` 中手动触发保存**：因为直接赋值 `a.value = ...` 不会触发 `input` 事件，所以交换后需要显式调用保存函数。

### 性能与可靠性

- localStorage 操作为同步且极快，对用户交互无感知延迟。
- JSON.parse 使用 try-catch 包裹，防止存储数据损坏导致页面异常。
- 读取时对每个字段提供默认值（空字符串/false），防止旧数据缺少字段。

## 实现细节

### 修改点

1. **新增 `saveSvnSettings()` 函数**：收集 4 个字段当前值，序列化为 JSON 写入 localStorage。
2. **新增 `loadSvnSettings()` 函数**：从 localStorage 读取并解析 JSON，恢复到对应 DOM 元素。
3. **在 `DOMContentLoaded` 回调中调用 `loadSvnSettings()`**：确保页面加载时恢复设置。
4. **为 4 个输入/复选框元素绑定事件监听**：值变化时调用 `saveSvnSettings()`。
5. **在 `swapPaths()` 函数末尾调用 `saveSvnSettings()`**：交换路径后保存。

### 注意事项

- 不引入任何新的依赖或架构模式，完全复用现有原生 JS 风格。
- 不修改 HTML 结构，仅在 JS 中添加逻辑。
- 保持向后兼容：如果 localStorage 中没有已保存数据，输入框保持空白（与当前行为一致）。

## 架构设计

数据流非常简单，无需架构图：

- 用户输入 -> `input`/`change` 事件 -> `saveSvnSettings()` -> `localStorage.setItem()`
- 页面加载 -> `DOMContentLoaded` -> `loadSvnSettings()` -> `localStorage.getItem()` -> 恢复 DOM 值

## 目录结构

```
frontend/
└── app.js  # [MODIFY] 在 SVN Patch 区域新增 saveSvnSettings() 和 loadSvnSettings() 函数；在 swapPaths() 末尾追加保存调用；在 DOMContentLoaded 中添加设置恢复和事件监听绑定逻辑。
```