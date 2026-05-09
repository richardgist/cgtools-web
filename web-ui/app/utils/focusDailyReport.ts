export interface DailyReportTask {
  id: string
  name: string
  completed: boolean
  completedAt?: number
  dueDate?: string
  order: number
}

export interface DailyReport {
  date: string
  planned: DailyReportTask[]
  completed: DailyReportTask[]
  carried: DailyReportTask[]
  reportText: string
}

function getDateRange(date: string) {
  const start = new Date(`${date}T00:00:00`).getTime()
  return { start, end: start + 86400000 }
}

function formatSection(title: string, tasks: DailyReportTask[]) {
  const lines = [title]
  if (tasks.length === 0) {
    lines.push('- 无')
  } else {
    lines.push(...tasks.map((task) => `- ${task.name}`))
  }
  return lines
}

export function buildDailyReport(tasks: DailyReportTask[], date: string): DailyReport {
  const { start, end } = getDateRange(date)

  const planned = tasks
    .filter((task) => task.dueDate === date)
    .sort((a, b) => a.order - b.order)

  const completed = tasks
    .filter((task) => task.completedAt !== undefined && task.completedAt >= start && task.completedAt < end)
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))

  const carried = planned.filter((task) => !task.completed)

  const reportText = [
    ...formatSection('今日计划：', planned),
    '',
    ...formatSection('今日完成：', completed),
    '',
    ...formatSection('未完成/顺延：', carried),
  ].join('\n')

  return { date, planned, completed, carried, reportText }
}
