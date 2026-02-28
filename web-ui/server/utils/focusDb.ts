// 专注清单 - SQLite 数据库初始化和工具函数
import Database from 'better-sqlite3'
import { resolve } from 'path'
import { mkdirSync } from 'fs'

// Database file location
const DB_DIR = resolve(process.cwd(), 'server/db')
const DB_PATH = resolve(DB_DIR, 'focus.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
    if (_db) return _db

    // Ensure directory exists
    mkdirSync(DB_DIR, { recursive: true })

    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')

    // Create tables
    _db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            completedAt INTEGER,
            listId TEXT NOT NULL DEFAULT 'default',
            pomodoroEstimate INTEGER NOT NULL DEFAULT 1,
            pomodoroCompleted INTEGER NOT NULL DEFAULT 0,
            priority TEXT NOT NULL DEFAULT 'none',
            dueDate TEXT,
            notes TEXT NOT NULL DEFAULT '',
            createdAt INTEGER NOT NULL,
            "order" INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS lists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#1E88E5',
            folderId TEXT,
            "order" INTEGER NOT NULL DEFAULT 0,
            createdAt INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS records (
            id TEXT PRIMARY KEY,
            taskId TEXT NOT NULL,
            taskName TEXT NOT NULL,
            listId TEXT NOT NULL,
            startTime INTEGER NOT NULL,
            endTime INTEGER NOT NULL,
            duration INTEGER NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            collapsed INTEGER NOT NULL DEFAULT 0,
            "order" INTEGER NOT NULL DEFAULT 0
        );
    `)

    // Insert default list if none exists
    const listCount = _db.prepare('SELECT COUNT(*) as count FROM lists').get() as any
    if (listCount.count === 0) {
        _db.prepare('INSERT INTO lists (id, name, color, "order", createdAt) VALUES (?, ?, ?, ?, ?)')
            .run('default', '默认清单', '#1E88E5', 0, Date.now())
    }

    // Insert default settings if none exists
    const settingsCount = _db.prepare('SELECT COUNT(*) as count FROM settings').get() as any
    if (settingsCount.count === 0) {
        const defaults: Record<string, any> = {
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
        const stmt = _db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
        for (const [key, value] of Object.entries(defaults)) {
            stmt.run(key, JSON.stringify(value))
        }
    }

    return _db
}

// Helper: convert SQLite row (with integer booleans) to JS object
export function rowToTask(row: any) {
    return {
        ...row,
        completed: !!row.completed,
    }
}

export function rowToRecord(row: any) {
    return {
        ...row,
        completed: !!row.completed,
    }
}

export function rowToFolder(row: any) {
    return {
        ...row,
        collapsed: !!row.collapsed,
    }
}
