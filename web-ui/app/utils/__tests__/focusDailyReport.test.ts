import assert from 'node:assert/strict'
import { buildDailyReport } from '../focusDailyReport'

const jan2Morning = new Date(2026, 0, 2, 9, 0, 0).getTime()
const jan2Evening = new Date(2026, 0, 2, 18, 0, 0).getTime()
const jan3Morning = new Date(2026, 0, 3, 9, 0, 0).getTime()

const report = buildDailyReport(
  [
    {
      id: 'planned-open',
      name: '修复启动参数',
      completed: false,
      listId: 'default',
      pomodoroEstimate: 1,
      pomodoroCompleted: 0,
      priority: 'none',
      dueDate: '2026-01-02',
      notes: '',
      createdAt: jan2Morning,
      order: 2,
    },
    {
      id: 'planned-done',
      name: '整理日报看板方案',
      completed: true,
      completedAt: jan2Evening,
      listId: 'default',
      pomodoroEstimate: 1,
      pomodoroCompleted: 0,
      priority: 'none',
      dueDate: '2026-01-02',
      notes: '',
      createdAt: jan2Morning,
      order: 1,
    },
    {
      id: 'unplanned-done',
      name: '处理临时问题',
      completed: true,
      completedAt: jan2Morning,
      listId: 'default',
      pomodoroEstimate: 1,
      pomodoroCompleted: 0,
      priority: 'none',
      notes: '',
      createdAt: jan2Morning,
      order: 3,
    },
    {
      id: 'other-day',
      name: '明天的任务',
      completed: true,
      completedAt: jan3Morning,
      listId: 'default',
      pomodoroEstimate: 1,
      pomodoroCompleted: 0,
      priority: 'none',
      dueDate: '2026-01-03',
      notes: '',
      createdAt: jan3Morning,
      order: 4,
    },
  ],
  '2026-01-02',
)

assert.deepEqual(report.planned.map((task) => task.name), ['整理日报看板方案', '修复启动参数'])
assert.deepEqual(report.completed.map((task) => task.name), ['处理临时问题', '整理日报看板方案'])
assert.deepEqual(report.carried.map((task) => task.name), ['修复启动参数'])
assert.equal(
  report.reportText,
  [
    '今日计划：',
    '- 整理日报看板方案',
    '- 修复启动参数',
    '',
    '今日完成：',
    '- 处理临时问题',
    '- 整理日报看板方案',
    '',
    '未完成/顺延：',
    '- 修复启动参数',
  ].join('\n'),
)

const emptyReport = buildDailyReport([], '2026-01-02')
assert.equal(
  emptyReport.reportText,
  ['今日计划：', '- 无', '', '今日完成：', '- 无', '', '未完成/顺延：', '- 无'].join('\n'),
)
