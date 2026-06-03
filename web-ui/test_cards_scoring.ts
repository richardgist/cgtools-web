import { buildKnowledgeIndex } from './server/utils/knowledgeCards';

// 模拟前端的 ARCH_MODULES_CONFIG
interface ArchModule {
  id: string;
  title: string;
  archTag: string;
  techTags: string[];
  semanticKeywords?: string[];
  strongKeywords?: string[];
}

const ARCH_MODULES_CONFIG: ArchModule[] = [
  { 
    id: 'player_external', 
    title: '玩家 / 外部系统', 
    archTag: 'arch/player_external', 
    techTags: ['SDK', 'OnlineService', 'EOS', 'SteamSDK', '输入系统', 'InputDevice'],
    strongKeywords: ['SDK', 'OnlineService', 'EOS', 'SteamSDK', 'EpicOnlineServices'],
    semanticKeywords: ['InputDevice', '输入系统', '外设', '登录', '支付', 'Achievement', 'Friend', 'Party']
  },
  { 
    id: 'gameplay_app', 
    title: '游戏应用层', 
    archTag: 'arch/gameplay_app', 
    techTags: ['关卡逻辑', '战斗系统', '角色系统', '任务系统', '数值配置', 'QuestSystem', 'GameplayLogic'],
    strongKeywords: ['GameplayLogic', 'QuestSystem', '战斗系统', '关卡逻辑', '角色系统', '数值配置'],
    semanticKeywords: ['技能系统', '装备', '背包', '任务', '数值', '属性', '怪物AI', '副本']
  },
  { 
    id: 'gameplay_framework', 
    title: 'Gameplay Framework', 
    archTag: 'arch/gameplay_framework', 
    techTags: ['GameplayFramework', '引擎架构', '底层框架'],
    strongKeywords: ['GameplayFramework', 'UGameInstance', 'AGameModeBase', 'AGameStateBase', 'AGameSession', 'UGameplayStatics'],
    semanticKeywords: ['引擎架构', '底层框架', 'Subsystem', '子系统', 'Lifecycle', '生命周期', 'GameInstance']
  },
  { 
    id: 'actor_component', 
    title: 'Actor / Component', 
    archTag: 'arch/actor_component', // 刚才前端写错成 actor_component，这里纠正为 arch/actor_component
    techTags: ['Actor', 'Component', '组件化', 'ActorComponent', 'SceneComponent'],
    strongKeywords: ['AActor', 'UActorComponent', 'USceneComponent', '组件化', 'OnRegister', 'RegisterComponent', 'DestroyComponent'],
    semanticKeywords: ['ChildActor', 'RootComponent', 'Tick', 'SpawnActor', 'AttachToComponent', 'PrimitiveComponent', 'MeshComponent']
  },
  { 
    id: 'gamemode_pawn_controller', 
    title: 'GameMode、Pawn、Controller', 
    archTag: 'arch/gamemode_pawn_controller', 
    techTags: ['GameMode', 'Pawn', 'PlayerController', 'AIController', 'HUD'],
    strongKeywords: ['AGameMode', 'APawn', 'APlayerController', 'AAIController', 'AHUD'],
    semanticKeywords: ['Possess', 'UnPossess', 'Spectator', 'PlayerState']
  },
  { 
    id: 'rendering', 
    title: 'Rendering', 
    archTag: 'arch/rendering', 
    techTags: ['Rendering', '渲染管线', 'RHI', 'Graphics', 'CullDistanceVolume', 'HISM', 'ISM', 'Foliage', 'MaxDrawDistance', 'DrawDistance', 'CullDistance'],
    strongKeywords: ['渲染管线', 'RHI', 'FSceneRenderer', 'DeferredShading', 'ForwardShading', 'CullDistanceVolume', 'HISM', 'ISM', 'Foliage', 'MaxDrawDistance', 'CachedMaxDrawDistance', 'CullDistance', 'ScenePerf'],
    semanticKeywords: ['GPUDriven', 'Nanite', 'Lumen', 'VirtualShadowMap', 'DrawCall', 'RenderPass', 'StaticMesh', 'InstancedStaticMesh', 'HierarchicalInstancedStaticMesh', '消隐', '距离裁剪', 'LOD', 'HLOD']
  },
  { 
    id: 'material_light_postprocess', 
    title: '材质、光照、后处理', 
    archTag: 'arch/material_light_postprocess', 
    techTags: ['Material', 'Shader', 'Lighting', 'PostProcess', '后处理', '材质球', '光照优化', 'ArtPerfVisualization', 'ArtInsight'],
    strongKeywords: ['MaterialInstance', 'HLSL', 'Shader', 'PostProcess', '后处理', 'ArtPerfVisualization', 'ArtInsight'],
    semanticKeywords: ['材质球', '光照优化', 'RayTracing', 'ShadowMap', 'Decal', '贴图', 'VS', 'PS']
  },
  { 
    id: 'memory_storage', 
    title: '内存 / 存储', 
    archTag: 'arch/memory_storage', 
    techTags: ['Memory', 'GC', '垃圾回收', 'Serialization', '序列化', 'AssetRegistry', '资源加载', 'BuildData', 'DataManager'],
    strongKeywords: ['GarbageCollection', 'UObjectGC', 'FArchive', 'AssetRegistry', '序列化', 'BuildData', 'DataManager'],
    semanticKeywords: ['GC', 'Memory', '垃圾回收', 'Serialization', 'AssetLoading', 'StreamableManager', 'PakFile', 'UPackage']
  }
];

const index = buildKnowledgeIndex();
const targetCardIds = [
  'KC-2026-05-26-003',
  'KC-2026-01-22-001',
  'KC-2026-01-17-001',
  'KC-2025-01-08-001',
  'KC-2026-04-07-001',
  'KC-2026-04-05-001',
  'KC-2026-04-05-003',
  // 额外查找 2026-05-22-005 以便验证
  'KC-2026-05-22-005',
  'KC-2026-05-22-003',
  'KC-2026-05-20-002',
  'KC-2026-05-20-001'
];

const cards = index.cards.filter(c => targetCardIds.includes(c.id));

console.log(`Found ${cards.length} target cards for scoring analysis.\n`);

for (const card of cards) {
  console.log(`=========================================`);
  console.log(`CARD: [${card.id}] ${card.title}`);
  console.log(`Tags: ${JSON.stringify(card.tags)}`);
  
  const cardTitleLower = (card.title || '').toLowerCase();
  const cardSummaryLower = (card.summary || '').toLowerCase();
  const cardContentLower = cardSummaryLower;
  const cardTagsLower = (card.tags || []).map(t => t.toLowerCase());
  
  const scores: { mod: ArchModule; score: number; details: string[] }[] = [];
  
  for (const mod of ARCH_MODULES_CONFIG) {
    const archTagLower = mod.archTag.toLowerCase();
    const techTagsLower = (mod.techTags || []).map(t => t.toLowerCase());
    const strongKeywordsLower = (mod.strongKeywords || []).map(k => k.toLowerCase());
    const semanticKeywordsLower = (mod.semanticKeywords || []).map(k => k.toLowerCase());
    
    let score = 0;
    const details: string[] = [];
    
    // 1. 最高优先级：显式架构专属层级标签精准匹配
    const hasAbsoluteTag = cardTagsLower.some(t => t === archTagLower || t.startsWith(archTagLower + '/'));
    if (hasAbsoluteTag) {
      score += 100;
      details.push(`Absolute Tag: ${archTagLower} (+100)`);
    }
    
    // 2. 次高优先级：卡片 tags 命中该领域 techTags (+8)
    const matchedTags = cardTagsLower.filter(t => techTagsLower.includes(t));
    if (matchedTags.length > 0) {
      score += matchedTags.length * 8;
      details.push(`TechTags matched: ${JSON.stringify(matchedTags)} (+${matchedTags.length * 8})`);
    }
    
    // 3. 标题直接包含模块标题核心词 (+6)
    const modTitleClean = mod.title.replace(/\s+/g, '').toLowerCase();
    if (modTitleClean.length > 2 && cardTitleLower.includes(modTitleClean)) {
      score += 6;
      details.push(`Title matched module title: ${modTitleClean} (+6)`);
    }
    
    // 4. 超强特征词匹配
    for (const keyword of strongKeywordsLower) {
      if (!keyword) continue;
      if (cardTitleLower.includes(keyword)) {
        score += 8;
        details.push(`StrongKeyword in Title: ${keyword} (+8)`);
      } else if (cardSummaryLower.includes(keyword)) {
        score += 6;
        details.push(`StrongKeyword in Summary: ${keyword} (+6)`);
      } else if (cardContentLower.includes(keyword)) {
        score += 5;
        details.push(`StrongKeyword in Content: ${keyword} (+5)`);
      }
    }
    
    // 5. 语义特征词匹配
    for (const keyword of semanticKeywordsLower) {
      if (!keyword) continue;
      if (cardTitleLower.includes(keyword)) {
        score += 4;
        details.push(`SemanticKeyword in Title: ${keyword} (+4)`);
      } else if (cardSummaryLower.includes(keyword)) {
        score += 2;
        details.push(`SemanticKeyword in Summary: ${keyword} (+2)`);
      } else if (cardContentLower.includes(keyword)) {
        score += 1.5;
        details.push(`SemanticKeyword in Content: ${keyword} (+1.5)`);
      }
    }
    
    scores.push({ mod, score, details });
  }
  
  scores.sort((a, b) => b.score - a.score);
  console.log(`Scores breakdown (above threshold 5):`);
  const valid = scores.filter(s => s.score >= 5);
  if (valid.length === 0) {
    console.log(`  No modules scored above threshold.`);
  } else {
    valid.forEach(s => {
      console.log(`  - [${s.mod.id}] Score: ${s.score}`);
      s.details.forEach(d => console.log(`    * ${d}`));
    });
    
    const maxScore = Math.max(...valid.map(m => m.score));
    const targetModules = valid
      .filter(m => (maxScore - m.score) <= 1.5)
      .map(m => m.mod.id);
    console.log(`  ==> DECISION MODULES: ${JSON.stringify(targetModules)}`);
  }
}
