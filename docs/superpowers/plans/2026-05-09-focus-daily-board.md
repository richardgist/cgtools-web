# Focus Daily Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Focus date board that summarizes planned, completed, and unfinished tasks for copyable daily reports.

**Architecture:** Add focused date-report helpers to the Focus store, a SQLite-backed snapshot API, and a single Vue component rendered inside `focus.vue`. The component reuses existing task data and only persists manual snapshots.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, TypeScript, better-sqlite3.

---

### Task 1: Snapshot Storage

**Files:**
- Modify: `web-ui/server/utils/focusDb.ts`
- Create: `web-ui/server/api/focus/daily-snapshots.get.ts`
- Create: `web-ui/server/api/focus/daily-snapshots.post.ts`
- Modify: `web-ui/app/composables/useFocusStore.ts`

- [ ] Add `daily_snapshots` table with `date`, `plannedJson`, `completedJson`, `carriedJson`, `reportText`, `createdAt`, `updatedAt`.
- [ ] Add server GET/POST endpoints for listing and upserting snapshots.
- [ ] Add `DailySnapshot` type and store load/upsert actions.

### Task 2: Daily Report Helpers

**Files:**
- Modify: `web-ui/app/composables/useFocusStore.ts`

- [ ] Add helpers for local date ranges.
- [ ] Add `buildDailyReport(date)` that returns planned, completed, carried, and copy text.
- [ ] Prefer saved snapshot when present, while still allowing snapshot updates from current data.

### Task 3: Date Board UI

**Files:**
- Create: `web-ui/app/components/focus/DailyBoard.vue`
- Modify: `web-ui/app/pages/focus.vue`
- Modify: `web-ui/app/assets/css/focus.css`

- [ ] Add board/list mode switch in `focus.vue`.
- [ ] Implement recent 7 days, week, and month views.
- [ ] Show selected day detail and copy/save/update actions.
- [ ] Style with existing Focus design tokens.

### Task 4: Verification

**Files:**
- Modify only if needed after verification.

- [ ] Run `npm run build` in `web-ui`.
- [ ] Start Nuxt dev server and smoke-test `/focus`.
- [ ] Verify date switching, copy text, snapshot save/update, and reload persistence.
