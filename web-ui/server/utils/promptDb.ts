import Database from 'better-sqlite3'
import { resolve } from 'path'
import { mkdirSync } from 'fs'
import { randomUUID } from 'crypto'

const DB_DIR = resolve(process.cwd(), 'server/db')
const DB_PATH = resolve(DB_DIR, 'prompts.db')

let _db: Database.Database | null = null

export function getPromptDb(): Database.Database {
    if (_db) return _db

    // 确保数据库目录存在
    mkdirSync(DB_DIR, { recursive: true })

    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')

    try {
        // 我们先做表升级：检测旧版 prompts 表中是否存在 favorite 字段。如果不存在，说明需要重建
        const tableInfo = _db.prepare("PRAGMA table_info(prompts)").all() as any[]
        const hasFavorite = tableInfo.some(col => col.name === 'favorite')
        if (tableInfo.length > 0 && !hasFavorite) {
            // 删除旧表，确保平滑重构
            _db.exec(`
                DROP TABLE IF EXISTS prompts;
                DROP TABLE IF EXISTS folders;
            `)
        }
    } catch (e) {
        // 如果表不存在，会抛错，直接忽略即可
    }

    // 创建 folders 表
    _db.exec(`
        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            createdAt INTEGER NOT NULL
        );
    `)

    // 创建 prompts 表
    _db.exec(`
        CREATE TABLE IF NOT EXISTS prompts (
            id TEXT PRIMARY KEY,
            folderId TEXT,
            name TEXT NOT NULL,
            prompt TEXT NOT NULL,
            negativePrompt TEXT,
            notes TEXT,
            favorite INTEGER DEFAULT 0,
            locked INTEGER DEFAULT 0,
            tags TEXT,
            createdAt INTEGER NOT NULL,
            "order" INTEGER DEFAULT 0
        );
    `)

    // 初始化默认数据
    const folderCount = _db.prepare('SELECT COUNT(*) as count FROM folders').get() as any
    if (folderCount.count === 0) {
        // 创建默认文件夹
        const folderStmt = _db.prepare('INSERT INTO folders (id, name, createdAt) VALUES (?, ?, ?)')
        const now = Date.now()
        
        folderStmt.run('2d', '2d', now)
        folderStmt.run('char', '角色模板', now)
        folderStmt.run('scene', '场景模板', now)
        folderStmt.run('effect', '特效模板', now)

        // 灌入初始提示词
        const promptStmt = _db.prepare(`
            INSERT INTO prompts (id, folderId, name, prompt, negativePrompt, notes, favorite, locked, tags, createdAt, "order")
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        // 1. 2D 角色动画帧
        promptStmt.run(
            randomUUID(),
            '2d',
            '2d角色动画帧',
            `制作一个绿幕背景的Q版史莱姆怪物:
1.禁止出现任何文字。
2.角色不要贴边，不要重叠，不要被裁切，高清游戏美术设定图，干净轮廓，方便抠图。
3.横向和纵向应至少为角色宽度的80%，每一帧动作编排明显，适合做2D游戏动作动画。

最终需要生成:
第一张图生成 角色三视图设定图
第二张图生成 待机动作8帧图、跑步动作8帧图、攻击动作8帧图、被印魔法动作8帧图
第三张图生成 释放大招动作8帧图、被击中动作8帧图、恢复动作8帧图、死亡腐化动作8帧图[灵机一动]`,
            null,
            '用于制作2D横版游戏怪物动作帧的常用Stable Diffusion提示词。',
            0,
            0,
            '2d,动画,帧',
            now,
            1
        )

        // 2. 赛博朋克女武神
        promptStmt.run(
            randomUUID(),
            'char',
            '赛博朋克女武神',
            'A breathtaking cyberpunk valkyrie, standing on a neon-lit skyscraper, holographic wings glowing, futuristic chrome armor, reflections of rain on streetlights below, masterpiece, 8k, Unreal Engine 5, ray tracing, highly detailed.',
            'blurry, low quality, bad anatomy, deformed, sketch, low resolution',
            '手持极光之枪的未来赛博朋克女武神，站立在雨后高楼边缘，全息翅膀与霓虹灯光交相辉映。',
            1, // 默认收藏
            0,
            'cyberpunk,valkyrie,char',
            now,
            2
        )

        // 3. 水下沉没神殿遗迹
        promptStmt.run(
            randomUUID(),
            'scene',
            '水下沉没神殿遗迹',
            'Ancient ruins of a colossal Greek temple submerged in deep bioluminescent ocean, glowing jellyfish floating around columns, sunbeams filtering through water surface, schools of colorful tropical fish, cinematic lighting, mystical atmosphere.',
            'dry land, modern buildings, boats, humans, low resolution, text, signature',
            '沉没在深海中的古希腊神殿遗迹，周围飘浮着发光的生物荧光水母，阳光从水面透射而下。',
            0,
            0,
            'underwater,scifi,landscape',
            now,
            3
        )

        // 4. 等离子六角盾
        promptStmt.run(
            randomUUID(),
            'effect',
            '等离子六角盾',
            'A glowing hexagonal honeycomb energy shield absorbing bullet impacts, bright blue sparks flying, electric ripples spreading across the surface, futuristic defense grid, sci-fi military technology, high speed photography style.',
            'medieval, fantasy, wood, simple, cartoon, hand drawn, paper texture',
            '由六角蜂窝状发光能量构成的科幻护盾，正在吸收子弹冲击，激起蓝色电火花和波纹。',
            0,
            1, // 默认锁定
            'shield,effect,plasma',
            now,
            4
        )
    }

    return _db
}
