// 知识卡片 - 直接以 Obsidian knowledge-cards 目录作为唯一数据源
import { basename, extname, join, normalize, resolve } from 'path'
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs'

export const KNOWLEDGE_CARDS_DIR =
  process.env.KNOWLEDGE_CARDS_DIR ||
  'C:\\Users\\jesephjiang\\Documents\\Obsidian Vault\\TechDebriefs\\knowledge-cards'

export const KNOWLEDGE_MAP_ENTRY_ID = '00-知识体系总图'
export const CARD_ID_PATTERN = /^KC-\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{3}$/

export type KnowledgeNodeType = 'map' | 'moc' | 'hub' | 'card' | 'note' | 'missing'
type FrontmatterValue = string | number | string[]

export interface KnowledgeCardRecord {
  id: string
  title: string
  domain: string
  difficulty: number
  date: string
  tags: string[]
  summary: string
  content: string
  source?: string
  path?: string
}

export interface KnowledgeNodeRecord extends Omit<KnowledgeCardRecord, 'difficulty'> {
  type: KnowledgeNodeType
  difficulty?: number
}

export interface KnowledgeGraphEdge {
  source: string
  target: string
  label?: string
  missing?: boolean
}

export interface KnowledgeIndex {
  version: number
  updated_at: string
  vaultPath: string
  stats: {
    total: number
    cards: number
    mocs: number
    hubs: number
    maps: number
  }
  cards: KnowledgeCardRecord[]
}

const pad2 = (value: number) => String(value).padStart(2, '0')

const formatTimestamp = (date: Date) => {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

export const createKnowledgeError = (statusCode: number, message: string) => {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode
  return error
}

export const parseFrontmatter = (content: string) => {
  const normalized = content.replace(/^\ufeff/, '')
  const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/)
  if (!match?.[1]) {
    return { meta: {} as Record<string, FrontmatterValue>, body: normalized }
  }

  const meta: Record<string, FrontmatterValue> = {}
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf(':')
    if (separatorIndex < 0) continue

    const key = line.slice(0, separatorIndex).trim()
    const rawValue = line.slice(separatorIndex + 1).trim()
    if (!key) continue

    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      meta[key] = rawValue
        .slice(1, -1)
        .split(',')
        .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
      continue
    }

    if (/^\d+$/.test(rawValue)) {
      meta[key] = Number(rawValue)
      continue
    }

    meta[key] = rawValue.replace(/^['"]|['"]$/g, '')
  }

  return { meta, body: match[2] ?? '' }
}

const extractSummary = (body: string) => {
  const sectionMatch = body.match(/##\s*一句话总结\s*\r?\n+([\s\S]*?)(?:\r?\n\r?\n|\r?\n##|\Z)/)
  if (sectionMatch?.[1]) {
    return sectionMatch[1].trim()
  }

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    return line
  }

  return ''
}

const extractTitleFromBody = (body: string, fallback: string) => {
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading || fallback
}

const normalizeCardId = (id: string) => id.trim().replace(/_/g, '-')

function ensureVaultDir() {
  if (!existsSync(KNOWLEDGE_CARDS_DIR)) {
    mkdirSync(KNOWLEDGE_CARDS_DIR, { recursive: true })
  }
}

function markdownFiles() {
  ensureVaultDir()
  return readdirSync(KNOWLEDGE_CARDS_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === '.md')
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

function getNodeType(id: string, metaType?: string): KnowledgeNodeType {
  const normalizedMetaType = String(metaType || '').toLowerCase()
  if (id === KNOWLEDGE_MAP_ENTRY_ID || normalizedMetaType === 'knowledge-map') return 'map'
  if (id.startsWith('MOC-') || normalizedMetaType === 'moc') return 'moc'
  if (id.startsWith('HUB-') || normalizedMetaType === 'hub') return 'hub'
  if (CARD_ID_PATTERN.test(id)) return 'card'
  return 'note'
}

export function filePathForId(id: string) {
  return join(KNOWLEDGE_CARDS_DIR, `${id}.md`)
}

export function resolveExistingFilePath(id: string) {
  const normalizedId = normalizeCardId(id)
  const direct = filePathForId(normalizedId)
  if (existsSync(direct)) return direct

  // 旧卡片可能使用下划线日期分隔，读取时兼容定位，但写入统一回到短横线 ID。
  const underscoreId = normalizedId.replace(/^KC-(\d{4})-(\d{2})-(\d{2})-(\d{3})$/, 'KC-$1_$2_$3_$4')
  const underscorePath = filePathForId(underscoreId)
  if (existsSync(underscorePath)) return underscorePath

  return null
}

function readNodeFromFile(filename: string): KnowledgeNodeRecord {
  const filePath = join(KNOWLEDGE_CARDS_DIR, filename)
  const raw = readFileSync(filePath, 'utf8')
  const idFromFile = basename(filename, '.md')
  const { meta, body } = parseFrontmatter(raw)
  const idFromMeta = typeof meta.id === 'string' && CARD_ID_PATTERN.test(meta.id.trim()) ? normalizeCardId(meta.id) : ''
  const id = idFromMeta || idFromFile
  const type = getNodeType(id, typeof meta.type === 'string' ? meta.type : '')
  const title = typeof meta.title === 'string' && meta.title.trim()
    ? meta.title.trim()
    : extractTitleFromBody(body, id)
  const tags = Array.isArray(meta.tags) ? meta.tags.map(tag => String(tag)) : []
  const domain = typeof meta.domain === 'string' && meta.domain.trim()
    ? meta.domain.trim()
    : type === 'card' ? '未分类' : type.toUpperCase()
  const difficulty = typeof meta.difficulty === 'number' ? meta.difficulty : type === 'card' ? 1 : undefined

  return {
    id,
    title,
    type,
    domain,
    difficulty,
    date: typeof meta.date === 'string' ? meta.date : '',
    tags,
    summary: typeof meta.summary === 'string' && meta.summary.trim() ? meta.summary.trim() : extractSummary(body),
    content: raw,
    source: typeof meta.source === 'string' ? meta.source : '',
    path: filePath,
  }
}

export function scanKnowledgeNodes() {
  const nodes = markdownFiles().map(readNodeFromFile)
  
  // 额外扫描 Obsidian Vault 根目录下的骨干索引文件 (01-知识体系索引.md 与 log.md)
  // 让它们参与脑网络图谱分析，精准消除因 MOC/Index 引用导致的孤立误判状态！
  try {
    const vaultRoot = resolve(KNOWLEDGE_CARDS_DIR, '..')
    const boneFiles = ['01-知识体系索引.md', 'log.md']
    for (const bf of boneFiles) {
      const filePath = join(vaultRoot, bf)
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf8')
        const id = basename(bf, '.md')
        const { meta, body } = parseFrontmatter(raw)
        
        nodes.push({
          id,
          title: typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : id,
          type: id === 'log' ? 'moc' : 'map',
          domain: 'INDEX',
          difficulty: undefined,
          date: typeof meta.date === 'string' ? meta.date : '',
          tags: Array.isArray(meta.tags) ? meta.tags.map(t => String(t)) : [],
          summary: typeof meta.summary === 'string' ? meta.summary : '',
          content: raw,
          source: '',
          path: filePath
        })
      }
    }
  } catch (err) {
    console.error('Failed to scan root index files:', err)
  }

  return nodes
}

function toCardRecord(node: KnowledgeNodeRecord): KnowledgeCardRecord {
  return {
    id: node.id,
    title: node.title,
    domain: node.domain,
    difficulty: Number(node.difficulty) || 1,
    date: node.date,
    tags: node.tags,
    summary: node.summary,
    content: node.content,
    source: node.source,
    path: node.path,
  }
}

function statsForNodes(nodes: KnowledgeNodeRecord[]) {
  return {
    total: nodes.length,
    cards: nodes.filter(node => node.type === 'card').length,
    mocs: nodes.filter(node => node.type === 'moc').length,
    hubs: nodes.filter(node => node.type === 'hub').length,
    maps: nodes.filter(node => node.type === 'map').length,
  }
}

function stringifyFrontmatterValue(value: FrontmatterValue) {
  if (Array.isArray(value)) {
    const escaped = value.map(item => `'${String(item).replace(/'/g, "\\'")}'`).join(', ')
    return `[${escaped}]`
  }
  return String(value)
}

function buildMarkdownWithFrontmatter(meta: Record<string, FrontmatterValue>, body: string) {
  const lines = Object.entries(meta)
    .filter(([key]) => Boolean(key))
    .map(([key, value]) => `${key}: ${stringifyFrontmatterValue(value)}`)
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`
}

function upsertFrontmatter(content: string, patch: Record<string, FrontmatterValue>, fallbackBody?: string) {
  const { meta, body } = parseFrontmatter(content)
  const merged = { ...meta, ...patch }
  return buildMarkdownWithFrontmatter(merged, fallbackBody ?? body)
}

function nextCardIdForDate(date: Date) {
  const prefix = `KC-${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-`
  let maxSeq = 0
  for (const node of scanKnowledgeNodes()) {
    if (!node.id.startsWith(prefix)) continue
    const seq = Number(node.id.slice(prefix.length))
    if (Number.isInteger(seq) && seq > maxSeq) maxSeq = seq
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`
}

function normalizeCreatedMarkdown(markdown: string, id: string) {
  const normalized = markdown.replace(/^\ufeff/, '').trim()
  const { meta, body } = parseFrontmatter(normalized)
  const today = new Date()
  const summary = typeof meta.summary === 'string' && meta.summary.trim() ? meta.summary : extractSummary(body)
  const title = typeof meta.title === 'string' && meta.title.trim()
    ? meta.title
    : extractTitleFromBody(body, id)

  // 新建卡片时补齐 Obsidian 目录需要的关键 frontmatter，保证 Web 与 Obsidian 看到同一份结构化数据。
  return buildMarkdownWithFrontmatter({
    id,
    title,
    domain: typeof meta.domain === 'string' && meta.domain.trim() ? meta.domain : '未分类',
    difficulty: typeof meta.difficulty === 'number' ? meta.difficulty : 1,
    date: typeof meta.date === 'string' && meta.date.trim()
      ? meta.date
      : `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`,
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    ...(typeof meta.source === 'string' && meta.source.trim() ? { source: meta.source } : {}),
    summary,
  }, body || normalized)
}

interface SubcategoryConfig {
  id: string
  categoryId: string
  title: string
  archTag: string
  techTags: string[]
}

const BACKEND_SUBCATEGORIES: SubcategoryConfig[] = [
  { id: 'gameplay_framework', categoryId: 'game_framework', title: 'Gameplay Framework 基础', archTag: 'arch/gameplay_framework', techTags: ['GameplayFramework', 'GameInstance', 'GameMode', 'GameState', 'Subsystem', 'Lifecycle'] },
  { id: 'actor_component', categoryId: 'game_framework', title: 'Actor / Component 组件', archTag: 'arch/actor_component', techTags: ['Actor', 'Component', 'ActorComponent', 'SceneComponent', 'Blueprint', '组件化'] },
  { id: 'gamemode_pawn_controller', categoryId: 'game_framework', title: 'GameMode / Pawn / Controller', archTag: 'arch/gamemode_pawn_controller', techTags: ['GameMode', 'Pawn', 'PlayerController', 'AIController', 'HUD', 'PlayerState'] },
  { id: 'gameplay_systems', categoryId: 'game_framework', title: '玩法逻辑 / 数据系统', archTag: 'arch/gameplay_systems', techTags: ['GameplayLogic', 'QuestSystem', '战斗系统', '角色系统', '任务系统', '数值配置', 'DataTable'] },
  
  { id: 'rendering_pipeline', categoryId: 'rendering_core', title: '渲染管线 / Renderer', archTag: 'arch/rendering', techTags: ['Rendering', 'Renderer', '渲染管线', 'RHI', 'ViewFamily', 'BasePass', 'RenderThread', '移动端渲染'] },
  { id: 'render_debug_profile', categoryId: 'rendering_core', title: '渲染诊断与性能定位', archTag: 'arch/render_debug_profile', techTags: ['FrameAnalysis', 'RenderDoc', 'ScenePerfMonitor', 'Heatmap', '性能分析', 'MemReport', 'SimpleCsvProfiler'] },
  { id: 'material_shader_postprocess', categoryId: 'rendering_core', title: '材质 / Shader / 后处理', archTag: 'arch/material_light_postprocess', techTags: ['Material', 'Shader', 'Lighting', 'PostProcess', 'DebugView', '材质球', '后处理'] },
  
  { id: 'visibility_culling', categoryId: 'world_building', title: '可见性 / 裁剪 / Culling', archTag: 'arch/visibility_culling', techTags: ['Visibility', 'Culling', 'CullDistanceVolume', 'Bounds', 'Occlusion', '剔除', 'MaxDrawDistance', '消隐'] },
  { id: 'mesh_lod_hism', categoryId: 'world_building', title: 'StaticMesh / LOD / HISM 提交', archTag: 'arch/mesh_lod_hism', techTags: ['StaticMesh', 'LOD', 'HLOD', 'HISM', 'ISM', 'InstancedStaticMesh', 'Section', 'Material Slot'] },
  { id: 'terrain_foliage', categoryId: 'world_building', title: 'Terrain / Foliage / RVT', archTag: 'arch/terrain_foliage', techTags: ['Landscape', 'Foliage', 'Terrain', 'RVT', 'VirtualTexture', '地形草', 'InstancedFoliageActor'] },
  
  { id: 'particles_vfx', categoryId: 'physics_vfx', title: 'Niagara / Cascade 特效', archTag: 'arch/particles_vfx', techTags: ['Cascade', 'Niagara', 'VFXProfiler', '粒子系统', 'ParticleSystem', 'Overdraw', '特效编辑器'] },
  { id: 'sequencer_cinematic', categoryId: 'physics_vfx', title: 'Sequencer 序列动画', archTag: 'arch/sequencer_cinematic', techTags: ['Sequencer', 'LevelSequence', 'MovieScene', 'Spawnable', 'CineCamera', 'VFXProfiler'] },
  
  { id: 'audio_mix_event', categoryId: 'audio_system', title: '音频混音与事件', archTag: 'arch/audio', techTags: ['SoundMix', 'SoundCue', 'AudioEvent', 'Wwise', 'FMOD', '音频混音', 'Metasound'] },
  
  { id: 'umg_slate_ui', categoryId: 'user_interface', title: 'UMG / Slate 界面系统', archTag: 'arch/ui', techTags: ['UMG', 'Slate', 'Widget', 'UI界面', 'MVVM'] },
  
  { id: 'replication_rpc_session', categoryId: 'networking_multiplayer', title: '复制 / RPC / 会话同步', archTag: 'arch/networking', techTags: ['Replication', 'RPC', 'Session', '网络复制', 'ReliableRPC', '多人同步'] },
  
  { id: 'behaviortree_navmesh', categoryId: 'artificial_intelligence', title: '行为树 / 导航系统寻路', archTag: 'arch/ai', techTags: ['BehaviorTree', 'Navigation', 'NavMesh', '寻路导航', '行为树', 'Blackboard'] },
  { id: 'agent_llm_architecture', categoryId: 'artificial_intelligence', title: 'Agent / LLM 智能架构', archTag: 'arch/agent_llm_architecture', techTags: ['Agent', 'LLM', 'Kimi CLI', 'kimi-cli', 'MCP', 'Tool Loop', 'OpenAI', 'DeepSeek'] },
  
  { id: 'cpu_multithread', categoryId: 'runtime_platform', title: 'CPU / 多线程调度', archTag: 'arch/cpu_multithread', techTags: ['CPU', '多线程', 'Thread', 'TaskGraph', 'Async', '性能分析', 'FRunnable'] },
  { id: 'memory_storage', categoryId: 'runtime_platform', title: 'Memory / GC 内存资源', archTag: 'arch/memory_storage', techTags: ['Memory', 'GC', '垃圾回收', 'Serialization', 'AssetRegistry', 'BuildData', 'DataManager', 'PakFile'] },
  { id: 'android_platform', categoryId: 'runtime_platform', title: 'Android 移动平台', archTag: 'arch/android_platform', techTags: ['Android', 'adb', 'OpenGL', 'ES31', 'Mobile', 'AndroidPlatform', 'RenderDoc'] },
  { id: 'networking_online', categoryId: 'runtime_platform', title: '网络底座 / 上传 COS', archTag: 'arch/network_server', techTags: ['Socket', 'TCPIP', 'UDP', 'COS', 'PacketWatermark', 'ServerCloud', '服务器运维'] },
  
  { id: 'web_frontend_product', categoryId: 'tools_web_knowledge', title: 'Nuxt / Vue 前端 Web', archTag: 'arch/web_frontend_product', techTags: ['Nuxt', 'Vue', 'Frontend', '前端工程', 'TypeScript', 'Element Plus', 'Node.js', 'Nitro'] },
  { id: 'knowledge_management', categoryId: 'tools_web_knowledge', title: '知识管理 / Mermaid', archTag: 'arch/knowledge_management', techTags: ['知识管理', 'Knowledge Cards', 'knowledge-cards', 'Mermaid', 'NotebookLM', 'Obsidian'] },
]

const BACKEND_CATEGORIES_MAP: Record<string, { title: string; eyebrow: string; subtitle: string }> = {
  game_framework: { title: 'Gameplay Framework / Core', eyebrow: 'Gameplay Framework', subtitle: 'Gameplay 生命周期、Actor/Component、控制器与玩法对象模型' },
  rendering_core: { title: 'Rendering / Graphics Shading', eyebrow: 'Graphics & Shading', subtitle: '渲染管线、HLSL Shader、材质球逻辑、光照优化与 RenderDoc 分析' },
  world_building: { title: 'World Partition / Foliage', eyebrow: 'World Partition & Foliage', subtitle: '大世界场景构建、关卡流式加载、HLOD 生成、植被 HISM 与 RVT 地形' },
  physics_vfx: { title: 'Physics / Animation / VFX', eyebrow: 'Animation & Physics', subtitle: '碰撞检测、Chaos 刚体破碎、Niagara 粒子特效与 Sequencer 序列动画' },
  audio_system: { title: 'Audio / Sound Engine', eyebrow: 'Audio Systems', subtitle: 'SoundMix、SoundCue、音效触发与 Wwise/FMOD 多声道混音' },
  user_interface: { title: 'UMG / Slate UI', eyebrow: 'UI Systems', subtitle: 'UMG、Slate 底层视口绘制、MVVM 绑定与富交互 UI 架构' },
  networking_multiplayer: { title: 'Networking / Replication', eyebrow: 'Multiplayer & Iris', subtitle: '多人同步复制 Replication、RPC 远程过程调用与多人会话 Session' },
  artificial_intelligence: { title: 'AI / Decision / Agent', eyebrow: 'Intelligence & Agent', subtitle: '行为树 BehaviorTree、导航网格 NavMesh 寻路与 Agent/LLM 大模型架构' },
  runtime_platform: { title: 'Runtime / Platforms / Device', eyebrow: 'Platforms & Iteration', subtitle: 'CPU 多线程调度、GC 垃圾回收、内存序列化与 Android 移动端调试' },
  tools_web_knowledge: { title: 'Tools / Web / Knowledge', eyebrow: 'Developer Tools', subtitle: 'UE Python 编辑器工具、构建发布打包、Nuxt 前端与 Obsidian 知识管理' },
}

function backendScoreCardForSubcategory(card: KnowledgeCardRecord, sub: SubcategoryConfig): number {
  let score = 0
  const tags = (card.tags || []).map(t => t.toLowerCase())
  const title = card.title.toLowerCase()
  const content = card.content.toLowerCase()
  
  // 1. 绝对标签前缀优先
  const archTag = sub.archTag.toLowerCase()
  const hasAbsoluteTag = tags.some(tag => tag === archTag || tag.startsWith(`${archTag}/`))
  if (hasAbsoluteTag) return 1000 // 直接给极大值确立主权

  // 2. 标签精确匹配
  for (const tag of sub.techTags.map(t => t.toLowerCase())) {
    if (tags.includes(tag)) score += 15
    if (title.includes(tag)) score += 10
    if (content.includes(tag)) score += 3
  }

  return score
}

function generateObsidianIndex(cards: KnowledgeCardRecord[]): string {
  // 分组统计
  const subcategoryCardsMap: Record<string, KnowledgeCardRecord[]> = {}
  for (const sub of BACKEND_SUBCATEGORIES) {
    subcategoryCardsMap[sub.id] = []
  }

  for (const card of cards) {
    let bestSubId = ''
    let maxScore = -1
    for (const sub of BACKEND_SUBCATEGORIES) {
      const score = backendScoreCardForSubcategory(card, sub)
      if (score > maxScore) {
        maxScore = score
        bestSubId = sub.id
      }
    }
    // 门槛分数
    if (maxScore > 0 && bestSubId) {
      subcategoryCardsMap[bestSubId]!.push(card)
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  let md = `---\nid: '01-知识体系索引'\ntitle: '01-知识体系索引'\ntype: 'knowledge-map'\ndate: '${today}'\n---\n\n`
  md += `# 🧭 游戏开发架构个人知识体系索引 (index)\n\n`
  md += `本索引由 AI 维基官（Antigravity）根据您的 Obsidian 宪法规范 [WIKI_SCHEMA.md](WIKI_SCHEMA.md) 以及十平行研发大分类自动编译维护。记录了脑库中所有高精度知识卡片（Knowledge Cards）的双向织网归宿。\n\n`
  md += `> [!NOTE]\n`
  md += `> 💡 双击或悬停在卡片 ID 上即可在 Obsidian 中流畅实现预览与跳链。总计 **${cards.length}** 张卡片正在大图上闪耀。\n\n---\n\n`

  // 黄金三行排版
  const rows = [
    { title: '💡 运行时核心 (Gameplay & Engine Core)', categoryIds: ['game_framework', 'networking_multiplayer', 'artificial_intelligence'] },
    { title: '🎨 画面表现、场景与动力表现 (Graphics, World & Dynamics)', categoryIds: ['rendering_core', 'world_building', 'physics_vfx'] },
    { title: '🛠 支撑与交互保障 (Interactions, Infrastructure & Tools)', categoryIds: ['audio_system', 'user_interface', 'runtime_platform', 'tools_web_knowledge'] },
  ]

  for (const row of rows) {
    md += `## ${row.title}\n\n`
    for (const catId of row.categoryIds) {
      const cat = BACKEND_CATEGORIES_MAP[catId]!
      md += `### 🔹 ${cat.title} (${cat.eyebrow})\n`
      md += `> ${cat.subtitle}\n\n`

      const subs = BACKEND_SUBCATEGORIES.filter(s => s.categoryId === catId)
      for (const sub of subs) {
        const subCards = subcategoryCardsMap[sub.id] || []
        md += `#### 🔸 ${sub.title} (\`${sub.id}\` — 共 **${subCards.length}** 篇)\n`
        if (subCards.length === 0) {
          md += `*暂无卡片积淀*\n\n`
        } else {
          // 按照 ID 倒序排列，展示最新研发成果
          const sorted = [...subCards].sort((a, b) => b.id.localeCompare(a.id))
          for (const card of sorted) {
            md += `- [[${card.id}|${card.title}]] - *${card.summary || '暂无摘要'}*\n`
          }
          md += `\n`
        }
      }
      md += `---\n\n`
    }
  }

  return md
}

function generateObsidianLog(cards: KnowledgeCardRecord[]): string {
  // 按照日期分组
  const dateGroups: Record<string, KnowledgeCardRecord[]> = {}
  for (const card of cards) {
    const d = card.date || '未记录日期'
    if (!dateGroups[d]) dateGroups[d] = []
    dateGroups[d]!.push(card)
  }

  const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a))
  const today = new Date().toISOString().slice(0, 10)

  let md = `---\nid: 'log'\ntitle: 'chronological log'\ntype: 'moc'\ndate: '${today}'\n---\n\n`
  md += `# 📅 知识库脑库建设 Chronological Log\n\n`
  md += `本日志按时间轴倒序记录了您与首席维基官协同建设脑库的知识复利增长足迹。\n\n---\n\n`

  for (const date of sortedDates) {
    const groupCards = dateGroups[date]!
    md += `## 📅 ${date} (共更新 **${groupCards.length}** 篇)\n\n`
    // 按照 ID 倒序排列
    const sorted = [...groupCards].sort((a, b) => b.id.localeCompare(a.id))
    for (const card of sorted) {
      md += `*   **${card.id}** - [[${card.id}|${card.title}]]\n`
      md += `    > 💡 **摘要**：${card.summary || '暂无摘要描述'}\n`
      md += `    > 🏷️ **标签**：\`${card.tags.join('`, `')}\` | **领域**：\`${card.domain}\`\n\n`
    }
    md += `---\n\n`
  }

  return md
}

export function buildKnowledgeIndex(): KnowledgeIndex {
  const nodes = scanKnowledgeNodes()
  const cards = nodes
    .filter(node => node.type === 'card')
    .map(toCardRecord)
    .sort((a, b) => b.id.localeCompare(a.id))

  // 自动自愈生成本地 Obsidian Vault 根目录下的 01-知识体系索引.md 与 log.md 文件
  try {
    const indexContent = generateObsidianIndex(cards)
    const logContent = generateObsidianLog(cards)
    const vaultRoot = resolve(KNOWLEDGE_CARDS_DIR, '..')
    writeFileSync(join(vaultRoot, '01-知识体系索引.md'), indexContent, 'utf8')
    writeFileSync(join(vaultRoot, 'log.md'), logContent, 'utf8')
  } catch (err) {
    console.error('Failed to auto generate Obsidian Index/Log files:', err)
  }

  return {
    version: 2,
    updated_at: formatTimestamp(new Date()),
    vaultPath: KNOWLEDGE_CARDS_DIR,
    stats: statsForNodes(nodes),
    cards,
  }
}

export function getKnowledgeCard(id: string): KnowledgeCardRecord | null {
  const filePath = resolveExistingFilePath(id)
  if (!filePath) return null
  return toCardRecord(readNodeFromFile(basename(filePath)))
}

export function getCardMarkdownBody(id: string): string | null {
  const card = getKnowledgeCard(id)
  return card?.content ?? null
}

export function updateKnowledgeCardBody(id: string, markdownBody: string): KnowledgeCardRecord | null {
  const normalizedId = normalizeCardId(id)
  const normalizedBody = markdownBody.replace(/^\ufeff/, '').trim()
  if (!normalizedBody) {
    throw createKnowledgeError(400, 'Card markdown body is empty')
  }

  const filePath = resolveExistingFilePath(normalizedId)
  if (!filePath) return null

  const existing = readFileSync(filePath, 'utf8')
  const summary = extractSummary(normalizedBody).replace(/\r?\n+/g, ' ').trim()

  // 编辑框只编辑正文，这里保留原 frontmatter，并同步 summary，避免 Web 保存破坏 Obsidian 元数据。
  const contentToSave = upsertFrontmatter(existing, { id: normalizedId, summary }, normalizedBody)
  writeFileSync(filePath, contentToSave, 'utf8')

  return getKnowledgeCard(normalizedId)
}

export function createKnowledgeCardFromMarkdown(markdown: string, overwrite = false) {
  const normalized = markdown.replace(/^\ufeff/, '').trim()
  if (!normalized) {
    throw createKnowledgeError(400, 'Card markdown is empty')
  }

  const { meta } = parseFrontmatter(normalized)
  const rawId = typeof meta.id === 'string' ? meta.id.trim() : ''
  const id = rawId ? normalizeCardId(rawId) : nextCardIdForDate(new Date())
  if (!CARD_ID_PATTERN.test(id)) {
    throw createKnowledgeError(400, 'Card id must match KC-YYYY-MM-DD-NNN or KC-YYYY_MM_DD_NNN')
  }

  ensureVaultDir()
  const filePath = filePathForId(id)
  const existingPath = resolveExistingFilePath(id)
  if (existingPath && !overwrite) {
    throw createKnowledgeError(409, `Card already exists: ${id}`)
  }

  writeFileSync(existingPath || filePath, normalizeCreatedMarkdown(normalized, id), 'utf8')
  const index = buildKnowledgeIndex()

  return {
    id,
    created: !existingPath,
    index,
  }
}

export function deleteKnowledgeCard(id: string): boolean {
  const filePath = resolveExistingFilePath(id)
  if (!filePath) return false
  unlinkSync(filePath)
  return true
}

export function batchDeleteCards(ids: string[]): { deleted: number; notFound: string[] } {
  let deleted = 0
  const notFound: string[] = []

  for (const id of ids) {
    if (deleteKnowledgeCard(id)) {
      deleted++
    } else {
      notFound.push(id)
    }
  }

  return { deleted, notFound }
}

export function findDuplicateCards(): {
  groups: { title: string; keep: Omit<KnowledgeCardRecord, 'content'>; duplicates: Omit<KnowledgeCardRecord, 'content'>[] }[]
  totalDuplicates: number
} {
  const cards = scanKnowledgeNodes()
    .filter(node => node.type === 'card')
    .map(toCardRecord)
    .sort((a, b) => a.id.localeCompare(b.id))

  const groupMap = new Map<string, KnowledgeCardRecord[]>()
  for (const card of cards) {
    const titleKey = card.title.trim()
    if (!titleKey) continue
    if (!groupMap.has(titleKey)) groupMap.set(titleKey, [])
    groupMap.get(titleKey)!.push(card)
  }

  const groups: { title: string; keep: any; duplicates: any[] }[] = []
  let totalDuplicates = 0

  for (const [title, groupedCards] of groupMap) {
    if (groupedCards.length < 2) continue
    const [keep, ...duplicates] = groupedCards.map(({ content: _content, ...card }) => card)
    groups.push({ title, keep, duplicates })
    totalDuplicates += duplicates.length
  }

  return { groups, totalDuplicates }
}

export function batchImportCards(
  items: { id: string; markdown: string }[],
  overwrite = false
): { imported: number; skipped: number; errors: number; results: { id: string; status: string; message?: string }[] } {
  let imported = 0
  let skipped = 0
  let errors = 0
  const results: { id: string; status: string; message?: string }[] = []

  for (const item of items) {
    try {
      const id = normalizeCardId(item.id)
      const existingPath = resolveExistingFilePath(id)
      if (existingPath && !overwrite) {
        results.push({ id, status: 'skipped', message: `卡片已存在: ${id}` })
        skipped++
        continue
      }

      writeFileSync(existingPath || filePathForId(id), normalizeCreatedMarkdown(item.markdown, id), 'utf8')
      results.push({ id, status: existingPath ? 'overwritten' : 'imported' })
      imported++
    } catch (e: any) {
      results.push({ id: item.id, status: 'error', message: e?.message || '导入失败' })
      errors++
    }
  }

  return { imported, skipped, errors, results }
}

function normalizeWikiTarget(rawTarget: string) {
  const target = rawTarget.split('|')[0] || ''
  return target
    .split('#')[0]!
    .trim()
    .replace(/\.md$/i, '')
}

function extractWikiLinks(content: string) {
  const links: { target: string; label?: string }[] = []
  const regex = /\[\[([^\]]+)\]\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const raw = (match[1] || '').trim()
    const target = normalizeWikiTarget(raw)
    if (!target) continue

    // 过滤掉指向附件资源或物理文件路径的链接（如 assets/KC-xxxx.png、pdf、zip 等），它们不属于知识卡片概念双链
    if (
      target.includes('/') || 
      target.includes('\\') || 
      /\.(png|jpg|jpeg|gif|webp|svg|mp4|pdf|zip|rar)$/i.test(target)
    ) {
      continue
    }

    const label = raw.includes('|') ? raw.split('|').slice(1).join('|').trim() : undefined
    links.push({ target, label })
  }
  return links
}

export function buildKnowledgeGraph() {
  const nodes = scanKnowledgeNodes()
  const nodeIds = new Set(nodes.map(node => node.id))
  const edges: KnowledgeGraphEdge[] = []
  const seenEdges = new Set<string>()

  for (const node of nodes) {
    for (const link of extractWikiLinks(node.content)) {
      const target = nodeIds.has(link.target) ? link.target : link.target.replace(/_/g, '-')
      const exists = nodeIds.has(target)
      const edgeKey = `${node.id}->${target}`
      if (seenEdges.has(edgeKey)) continue
      seenEdges.add(edgeKey)
      edges.push({
        source: node.id,
        target,
        label: link.label,
        missing: !exists,
      })
    }
  }

  return {
    entryId: KNOWLEDGE_MAP_ENTRY_ID,
    updated_at: formatTimestamp(new Date()),
    vaultPath: KNOWLEDGE_CARDS_DIR,
    stats: statsForNodes(nodes),
    nodes: nodes.map(({ content: _content, ...node }) => node),
    edges,
  }
}

export function resolveKnowledgeAssetPath(rawPath: string) {
  const decoded = decodeURIComponent(rawPath)
  const safePath = normalize(decoded).replace(/^(\.\.[\\/])+/, '')
  const resolved = resolve(KNOWLEDGE_CARDS_DIR, safePath)
  const vaultRoot = resolve(KNOWLEDGE_CARDS_DIR)

  if (!resolved.startsWith(vaultRoot)) {
    throw createKnowledgeError(400, 'Invalid asset path')
  }
  if (!existsSync(resolved)) {
    throw createKnowledgeError(404, 'Asset not found')
  }
  return resolved
}
