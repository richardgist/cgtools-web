# Console Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing script runner into a dual-mode runner that can execute managed scripts and ad-hoc console commands from the same terminal output panel.

**Architecture:** Reuse the existing `/ws/terminal` WebSocket and active process tracking. The server accepts either a managed script payload or a console command payload; the Vue page switches between Script and Console modes while sharing run/stop/copy/clear terminal behavior.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nitro WebSocket route, Node child_process spawn.

---

### Task 1: Extend Terminal WebSocket

**Files:**
- Modify: `web-ui/server/routes/ws/terminal.ts`

- [ ] Add a console command branch for `{ action: "run", mode: "console", command, cwd, shell }`.
- [ ] Validate the command is non-empty.
- [ ] Validate `cwd` exists and is a directory when provided.
- [ ] Spawn PowerShell with `-Command` or CMD with `/c`.
- [ ] Keep the existing managed script branch intact.
- [ ] Reuse the same stdout/stderr/end/error event streaming shape.

### Task 2: Add Console Mode UI

**Files:**
- Modify: `web-ui/app/pages/scripts.vue`

- [ ] Add Script/Console segmented mode controls.
- [ ] Add console workdir, shell selector, command textarea, folder picker, and recent command list.
- [ ] Persist console settings and recent commands in localStorage.
- [ ] Route the Run button to `runScript` or `runConsoleCommand` based on the active mode.
- [ ] Keep terminal copy, clear, and stop behavior shared.

### Task 3: Verify

**Files:**
- Run: `npm exec vue-tsc -- --noEmit`
- Run: `npm run build`

- [ ] Confirm typecheck succeeds.
- [ ] Confirm production build succeeds.
