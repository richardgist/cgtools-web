// 专注清单 - 核心状态管理（SQLite 后端）
import { ref, computed, type Ref } from 'vue'

// ==================== Types ====================
export interface FocusTask {
    id: string
    name: string
    completed: boolean
    completedAt?: number
    listId: string
    pomodoroEstimate: number
    pomodoroCompleted: number
    priority: 'none' | 'low' | 'medium' | 'high'
    dueDate?: string // YYYY-MM-DD
    notes: string
    createdAt: number
    order: number
}

export interface FocusList {
    id: string
    name: string
    color: string
    folderId?: string
    order: number
    createdAt: number
}

export interface FocusFolder {
    id: string
    name: string
    collapsed: boolean
    order: number
}

export interface PomodoroRecord {
    id: string
    taskId: string
    taskName: string
    listId: string
    startTime: number
    endTime: number
    duration: number // in seconds
    completed: boolean
}

export interface FocusSettings {
    pomodoroDuration: number    // minutes
    shortBreakDuration: number  // minutes
    longBreakDuration: number   // minutes
    longBreakInterval: number   // number of pomodoros before long break
    autoStartNextPomodoro: boolean
    autoStartBreak: boolean
    disableBreak: boolean
    darkMode: 'system' | 'on' | 'off'
    theme: string
    addTaskOnTop: boolean
    dailyGoalMinutes: number    // daily focus goal in minutes
}

export type SmartView = 'today' | 'tomorrow' | 'week' | 'next7' | 'high' | 'planned' | 'completed' | 'all'

// ==================== Constants ====================
const LIST_COLORS = [
    '#E53935', '#D81B60', '#8E24AA', '#5E35B1',
    '#3949AB', '#1E88E5', '#00ACC1', '#00897B',
    '#43A047', '#7CB342', '#C0CA33', '#FDD835',
    '#FFB300', '#FB8C00', '#6D4C41', '#757575',
]

const DEFAULT_SETTINGS: FocusSettings = {
    pomodoroDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    autoStartNextPomodoro: false,
    autoStartBreak: true,
    disableBreak: false,
    darkMode: 'off',
    theme: 'starry',
    addTaskOnTop: true,
    dailyGoalMinutes: 180,
}

const SMART_VIEWS: { key: SmartView; label: string; icon: string }[] = [
    { key: 'today', label: '今天', icon: '☀️' },
    { key: 'tomorrow', label: '明天', icon: '🌅' },
    { key: 'week', label: '本周', icon: '📅' },
    { key: 'next7', label: '未来7天', icon: '📆' },
    { key: 'high', label: '高优先级', icon: '🔥' },
    { key: 'planned', label: '已计划', icon: '📋' },
    { key: 'completed', label: '已完成', icon: '✅' },
    { key: 'all', label: '全部任务', icon: '📝' },
]

// ==================== Helpers ====================
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

const todayStr = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const tomorrowStr = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const getWeekRange = () => {
    const now = new Date()
    const day = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    return { start: monday, end: sunday }
}

const getNext7Range = () => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setDate(now.getDate() + 7)
    end.setHours(23, 59, 59, 999)
    return { start: now, end }
}

const dateInRange = (dateStr: string, start: Date, end: Date) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d >= start && d <= end
}

// ==================== API Helpers ====================
async function api<T>(url: string, body?: any): Promise<T> {
    if (body !== undefined) {
        const res = await $fetch<T>(url, { method: 'POST', body })
        return res
    }
    return await $fetch<T>(url)
}

// ==================== Store Singleton ====================
let _store: ReturnType<typeof createFocusStore> | null = null

function createFocusStore() {
    // --- Reactive State (initialized empty, populated from server) ---
    const tasks: Ref<FocusTask[]> = ref([])
    const lists: Ref<FocusList[]> = ref([
        { id: 'default', name: '默认清单', color: '#1E88E5', order: 0, createdAt: Date.now() }
    ])
    const folders: Ref<FocusFolder[]> = ref([])
    const records: Ref<PomodoroRecord[]> = ref([])
    const settings: Ref<FocusSettings> = ref({ ...DEFAULT_SETTINGS })

    // UI state
    const currentView = ref<SmartView | string>('today')
    const selectedTaskId = ref<string | null>(null)
    const showCompletedTasks = ref(true)
    let _loaded = false

    // --- Load from server ---
    async function loadFromServer() {
        if (_loaded) return
        _loaded = true
        try {
            const [serverTasks, serverLists, serverRecords, serverSettings] = await Promise.all([
                api<FocusTask[]>('/api/focus/tasks'),
                api<FocusList[]>('/api/focus/lists'),
                api<PomodoroRecord[]>('/api/focus/records'),
                api<Partial<FocusSettings>>('/api/focus/settings'),
            ])
            tasks.value = serverTasks
            if (serverLists.length > 0) lists.value = serverLists
            records.value = serverRecords
            settings.value = { ...DEFAULT_SETTINGS, ...serverSettings }
        } catch (e) {
            console.error('[FocusStore] Failed to load from server:', e)
        }
    }

    // --- Computed ---
    const selectedTask = computed(() =>
        selectedTaskId.value ? tasks.value.find(t => t.id === selectedTaskId.value) ?? null : null
    )

    const currentListName = computed(() => {
        const sv = SMART_VIEWS.find(s => s.key === currentView.value)
        if (sv) return sv.label
        const list = lists.value.find(l => l.id === currentView.value)
        return list?.name ?? '任务'
    })

    const filteredTasks = computed(() => {
        const view = currentView.value
        const today = todayStr()
        const tomorrow = tomorrowStr()
        const weekRange = getWeekRange()
        const next7 = getNext7Range()

        let filtered: FocusTask[]

        switch (view) {
            case 'today':
                filtered = tasks.value.filter(t => !t.completed && t.dueDate === today)
                break
            case 'tomorrow':
                filtered = tasks.value.filter(t => !t.completed && t.dueDate === tomorrow)
                break
            case 'week':
                filtered = tasks.value.filter(t => !t.completed && t.dueDate && dateInRange(t.dueDate, weekRange.start, weekRange.end))
                break
            case 'next7':
                filtered = tasks.value.filter(t => !t.completed && t.dueDate && dateInRange(t.dueDate, next7.start, next7.end))
                break
            case 'high':
                filtered = tasks.value.filter(t => !t.completed && t.priority === 'high')
                break
            case 'planned':
                filtered = tasks.value.filter(t => !t.completed && t.dueDate)
                break
            case 'completed':
                filtered = tasks.value.filter(t => t.completed)
                break
            case 'all':
                filtered = tasks.value.filter(t => !t.completed)
                break
            default:
                // Custom list
                filtered = tasks.value.filter(t => !t.completed && t.listId === view)
        }

        return filtered.sort((a, b) => a.order - b.order)
    })

    const completedTasks = computed(() => {
        const view = currentView.value
        if (view === 'completed') return []
        if (SMART_VIEWS.some(s => s.key === view)) {
            return tasks.value.filter(t => t.completed).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
        }
        return tasks.value.filter(t => t.completed && t.listId === view).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    })

    // Stats
    const todayRecords = computed(() => {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        return records.value.filter(r => r.startTime >= start.getTime())
    })

    const stats = computed(() => {
        const pending = filteredTasks.value.length
        const completed = completedTasks.value.length
        const estimatedMinutes = filteredTasks.value.reduce((acc, t) => acc + t.pomodoroEstimate * settings.value.pomodoroDuration, 0)
        const focusedSeconds = todayRecords.value.reduce((acc, r) => acc + r.duration, 0)
        return {
            pending,
            completed,
            estimatedMinutes,
            focusedMinutes: Math.floor(focusedSeconds / 60),
        }
    })

    // List counts
    const listTaskCounts = computed(() => {
        const counts: Record<string, number> = {}
        for (const t of tasks.value) {
            if (!t.completed) {
                counts[t.listId] = (counts[t.listId] ?? 0) + 1
            }
        }
        return counts
    })

    const smartViewCounts = computed(() => {
        const today = todayStr()
        const tomorrow = tomorrowStr()
        const weekRange = getWeekRange()
        const next7 = getNext7Range()
        const activeTasks = tasks.value.filter(t => !t.completed)

        return {
            today: activeTasks.filter(t => t.dueDate === today).length,
            tomorrow: activeTasks.filter(t => t.dueDate === tomorrow).length,
            week: activeTasks.filter(t => t.dueDate && dateInRange(t.dueDate, weekRange.start, weekRange.end)).length,
            next7: activeTasks.filter(t => t.dueDate && dateInRange(t.dueDate, next7.start, next7.end)).length,
            high: activeTasks.filter(t => t.priority === 'high').length,
            planned: activeTasks.filter(t => t.dueDate).length,
            completed: tasks.value.filter(t => t.completed).length,
            all: activeTasks.length,
        }
    })

    // --- Actions (local update + async server sync) ---
    function addTask(name: string, listId?: string) {
        const task: FocusTask = {
            id: uid(),
            name,
            completed: false,
            listId: listId ?? (SMART_VIEWS.some(s => s.key === currentView.value) ? 'default' : currentView.value as string),
            pomodoroEstimate: 1,
            pomodoroCompleted: 0,
            priority: 'none',
            dueDate: currentView.value === 'today' ? todayStr() : currentView.value === 'tomorrow' ? tomorrowStr() : undefined,
            notes: '',
            createdAt: Date.now(),
            order: settings.value.addTaskOnTop ? -Date.now() : Date.now(),
        }
        tasks.value.push(task)
        // Sync to server
        api('/api/focus/tasks', { action: 'create', task }).catch(e => console.error('[FocusStore] addTask sync error:', e))
        return task
    }

    function updateTask(id: string, updates: Partial<FocusTask>) {
        const idx = tasks.value.findIndex(t => t.id === id)
        if (idx >= 0) {
            tasks.value[idx] = { ...tasks.value[idx]!, ...updates }
        }
        api('/api/focus/tasks', { action: 'update', id, updates }).catch(e => console.error('[FocusStore] updateTask sync error:', e))
    }

    function toggleTask(id: string) {
        const task = tasks.value.find(t => t.id === id)
        if (task) {
            task.completed = !task.completed
            task.completedAt = task.completed ? Date.now() : undefined
        }
        api('/api/focus/tasks', { action: 'toggle', id }).catch(e => console.error('[FocusStore] toggleTask sync error:', e))
    }

    function deleteTask(id: string) {
        tasks.value = tasks.value.filter(t => t.id !== id)
        if (selectedTaskId.value === id) selectedTaskId.value = null
        api('/api/focus/tasks', { action: 'delete', id }).catch(e => console.error('[FocusStore] deleteTask sync error:', e))
    }

    function reorderTask(draggedId: string, targetId: string) {
        if (draggedId === targetId) return
        // Work on the current filtered (sorted) list
        const sorted = [...filteredTasks.value]
        const fromIdx = sorted.findIndex(t => t.id === draggedId)
        const toIdx = sorted.findIndex(t => t.id === targetId)
        if (fromIdx < 0 || toIdx < 0) return

        // Move item in array
        const [item] = sorted.splice(fromIdx, 1)
        sorted.splice(toIdx, 0, item!)

        // Reassign order values and sync each changed task
        sorted.forEach((t, i) => {
            const newOrder = i
            if (t.order !== newOrder) {
                t.order = newOrder
                // Update in main tasks array
                const mainTask = tasks.value.find(mt => mt.id === t.id)
                if (mainTask) mainTask.order = newOrder
                api('/api/focus/tasks', { action: 'update', id: t.id, updates: { order: newOrder } })
                    .catch(e => console.error('[FocusStore] reorderTask sync error:', e))
            }
        })
    }

    function addList(name: string, color: string) {
        const list: FocusList = {
            id: uid(),
            name,
            color,
            order: Date.now(),
            createdAt: Date.now(),
        }
        lists.value.push(list)
        api('/api/focus/lists', { action: 'create', list }).catch(e => console.error('[FocusStore] addList sync error:', e))
        return list
    }

    function updateList(id: string, updates: Partial<FocusList>) {
        const idx = lists.value.findIndex(l => l.id === id)
        if (idx >= 0) {
            lists.value[idx] = { ...lists.value[idx]!, ...updates }
        }
        api('/api/focus/lists', { action: 'update', id, updates }).catch(e => console.error('[FocusStore] updateList sync error:', e))
    }

    function deleteList(id: string) {
        lists.value = lists.value.filter(l => l.id !== id)
        // Move tasks to default
        tasks.value.forEach(t => { if (t.listId === id) t.listId = 'default' })
        if (currentView.value === id) currentView.value = 'all'
        api('/api/focus/lists', { action: 'delete', id }).catch(e => console.error('[FocusStore] deleteList sync error:', e))
    }

    function addFolder(name: string) {
        const folder: FocusFolder = { id: uid(), name, collapsed: false, order: Date.now() }
        folders.value.push(folder)
        return folder
    }

    function addRecord(record: Omit<PomodoroRecord, 'id'>) {
        const fullRecord = { ...record, id: uid() }
        records.value.push(fullRecord)
        api('/api/focus/records', { record: fullRecord }).catch(e => console.error('[FocusStore] addRecord sync error:', e))
    }

    function updateSettings(updates: Partial<FocusSettings>) {
        settings.value = { ...settings.value, ...updates }
        api('/api/focus/settings', { updates }).catch(e => console.error('[FocusStore] updateSettings sync error:', e))
    }

    // --- Report Data ---
    function getRecordsInRange(startTime: number, endTime: number) {
        return records.value.filter(r => r.startTime >= startTime && r.startTime < endTime)
    }

    const totalFocusMinutes = computed(() =>
        Math.floor(records.value.reduce((acc, r) => acc + r.duration, 0) / 60)
    )

    const weekFocusMinutes = computed(() => {
        const { start, end } = getWeekRange()
        return Math.floor(getRecordsInRange(start.getTime(), end.getTime()).reduce((acc, r) => acc + r.duration, 0) / 60)
    })

    const todayFocusMinutes = computed(() => {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        return Math.floor(getRecordsInRange(start.getTime(), Date.now()).reduce((acc, r) => acc + r.duration, 0) / 60)
    })

    const totalCompletedTasks = computed(() => tasks.value.filter(t => t.completed).length)
    const weekCompletedTasks = computed(() => {
        const { start, end } = getWeekRange()
        return tasks.value.filter(t => t.completed && t.completedAt && t.completedAt >= start.getTime() && t.completedAt <= end.getTime()).length
    })
    const todayCompletedTasks = computed(() => {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        return tasks.value.filter(t => t.completed && t.completedAt && t.completedAt >= start.getTime()).length
    })

    // Heatmap data: returns 24*7 grid with focus minutes
    function getHeatmapData() {
        const data: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
        const { start } = getWeekRange()
        const weekRecords = getRecordsInRange(start.getTime(), start.getTime() + 7 * 24 * 3600000)
        for (const r of weekRecords) {
            const d = new Date(r.startTime)
            const day = (d.getDay() + 6) % 7 // 0=Monday
            const hour = d.getHours()
            data[day]![hour]! += Math.round(r.duration / 60)
        }
        return data
    }

    // Focus ranking by task
    function getFocusRanking(periodStart: number, periodEnd: number) {
        const recs = getRecordsInRange(periodStart, periodEnd)
        const map: Record<string, { name: string; minutes: number }> = {}
        for (const r of recs) {
            if (!map[r.taskId]) map[r.taskId] = { name: r.taskName, minutes: 0 }
            map[r.taskId]!.minutes += Math.round(r.duration / 60)
        }
        return Object.entries(map)
            .map(([id, v]) => ({ taskId: id, ...v }))
            .sort((a, b) => b.minutes - a.minutes)
    }

    // List distribution
    function getListDistribution(periodStart: number, periodEnd: number) {
        const recs = getRecordsInRange(periodStart, periodEnd)
        const map: Record<string, number> = {}
        for (const r of recs) {
            map[r.listId] = (map[r.listId] ?? 0) + Math.round(r.duration / 60)
        }
        return Object.entries(map).map(([listId, minutes]) => {
            const list = lists.value.find(l => l.id === listId)
            return { listId, name: list?.name ?? '已删除', color: list?.color ?? '#757575', minutes }
        }).sort((a, b) => b.minutes - a.minutes)
    }

    return {
        // State
        tasks, lists, folders, records, settings,
        currentView, selectedTaskId, showCompletedTasks,
        // Computed
        selectedTask, currentListName, filteredTasks, completedTasks,
        stats, listTaskCounts, smartViewCounts,
        totalFocusMinutes, weekFocusMinutes, todayFocusMinutes,
        totalCompletedTasks, weekCompletedTasks, todayCompletedTasks,
        todayRecords,
        // Constants
        SMART_VIEWS, LIST_COLORS,
        // Actions
        addTask, updateTask, toggleTask, deleteTask, reorderTask,
        addList, updateList, deleteList,
        addFolder, addRecord, updateSettings,
        loadFromServer,
        // Report helpers
        getHeatmapData, getFocusRanking, getListDistribution, getRecordsInRange,
    }
}

export function useFocusStore() {
    if (!_store) {
        _store = createFocusStore()
    }
    return _store
}
