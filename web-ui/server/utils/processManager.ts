import type { ChildProcess } from 'child_process'

export const activeProcesses = new Map<string, ChildProcess>()
