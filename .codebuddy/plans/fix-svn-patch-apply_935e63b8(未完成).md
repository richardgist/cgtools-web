---
name: fix-svn-patch-apply
overview: 修复 SVN Patch 应用逻辑：区分"路径不匹配（完全失败）"和"有冲突的 hunk（部分成功）"，避免反复尝试 strip level 导致重复应用。
todos:
  - id: fix-apply-logic
    content: 重写 apply.post.ts 中 svn patch 输出判断逻辑：新增 parseSvnPatchOutput 解析函数，区分完全成功/部分成功/路径不匹配，部分成功时返回冲突详情
    status: pending
  - id: update-frontend-partial
    content: 修改 svn.vue 的 doApply 函数，新增 partial 状态的 warning 提示，展示冲突文件数和 .rej 文件检查提示
    status: pending
    dependencies:
      - fix-apply-logic
---

## 用户需求

SVN Patch 工具在应用补丁时，如果目标文件与 diff 基准版本存在差异（跨分支合入场景），部分 hunk 会冲突（rejected），但工具错误地将"有冲突"等同于"完全失败"，反复尝试不同 strip level，最终报"所有 strip 级别均失败"。

## 产品概述

用户从 SVN 分支获取补丁应用到 trunk，属于跨分支合入场景。`svn patch` 在部分 hunk 冲突时仍会成功应用其余 hunk，冲突内容写入 `.rej` 文件供用户手动解决。当前工具将此视为失败，导致反复应用同一 patch 造成混乱。

## 核心功能

- 区分"完全成功"、"部分成功（有冲突）"和"完全失败（路径不匹配）"三种情况
- 部分成功时返回成功结果，明确告知用户哪些文件有冲突，提示检查 `.rej` 文件
- 仅在路径完全不匹配（所有文件 Skipped）时才尝试下一个 strip level
- 前端对"部分成功"使用警告样式展示，区别于完全成功和完全失败

## 技术栈

- Nuxt 4 + Nitro (h3) 服务端 API（TypeScript）
- Vue 3 前端（`<script setup>` + Composition API）

## 实现方案

### 整体策略

重写 `apply.post.ts` 中 `svn patch` 输出的判断逻辑，通过解析 stdout 中的行前缀来区分三种结果状态。同时在前端 `svn.vue` 中新增对"部分成功"（`partial: true`）状态的处理，用警告样式展示冲突信息。

### 关键技术决策

**svn patch 输出格式解析规则：**

`svn patch` 的 stdout 每行以状态前缀开头：

- `U  filename` — 文件被成功更新（Update）
- `G  filename` — 文件被合并更新（merGed）
- `A  filename` — 文件被新增（Added）
- `D  filename` — 文件被删除（Deleted）
- `>         rejected hunk ...` — hunk 被拒绝
- `Skipped missing target: ...` — 路径不匹配，文件被跳过

**三种结果的判断逻辑：**

1. **完全成功**：stdout 包含 `U`/`G`/`A`/`D` 行，不包含 `rejected` → `{ success: true }`
2. **部分成功**：stdout 包含 `U`/`G`/`A`/`D` 行，也包含 `rejected` → `{ success: true, partial: true, conflicts: N }`
3. **路径不匹配**：stdout 全是 `Skipped` 或无有效输出 → 继续尝试下一个 strip level

这确保了：只有路径真正不匹配时才尝试更高的 strip level，避免同一 patch 被反复应用。

### 性能与可靠性

- 判断逻辑为简单的字符串包含检查，无性能开销
- 使用正则 `/^[UGAD]\s{2}/m` 匹配行首，避免误匹配文件名中的字符
- 保留现有的 GNU `patch` 回退机制，但同样需要处理部分成功场景
- `Summary of conflicts` 行中的数字可直接提取作为冲突计数

## 实现细节

### 后端修改 (`apply.post.ts`)

核心改动在 strip level 循环内的判断逻辑：

```
原逻辑：stdout 包含 rejected → 跳过（认为失败）
新逻辑：
  1. 检查是否有实际应用的文件（正则匹配 U/G/A/D 行）
  2. 有应用文件 + 无冲突 → 完全成功
  3. 有应用文件 + 有冲突 → 部分成功，提取冲突信息
  4. 无应用文件（全 Skipped 或空输出）→ 继续下一 strip level
```

新增辅助函数 `parseSvnPatchOutput(stdout)` 解析输出，返回 `{ applied: string[], rejected: string[], skipped: string[], conflictCount: number }`。

### 前端修改 (`svn.vue`)

在 `doApply()` 中检查 `result.partial`：

- `partial: true` 时使用 `warning` 类型的 toast 和日志样式
- 消息中包含冲突数量和 `.rej` 文件提示

## 目录结构

```
web-ui/
├── server/api/svn/
│   └── apply.post.ts    # [MODIFY] 重写 svn patch 输出判断逻辑：新增 parseSvnPatchOutput 辅助函数解析 stdout，区分完全成功/部分成功/路径不匹配三种状态；部分成功时返回 { success: true, partial: true, conflicts, message }；仅路径不匹配时尝试下一 strip level
└── app/pages/
    └── svn.vue           # [MODIFY] doApply() 中新增 partial 状态处理：用 warning toast 展示冲突信息，提示用户检查 .rej 文件
```