// POST /api/knowledge/import-files - 从浏览器上传的一批 Markdown 文件内容导入卡片（支持 AI 智能增量吸纳、双向织网与改写）
import { basename, join, resolve } from 'path'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { 
  CARD_ID_PATTERN, 
  parseFrontmatter, 
  scanKnowledgeNodes, 
  buildKnowledgeIndex, 
  KNOWLEDGE_CARDS_DIR, 
  filePathForId, 
  resolveExistingFilePath 
} from '../../utils/knowledgeCards'

interface ImportFileItem {
    filename: string
    content: string
}

interface ImportFilesBody {
    files?: ImportFileItem[]
    overwrite?: boolean
}

// 子分类打分参考配置
const INGEST_SUBCATEGORIES = [
  { id: 'gameplay_framework', archTag: 'arch/gameplay_framework', domain: 'UE4', techTags: ['GameplayFramework', 'GameInstance', 'GameMode', 'GameState', 'Subsystem', 'Lifecycle'] },
  { id: 'actor_component', archTag: 'arch/actor_component', domain: 'UE4', techTags: ['Actor', 'Component', 'ActorComponent', 'SceneComponent', 'Blueprint', '组件化'] },
  { id: 'gamemode_pawn_controller', archTag: 'arch/gamemode_pawn_controller', domain: 'UE4', techTags: ['GameMode', 'Pawn', 'PlayerController', 'AIController', 'HUD', 'PlayerState'] },
  { id: 'gameplay_systems', archTag: 'arch/gameplay_systems', domain: 'UE4', techTags: ['GameplayLogic', 'QuestSystem', '战斗系统', '角色系统', '任务系统', '数值配置', 'DataTable'] },
  { id: 'rendering_pipeline', archTag: 'arch/rendering', domain: '引擎', techTags: ['Rendering', 'Renderer', '渲染管线', 'RHI', 'ViewFamily', 'BasePass', 'RenderThread', '移动端渲染'] },
  { id: 'render_debug_profile', archTag: 'arch/render_debug_profile', domain: '工具链', techTags: ['FrameAnalysis', 'RenderDoc', 'ScenePerfMonitor', 'Heatmap', '性能分析', 'MemReport', 'SimpleCsvProfiler'] },
  { id: 'material_shader_postprocess', archTag: 'arch/material_light_postprocess', domain: '引擎', techTags: ['Material', 'Shader', 'Lighting', 'PostProcess', 'DebugView', '材质球', '后处理'] },
  { id: 'visibility_culling', archTag: 'arch/visibility_culling', domain: '引擎', techTags: ['Visibility', 'Culling', 'CullDistanceVolume', 'Bounds', 'Occlusion', '剔除', 'MaxDrawDistance', '消隐'] },
  { id: 'mesh_lod_hism', archTag: 'arch/mesh_lod_hism', domain: '引擎', techTags: ['StaticMesh', 'LOD', 'HLOD', 'HISM', 'ISM', 'InstancedStaticMesh', 'Section', 'Material Slot'] },
  { id: 'terrain_foliage', archTag: 'arch/terrain_foliage', domain: '引擎', techTags: ['Landscape', 'Foliage', 'Terrain', 'RVT', 'VirtualTexture', '地形草', 'InstancedFoliageActor'] },
  { id: 'particles_vfx', archTag: 'arch/particles_vfx', domain: '引擎', techTags: ['Cascade', 'Niagara', 'VFXProfiler', '粒子系统', 'ParticleSystem', 'Overdraw', '特效编辑器'] },
  { id: 'sequencer_cinematic', archTag: 'arch/sequencer_cinematic', domain: '引擎', techTags: ['Sequencer', 'LevelSequence', 'MovieScene', 'Spawnable', 'CineCamera', 'VFXProfiler'] },
  { id: 'audio_mix_event', archTag: 'arch/audio', domain: '引擎', techTags: ['SoundMix', 'SoundCue', 'AudioEvent', 'Wwise', 'FMOD', '音频混音', 'Metasound'] },
  { id: 'umg_slate_ui', archTag: 'arch/ui', domain: '编辑器', techTags: ['UMG', 'Slate', 'Widget', 'UI界面', 'MVVM'] },
  { id: 'replication_rpc_session', archTag: 'arch/networking', domain: 'UE4', techTags: ['Replication', 'RPC', 'Session', '网络复制', 'ReliableRPC', '多人同步'] },
  { id: 'behaviortree_navmesh', archTag: 'arch/ai', domain: 'UE4', techTags: ['BehaviorTree', 'Navigation', 'NavMesh', '寻路导航', '行为树', 'Blackboard'] },
  { id: 'agent_llm_architecture', archTag: 'arch/agent_llm_architecture', domain: 'Python', techTags: ['Agent', 'LLM', 'Kimi CLI', 'kimi-cli', 'MCP', 'Tool Loop', 'OpenAI', 'DeepSeek'] },
  { id: 'cpu_multithread', archTag: 'arch/cpu_multithread', domain: 'C++', techTags: ['CPU', '多线程', 'Thread', 'TaskGraph', 'Async', '性能分析', 'FRunnable'] },
  { id: 'memory_storage', archTag: 'arch/memory_storage', domain: 'C++', techTags: ['Memory', 'GC', '垃圾回收', 'Serialization', 'AssetRegistry', 'BuildData', 'DataManager', 'PakFile'] },
  { id: 'android_platform', archTag: 'arch/android_platform', domain: '工具链', techTags: ['Android', 'adb', 'OpenGL', 'ES31', 'Mobile', 'AndroidPlatform', 'RenderDoc'] },
  { id: 'networking_online', archTag: 'arch/network_server', domain: '工具链', techTags: ['Socket', 'TCPIP', 'UDP', 'COS', 'PacketWatermark', 'ServerCloud', '服务器运维'] },
  { id: 'web_frontend_product', archTag: 'arch/web_frontend_product', domain: 'Web', techTags: ['Nuxt', 'Vue', 'Frontend', '前端工程', 'TypeScript', 'Element Plus', 'Node.js', 'Nitro'] },
  { id: 'knowledge_management', archTag: 'arch/knowledge_management', domain: '工具链', techTags: ['知识管理', 'Knowledge Cards', 'knowledge-cards', 'Mermaid', 'NotebookLM', 'Obsidian'] },
]

export default defineEventHandler(async (event) => {
    const body = await readBody<ImportFilesBody>(event)
    const files = Array.isArray(body?.files) ? body.files : []
    const overwrite = Boolean(body?.overwrite)

    if (files.length === 0) {
        return {
            ok: true,
            imported: 0,
            skipped: 0,
            errors: 0,
            totalFiles: 0,
            cardsCount: buildKnowledgeIndex().cards.length,
            results: [],
            message: '没有收到任何文件',
        }
    }

    try {
        const todayStr = new Date().toISOString().slice(0, 10)
        const dateParts = todayStr.split('-')
        const prefix = `KC-${dateParts[0]}-${dateParts[1]}-${dateParts[2]}-`

        const allNodes = scanKnowledgeNodes()
        const cards = allNodes.filter(n => n.type === 'card')
        const existingIds = new Set(cards.map(c => c.id))

        // 计算今天最新的序列号
        let maxSeq = 0
        for (const id of existingIds) {
          if (id.startsWith(prefix)) {
            const seq = parseInt(id.slice(prefix.length), 10)
            if (!isNaN(seq) && seq > maxSeq) {
              maxSeq = seq
            }
          }
        }

        const results: { id: string; status: string; filename: string; message: string }[] = []
        let imported = 0
        let skipped = 0
        let errors = 0

        const newlyWrittenCards: { id: string; title: string }[] = []

        for (const file of files) {
            const filename = file.filename
            const content = file.content

            if (!filename.toLowerCase().endsWith('.md')) {
                results.push({ id: '', status: 'skipped', filename, message: '不是 .md 文件' })
                skipped++
                continue
            }

            try {
                const { meta, body: rawBody } = parseFrontmatter(content)
                const idFromMeta = typeof meta.id === 'string' ? meta.id.trim() : ''
                const fileBaseName = basename(filename, '.md')

                // 1. 判断是否是完美的格式化卡片
                const isFormatted = idFromMeta && CARD_ID_PATTERN.test(idFromMeta) || CARD_ID_PATTERN.test(fileBaseName)
                const effectiveId = idFromMeta && CARD_ID_PATTERN.test(idFromMeta)
                    ? idFromMeta
                    : CARD_ID_PATTERN.test(fileBaseName) ? fileBaseName : ''

                if (isFormatted && effectiveId) {
                    // 格式化卡片，走直接覆盖或新建逻辑
                    const existingPath = resolveExistingFilePath(effectiveId)
                    if (existingPath && !overwrite) {
                        results.push({ id: effectiveId, status: 'skipped', filename, message: `已存在同名格式化卡片 [[${effectiveId}]]，跳过覆盖` })
                        skipped++
                        continue
                    }

                    // 构建 frontmatter 写入
                    const summary = typeof meta.summary === 'string' && meta.summary.trim() ? meta.summary.trim() : ''
                    const finalFm: Record<string, any> = {
                      id: effectiveId,
                      title: typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : fileBaseName,
                      domain: typeof meta.domain === 'string' && meta.domain.trim() ? meta.domain.trim() : '未分类',
                      difficulty: typeof meta.difficulty === 'number' ? meta.difficulty : 1,
                      date: typeof meta.date === 'string' && meta.date.trim() ? meta.date.trim() : todayStr,
                      tags: Array.isArray(meta.tags) ? meta.tags : [],
                      summary: summary || rawBody.split('\n')[0]?.trim() || '',
                    }
                    if (meta.source) finalFm.source = meta.source

                    const lines = Object.entries(finalFm).map(([k, v]) => {
                      if (Array.isArray(v)) {
                        return `${k}: [${v.map(i => `'${String(i).replace(/'/g, "\\'")}'`).join(', ')}]`
                      }
                      return `${k}: ${v}`
                    })
                    const finalContent = `---\n${lines.join('\n')}\n---\n\n${rawBody.trim()}\n`
                    
                    writeFileSync(existingPath || filePathForId(effectiveId), finalContent, 'utf8')
                    results.push({ 
                      id: effectiveId, 
                      status: existingPath ? 'overwritten' : 'imported', 
                      filename, 
                      message: existingPath ? `覆盖同名卡片 [[${effectiveId}]]` : `直接导入格式化卡片 [[${effectiveId}]]` 
                    })
                    imported++
                    newlyWrittenCards.push({ id: effectiveId, title: String(finalFm.title) })
                    continue
                }

                // 2. 如果是 raw 研发文档，开启“智能增量吸纳织网引擎”
                const rawTitle = (typeof meta.title === 'string' && meta.title.trim()) || fileBaseName
                const rawContent = rawBody.trim()

                // 计算关联性得分
                let bestCard: any = null
                let maxScore = -1

                for (const card of cards) {
                    let score = 0
                    const cardTitleLower = card.title.toLowerCase()
                    const rawTitleLower = rawTitle.toLowerCase()

                    // A. 标题重合度
                    if (cardTitleLower.includes(rawTitleLower) || rawTitleLower.includes(cardTitleLower)) {
                        score += 30
                    }
                    if (cardTitleLower === rawTitleLower) {
                        score += 30 // 完全相等加更多
                    }

                    // B. techTags 精确重合
                    const matchTags = card.tags.filter(t => rawContent.toLowerCase().includes(t.toLowerCase()))
                    score += matchTags.length * 8

                    // C. 查找子分类中与卡片相近的 techTags 并在物料中计算词频
                    for (const sub of INGEST_SUBCATEGORIES) {
                      if (card.tags.includes(sub.archTag)) {
                        for (const tag of sub.techTags) {
                          const regex = new RegExp(tag.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'gi')
                          const matches = rawContent.match(regex)
                          if (matches) {
                            score += Math.min(matches.length * 4, 20) // 封顶 20 分
                          }
                        }
                      }
                    }

                    if (score > maxScore) {
                        maxScore = score
                        bestCard = card
                    }
                }

                // A. 增量改写 (得分较高，判定为已有概念的补充信息)
                if (bestCard && maxScore >= 20) {
                    const cardPath = bestCard.path
                    if (cardPath && existsSync(cardPath)) {
                        const originalContent = readFileSync(cardPath, 'utf8')
                        // 在正文底部以 Markdown 优表格式追加
                        const appendBlock = `\n\n> [!NOTE] 智能增量吸纳 (${todayStr})\n> **来源物料**: ${rawTitle}\n> ${rawContent.replace(/\n/g, '\n> ')}`
                        
                        writeFileSync(cardPath, originalContent.trim() + appendBlock + '\n', 'utf8')
                        
                        results.push({
                            id: bestCard.id,
                            status: 'overwritten',
                            filename,
                            message: `💡 智能追加至已有卡片 [[${bestCard.id}|${bestCard.title}]] (关联得分: ${maxScore})`
                        })
                        imported++
                        newlyWrittenCards.push({ id: bestCard.id, title: bestCard.title })
                    } else {
                        throw new Error(`无法找到匹配卡片的源文件路径`)
                    }
                } 
                // B. 空白漏失概念 (新建卡片)
                else {
                    maxSeq++
                    const newId = `${prefix}${String(maxSeq).padStart(3, '0')}`

                    // 智能分配标签、#arch 标签与 domain
                    let bestSub = INGEST_SUBCATEGORIES[0]!
                    let maxSubHits = -1

                    for (const sub of INGEST_SUBCATEGORIES) {
                        let hits = 0
                        for (const tag of sub.techTags) {
                            const regex = new RegExp(tag.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'gi')
                            const count = (rawContent.match(regex) || []).length
                            hits += count
                        }
                        if (hits > maxSubHits) {
                            maxSubHits = hits
                            bestSub = sub
                        }
                    }

                    const subDomain = bestSub.domain
                    const subArchTag = bestSub.archTag
                    
                    // 收集匹配的高频标签
                    const assignedTags = new Set<string>()
                    assignedTags.add(subArchTag)
                    for (const tag of bestSub.techTags) {
                        if (rawContent.toLowerCase().includes(tag.toLowerCase())) {
                            assignedTags.add(tag)
                        }
                    }

                    const summaryText = rawContent.split('\n').find(l => l.trim() && !l.startsWith('#'))?.trim().slice(0, 120) || 'AI 智能吸纳的新建技术卡片。'

                    const finalFm: Record<string, any> = {
                      id: newId,
                      title: rawTitle,
                      domain: subDomain,
                      difficulty: 1,
                      date: todayStr,
                      tags: Array.from(assignedTags),
                      summary: summaryText,
                    }

                    const lines = Object.entries(finalFm).map(([k, v]) => {
                      if (Array.isArray(v)) {
                        return `${k}: [${v.map(item => `'${String(item).replace(/'/g, "\\'")}'`).join(', ')}]`
                      }
                      return `${k}: ${v}`
                    })
                    const newCardContent = `---\n${lines.join('\n')}\n---\n\n${rawContent}\n`

                    writeFileSync(filePathForId(newId), newCardContent, 'utf8')
                    
                    results.push({
                        id: newId,
                        status: 'imported',
                        filename,
                        message: `✨ 空白概念，智能建档为 [[${newId}|${rawTitle}]] 并自动编网 (分配: ${subDomain} / ${subArchTag})`
                    })
                    imported++
                    newlyWrittenCards.push({ id: newId, title: rawTitle })
                }

            } catch (e: any) {
                results.push({ id: '', status: 'error', filename, message: `吸纳失败: ${e.message}` })
                errors++
            }
        }

        // 3. 内链自动双向编织织网 (Double-Way Weaving)
        // 这一步在 newlyWrittenCards 写入后进行全库扫描，自动编织引用。
        if (newlyWrittenCards.length > 0) {
            const freshNodes = scanKnowledgeNodes()
            const freshCards = freshNodes.filter(n => n.type === 'card')

            for (const written of newlyWrittenCards) {
                const targetId = written.id
                const targetTitle = written.title
                if (!targetTitle || targetTitle.length < 2) continue

                // A. 逆向织网：扫描其他卡片，如果在其正文出现该新卡片的 Title，且该卡片未引用本卡片，则自动替换为 [[targetId|targetTitle]]
                for (const card of freshCards) {
                    if (card.id === targetId) continue
                    const cardPath = card.path
                    if (!cardPath || !existsSync(cardPath)) continue

                    const rawText = readFileSync(cardPath, 'utf8')
                    const { meta, body: cardBody } = parseFrontmatter(rawText)

                    // 如果正文包含了新卡片的 Title（精确词），且不是在链接内
                    // 构造安全的正则匹配：匹配 targetTitle，但前后不能是 [[, ]], |, 字符
                    const escapedTitle = targetTitle.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
                    const wordRegex = new RegExp(`(?<!\\[\\[|\\|)([^a-zA-Z0-9_\u4e00-\u9fa5]|^)(${escapedTitle})([^a-zA-Z0-9_\u4e00-\u9fa5]|$)(?!\\]\\]|\\|)`, 'g')
                    
                    if (wordRegex.test(cardBody)) {
                        // 执行替换，并保存
                        const updatedBody = cardBody.replace(wordRegex, `$1[[${targetId}|${targetTitle}]]$3`)
                        const contentToSave = buildMarkdownWithFrontmatter(meta, updatedBody)
                        writeFileSync(cardPath, contentToSave, 'utf8')
                    }
                }

                // B. 顺向织网：扫描这篇新卡片自己，如果在其正文中提到了其他已有的任何卡片 Title，自动替换为 [[otherId|otherTitle]]
                const writtenPath = resolveExistingFilePath(targetId)
                if (writtenPath && existsSync(writtenPath)) {
                    const rawText = readFileSync(writtenPath, 'utf8')
                    const { meta, body: writtenBody } = parseFrontmatter(rawText)
                    let updatedBody = writtenBody

                    for (const otherCard of freshCards) {
                        if (otherCard.id === targetId) continue
                        const otherTitle = otherCard.title
                        if (!otherTitle || otherTitle.length < 2) continue

                        const escapedOtherTitle = otherTitle.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
                        const otherWordRegex = new RegExp(`(?<!\\[\\[|\\|)([^a-zA-Z0-9_\u4e00-\u9fa5]|^)(${escapedOtherTitle})([^a-zA-Z0-9_\u4e00-\u9fa5]|$)(?!\\]\\]|\\|)`, 'g')

                        if (otherWordRegex.test(updatedBody)) {
                            updatedBody = updatedBody.replace(otherWordRegex, `$1[[${otherCard.id}|${otherTitle}]]$3`)
                        }
                    }

                    if (updatedBody !== writtenBody) {
                        const contentToSave = buildMarkdownWithFrontmatter(meta, updatedBody)
                        writeFileSync(writtenPath, contentToSave, 'utf8')
                    }
                }
            }
        }

        // 重新构建索引与自愈盘 index.md & log.md
        const index = buildKnowledgeIndex()

        return {
            ok: true,
            imported,
            skipped,
            errors,
            totalFiles: files.length,
            cardsCount: index.cards.length,
            results,
        }
    } catch (e: any) {
        throw createError({
            statusCode: 500,
            statusMessage: `智能吸纳失败: ${e.message}`,
        })
    }
})

// 简单工具，用于拼装 Markdown frontmatter
function buildMarkdownWithFrontmatter(meta: Record<string, any>, body: string) {
  const lines = Object.entries(meta)
    .filter(([key]) => Boolean(key))
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: [${value.map(item => `'${String(item).replace(/'/g, "\\'")}'`).join(', ')}]`
      }
      return `${key}: ${value}`
    })
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`
}
