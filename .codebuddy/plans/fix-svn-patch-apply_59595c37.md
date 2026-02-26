---
name: fix-svn-patch-apply
overview: 简化 apply.post.ts：去掉 strip level 循环和 GNU patch 回退，直接执行一次 svn patch，正确区分完全成功/部分成功（有冲突）/完全失败三种结果。前端对部分成功使用 warning 提示。
todos:
  - id: fix-apply-backend
    content: 重写 apply.post.ts：去掉 strip 循环和 GNU patch 回退，改为单次 svn patch 执行，新增 parseSvnPatchOutput 解析 stdout 返回三态结果（success/partial/fail）
    status: completed
  - id: enhance-apply-frontend
    content: 修改 svn.vue 的 doApply 函数：新增 partial 状态处理分支（warning toast + 冲突文件日志），新增 .toast-notification.warning 橙色渐变样式
    status: completed
    dependencies:
      - fix-apply-backend
---

## 用户需求

修复 SVN Patch 应用功能中的严重 bug，并增强前端结果提示。

## 产品概述

CGTools Web 工具中的 SVN Patch 功能用于从 SVN 分支 A 获取补丁并应用到分支 B（trunk）。当前后端 apply 逻辑存在严重缺陷：循环尝试 strip level 0~3，每次都真正执行 `svn patch`，遇到 rejected hunk 就认为失败继续下一个 strip level，导致同一个 patch 被反复应用多次，把目标文件搞乱。且还有多余的 GNU patch 回退逻辑。

## 核心功能

1. **后端修复**：去掉 strip level 循环和 GNU patch 回退，直接执行一次 `svn patch`（不带 --strip），因为源和目标路径结构完全一致，无需 strip
2. **三态结果解析**：解析 `svn patch` 的 stdout，区分三种结果——完全成功（有 U/G/A/D 行、无 rejected）、部分成功（有成功行也有 rejected）、完全失败（命令异常或全部 Skipped）
3. **前端 warning 提示**：doApply 函数新增对 partial 状态的处理，用橙色 warning toast 提示用户检查 .rej 文件；新增 toast 的 warning 样式

## 技术栈

- **框架**：Nuxt 4 + Vue 3 (Composition API, `<script setup>`)
- **后端**：Nuxt Server API (h3 defineEventHandler)
- **语言**：TypeScript（后端）、JavaScript（前端 Vue SFC）
- **运行环境**：Windows 本地，通过 child_process 调用 svn 命令行

## 实现方案

### 策略概述

将后端 `apply.post.ts` 从"循环尝试多个 strip level + GNU patch 回退"简化为"一次性执行 `svn patch`"，并对 stdout 进行精确解析区分三种结果状态。前端 `svn.vue` 增加对 `partial` 状态的处理和 warning 样式。

### 关键技术决策

1. **去掉 --strip 参数**：用户明确路径 A 和 B 的相对路径结构一致，`svn patch` 默认行为（strip=0）即可正确匹配路径。直接执行 `svn patch "${patchFilePath}" "${targetDir}"`。

2. **stdout 解析逻辑**：`svn patch` 的 stdout 每行格式为 `U  path`、`G  path`（merged）、`A  path`（新增）、`D  path`（删除）、`Skipped ...`（跳过）、`>         rejected hunk ...`（冲突 hunk）或 `C  path`（conflict 文件级）。解析策略：

- 用正则逐行匹配，统计 applied 行（`/^[UGAD]\s+/`）和 rejected/conflict 行（`/^>.*rejected/` 或 `/^C\s+/` 或 `Skipped`）
- `applied > 0 && conflicts == 0` → 完全成功
- `applied > 0 && conflicts > 0` → partial（部分成功有冲突）
- `applied == 0` → 完全失败

3. **返回值结构变更**：

- 完全成功：`{ success: true, message: stdout }`
- 部分成功：`{ success: true, partial: true, conflicts: string[], message: stdout }`
- 完全失败：`{ success: false, message: ... }`

4. **前端 toast warning 样式**：复用现有 toast 组件，新增 `.toast-notification.warning` CSS 类（橙色渐变），在 `doApply` 中根据 `result.partial` 分支处理。

### 实现注意事项

- **向后兼容**：返回值结构保持 `success` 字段，新增可选字段 `partial` 和 `conflicts`，不破坏现有调用。
- **临时文件清理**：确保所有路径（成功/部分成功/失败/异常）都清理临时 patch 文件，当前代码已有此模式，继续保持。
- **maxBuffer**：保留 10MB maxBuffer 限制，与现有模式一致。
- **svn patch 命令异常处理**：`svn patch` 即使有 rejected hunk 也会返回退出码 0（不会抛出异常），所以需要通过 stdout 内容判断而非 catch。只有真正的命令错误（如文件不存在、svn 不可用）才会抛出异常。

## 架构设计

数据流：

```
用户点击"应用" → applyPatch() 验证 → 弹出确认框 → doApply() 
→ POST /api/svn/apply { patchContent, targetDir, ... }
→ 后端写临时文件 → svn patch 执行一次 → 解析 stdout → 返回三态结果
→ 前端根据 success/partial/fail 显示对应 toast 和日志
```

## 目录结构

```
web-ui/
├── server/api/svn/
│   └── apply.post.ts    # [MODIFY] 核心修复：去掉 strip 循环和 GNU patch 回退，改为单次 svn patch 执行 + stdout 三态解析。新增 parseApplyOutput() 函数解析 stdout 中的 applied/rejected/skipped 行，返回 { applied: string[], conflicts: string[] }。根据解析结果返回 success/partial/fail 三种状态。保持临时文件清理逻辑。
└── app/pages/
    └── svn.vue           # [MODIFY] 前端增强：(1) doApply 函数新增 partial 状态处理分支，用 warning toast 提示冲突文件并建议检查 .rej 文件；(2) 新增 .toast-notification.warning CSS 样式（橙色渐变背景）；(3) partial 时日志显示具体冲突文件列表。
```

## 关键代码结构

```typescript
// apply.post.ts - stdout 解析函数签名
interface PatchResult {
  applied: string[]    // 成功应用的文件路径列表
  conflicts: string[]  // 有冲突/rejected 的文件路径列表
  skipped: string[]    // 跳过的文件路径列表
}

function parseSvnPatchOutput(stdout: string): PatchResult
```