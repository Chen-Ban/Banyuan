/**
 * 相地 · 知识库检索类型定义
 *
 * 知识库（KnowledgeStore）是 XiangDi 架构中的第三层信息来源：
 *
 *   1. ProjectSpec（静态约束，全局注入）
 *      - 编码惯例、禁止事项、Agent 行为指引
 *      - 每次执行都注入，量小且稳定
 *
 *   2. KnowledgeStore（静态知识，按需检索）
 *      - 组件文档、模板库、设计规范等大体量知识
 *      - 根据当前任务的描述做语义检索，取 top-K 片段
 *
 *   3. 工具调用（动态状态，实时获取）
 *      - 画布当前状态、节点位置等运行时数据
 *      - 由 MasterGraph 通过工具调用实时获取
 *
 * 三层各司其职：ProjectSpec 告诉 Agent "什么不能做"，
 * KnowledgeStore 告诉 Agent "怎么做（参考知识）"，
 * 工具调用告诉 Agent "现在是什么状态"。
 */

// ─── 检索结果 ──────────────────────────────────────────────────────────────────

/**
 * 知识片段
 * 检索返回的最小单元
 */
export interface KnowledgeChunk {
  /** 文本内容 */
  content: string
  /** 来源标识，如 "Button 组件文档"、"海报排版规范" */
  source: string
  /** 相关性分数（0-1），由检索引擎给出 */
  score: number
  /** 可选的元数据，由实现方决定内容 */
  metadata?: Record<string, unknown>
}

// ─── KnowledgeStore 接口 ───────────────────────────────────────────────────────

/**
 * 知识库检索接口
 *
 * 实现方可以是：
 * - LanceDBKnowledgeStore（向量 + BM25 混合检索，生产推荐）
 * - MemoryKnowledgeStore（关键词匹配，测试/小数据量）
 */
export interface KnowledgeStore {
  /**
   * 根据查询文本检索相关知识片段
   *
   * @param query 检索查询（通常是 ChangeSpec 的 title + 当前 task 描述）
   * @param options 可选的检索参数
   * @returns 按相关性降序排列的知识片段数组
   */
  query(query: string, options?: KnowledgeQueryOptions): Promise<KnowledgeChunk[]>
}

/**
 * 检索选项
 */
export interface KnowledgeQueryOptions {
  /** 最多返回的片段数量，默认 5 */
  topK?: number
  /** 最低相关性分数阈值（0-1），低于此分数的片段会被过滤 */
  minScore?: number
  /** 可选的过滤条件，按 metadata 字段过滤 */
  filter?: Record<string, unknown>
}

// ─── 知识条目（写入用）─────────────────────────────────────────────────────────

/**
 * 写入知识库的条目
 */
export interface KnowledgeEntry {
  /** 条目唯一标识 */
  id: string
  /** 文本内容 */
  content: string
  /** 来源标识 */
  source: string
  /** 可选的元数据 */
  metadata?: Record<string, unknown>
}

// ─── 可写知识库接口（扩展）────────────────────────────────────────────────────

/**
 * 可写知识库接口
 *
 * 继承只读的 KnowledgeStore，增加写入和管理操作。
 */
export interface MutableKnowledgeStore extends KnowledgeStore {
  /** 添加知识条目 */
  add(entries: KnowledgeEntry[]): Promise<void>
  /** 删除知识条目 */
  remove(ids: string[]): Promise<void>
  /** 清空所有条目 */
  clear(): Promise<void>
  /** 当前条目总数 */
  size(): Promise<number>
}

// ─── 图检索接口（GraphRAG）────────────────────────────────────────────────────

/**
 * 知识图谱中的实体节点
 */
export interface GraphEntity {
  /** 实体唯一标识 */
  id: string
  /** 实体类型（如 "page"、"component"、"style"、"layout"） */
  type: string
  /** 实体名称 */
  name: string
  /** 实体描述/内容 */
  description?: string
  /** 附加属性 */
  properties?: Record<string, unknown>
}

/**
 * 知识图谱中的关系边
 */
export interface GraphRelation {
  /** 关系唯一标识 */
  id: string
  /** 源实体 ID */
  sourceId: string
  /** 目标实体 ID */
  targetId: string
  /** 关系类型（如 "contains"、"references"、"depends_on"、"styled_by"） */
  type: string
  /** 关系描述 */
  description?: string
  /** 关系权重（0-1） */
  weight?: number
}

/**
 * 图检索结果——子图
 */
export interface SubGraph {
  entities: GraphEntity[]
  relations: GraphRelation[]
}

/**
 * 图知识库接口（GraphRAG）
 *
 * 基于实体-关系图谱的知识存储和检索。
 * 适合多页面关联修改、组件影响分析等需要关系推理的场景。
 */
export interface GraphKnowledgeStore {
  /** 添加实体 */
  addEntities(entities: GraphEntity[]): Promise<void>
  /** 添加关系 */
  addRelations(relations: GraphRelation[]): Promise<void>
  /** 删除实体（级联删除相关的关系） */
  removeEntities(ids: string[]): Promise<void>

  /**
   * 根据查询获取相关子图
   * 先语义匹配找到入口实体，再沿关系边扩展 N 跳
   */
  querySubGraph(query: string, options?: GraphQueryOptions): Promise<SubGraph>

  /**
   * 影响分析：给定一组实体 ID，找出所有受影响的实体
   */
  analyzeImpact(entityIds: string[], options?: ImpactAnalysisOptions): Promise<SubGraph>

  /** 获取实体的直接邻居 */
  getNeighbors(entityId: string, depth?: number): Promise<SubGraph>
}

export interface GraphQueryOptions {
  /** 从入口实体扩展的跳数，默认 2 */
  maxHops?: number
  /** 最多返回的实体数，默认 20 */
  maxEntities?: number
  /** 关系类型过滤 */
  relationTypes?: string[]
  /** 实体类型过滤 */
  entityTypes?: string[]
}

export interface ImpactAnalysisOptions {
  /** 遍历方向：forward（正向依赖）、backward（被依赖）、both */
  direction?: 'forward' | 'backward' | 'both'
  /** 最大遍历深度，默认 3 */
  maxDepth?: number
  /** 只考虑这些关系类型 */
  relationTypes?: string[]
}

// ─── 检索路由（GraphRAG 场景）─────────────────────────────────────────────────

/**
 * 检索策略类型
 */
export type RetrievalStrategy = 'vector' | 'graph' | 'hybrid'

/**
 * 路由决策结果
 */
export interface RoutingDecision {
  /** 选择的策略 */
  strategy: RetrievalStrategy
  /** 路由理由 */
  reasoning: string
  /** 若为 graph 策略，提取的入口实体关键词 */
  graphEntryHints?: string[]
}

/**
 * 检索路由器接口
 */
export interface RetrievalRouter {
  route(query: string, context?: RouterContext): Promise<RoutingDecision>
}

export interface RouterContext {
  /** 变更提案描述 */
  proposal?: string
  /** 是否涉及多页面 */
  multiPage?: boolean
  /** 涉及的实体类型提示 */
  entityHints?: string[]
}
