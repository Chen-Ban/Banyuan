/**
 * 相地 · 记忆系统类型定义
 *
 * Agent 记忆分三层：
 *
 *   1. 短期记忆（Working Memory）
 *      - MasterGraph 单次执行中的对话上下文
 *      - 由 MasterGraph 状态管理
 *      - 生命周期：单次执行
 *
 *   2. 中期记忆（Episodic Memory）
 *      - 跨任务的"经验"记忆：做了什么、结果如何、踩了什么坑
 *      - 以 Episode（事件片段）为单位存储
 *      - 生命周期：项目级（同一个项目的多次迭代间共享）
 *      - 用途：避免重复犯错、复用成功经验
 *
 *   3. 长期记忆（Semantic Memory）
 *      - 稳定的知识和偏好：用户习惯、设计风格、项目规律
 *      - 以 Fact（事实）为单位存储
 *      - 生命周期：跨项目持久化
 *      - 用途：个性化、学习成长
 *
 * 记忆与 KnowledgeStore 的区别：
 *   - KnowledgeStore 存"参考文档"（外部知识，预先写入）
 *   - Memory 存"习得经验"（运行时积累，Agent 自己写入）
 */

// ─── 中期记忆：Episodic Memory ────────────────────────────────────────────────

/**
 * 事件片段：Agent 一次执行的经验记录
 */
export interface Episode {
  /** 唯一标识 */
  id: string;
  /** 所属命名空间 */
  namespace?: MemoryNamespace;
  /** 关联的 ChangeSpec ID */
  changeSpecId?: string;
  /** 事件标题/摘要 */
  title: string;
  /** 事件详细内容（做了什么、结果如何） */
  content: string;
  /** 事件结果 */
  outcome: EpisodeOutcome;
  /** 提取的经验教训 */
  lessons?: string[];
  /** 涉及的实体/文件 */
  involvedEntities?: string[];
  /** 标签 */
  tags?: string[];
  /** 创建时间戳（ms） */
  createdAt: number;
  /** 最后访问时间（用于衰减） */
  lastAccessedAt: number;
  /** 重要性分数（0-1），影响检索排序和保留策略 */
  importance: number;
}

export type EpisodeOutcome = "success" | "failure" | "partial" | "aborted";

/**
 * 中期记忆接口
 *
 * 存储跨任务的经验，支持按相关性检索。
 * 当 Agent 开始新任务时，检索相关的历史经验注入上下文。
 */
export interface EpisodicMemory {
  /**
   * 记录一个新的事件片段
   *
   * 通常在 HarnessRunner.run() 执行结束后调用，
   * 将本次执行的结果和经验写入记忆。
   */
  record(episode: Omit<Episode, "id" | "createdAt" | "lastAccessedAt">): Promise<Episode>;

  /**
   * 检索与查询相关的历史经验
   *
   * @param query 检索查询（通常是新任务的 ChangeSpec 标题+描述）
   * @param options 检索选项
   * @returns 按相关性降序排列的经验片段
   */
  recall(query: string, options?: EpisodicRecallOptions): Promise<Episode[]>;

  /**
   * 总结并压缩旧经验
   *
   * 当经验数量过多时，将旧的/低重要性的经验合并摘要。
   * 类似人类记忆的"遗忘 + 概括"。
   */
  consolidate(options?: ConsolidateOptions): Promise<void>;

  /** 获取最近 N 条经验 */
  getRecent(count: number): Promise<Episode[]>;

  /** 总经验数 */
  size(): Promise<number>;
}

export interface EpisodicRecallOptions {
  /** 最多返回条目数，默认 5 */
  topK?: number;
  /** 只检索特定结果类型 */
  outcomeFilter?: EpisodeOutcome[];
  /** 时间范围过滤（ms 时间戳） */
  since?: number;
  /** 标签过滤 */
  tags?: string[];
  /** 是否同时检索 shared 命名空间的经验，默认 true */
  includeShared?: boolean;
}

export interface ConsolidateOptions {
  /** 保留最近 N 条原始经验，默认 50 */
  keepRecent?: number;
  /** 低于此重要性的经验参与压缩，默认 0.3 */
  importanceThreshold?: number;
}

// ─── 长期记忆：Semantic Memory ────────────────────────────────────────────────

/**
 * 事实条目：稳定的知识或偏好
 */
export interface Fact {
  /** 唯一标识 */
  id: string;
  /** 所属命名空间 */
  namespace?: MemoryNamespace;
  /** 事实类别 */
  category: FactCategory;
  /** 事实内容（自然语言描述） */
  content: string;
  /** 置信度（0-1），多次验证的事实置信度更高 */
  confidence: number;
  /** 该事实被引用/验证的次数 */
  referenceCount: number;
  /** 来源（从哪次经验中提炼） */
  derivedFrom?: string[];
  /** 创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
}

export type FactCategory =
  | "user_preference"    // 用户偏好（如"用户喜欢圆角按钮"）
  | "design_pattern"     // 设计模式（如"该项目用 8px 网格"）
  | "coding_convention"  // 编码惯例（如"组件命名用 PascalCase"）
  | "project_knowledge"  // 项目知识（如"首页的导航栏用了 position:fixed"）
  | "tool_usage"         // 工具使用经验（如"修改布局时先 getAppState"）
  | "error_pattern"      // 错误模式（如"不能给 Group 节点设置 fill"）
  | "project_constraint" // 项目约束（如"禁止在 packages/ 中引入 React"）
  | "feature_history"    // 功能演变历史
  | "user_intent_pattern" // 用户意图模式（如"用户说'大一点'通常指 +4px"）
  | "api_usage"          // API 使用模式（如"createView 后需要 attachToScene"）
  | "adr_summary"        // 架构决策摘要
  | "component_pattern"  // 组件使用模式
  | "tool_sequence"      // 工具调用序列模式
  | "operation_pattern"  // 操作模式
  | "general";           // 其他

/**
 * 长期记忆接口
 *
 * 存储 Agent 从经验中提炼的稳定知识和偏好。
 * 类似人的"常识"和"习惯"。
 */
export interface SemanticMemory {
  /**
   * 存储一个新事实
   * 若已存在相似事实，更新其置信度和引用计数
   */
  store(fact: Omit<Fact, "id" | "createdAt" | "updatedAt" | "referenceCount">): Promise<Fact>;

  /**
   * 检索与查询相关的事实
   */
  recall(query: string, options?: SemanticRecallOptions): Promise<Fact[]>;

  /**
   * 强化一个事实（增加引用计数和置信度）
   * 当经验验证了某个事实时调用
   */
  reinforce(factId: string): Promise<void>;

  /**
   * 弱化一个事实（降低置信度）
   * 当经验与某个事实矛盾时调用
   */
  weaken(factId: string): Promise<void>;

  /**
   * 获取指定类别的所有事实
   */
  getByCategory(category: FactCategory): Promise<Fact[]>;

  /** 总事实数 */
  size(): Promise<number>;
}

export interface SemanticRecallOptions {
  /** 最多返回条目数，默认 10 */
  topK?: number;
  /** 最低置信度，默认 0.3 */
  minConfidence?: number;
  /** 类别过滤 */
  categories?: FactCategory[];
  /** 是否同时检索 shared 命名空间的事实，默认 true */
  includeShared?: boolean;
}

// ─── MemoryManager：统一记忆管理 ──────────────────────────────────────────────

/**
 * 记忆管理器
 *
 * 统一管理中期记忆和长期记忆，提供：
 *   1. 任务开始时的记忆加载（注入相关经验和事实）
 *   2. 任务结束时的记忆写入（记录经验、提炼事实）
 *   3. 定期的记忆整理（压缩、遗忘、概括）
 */
// ─── 记忆命名空间 ────────────────────────────────────────────────────────────

/**
 * 记忆命名空间
 *
 * 每个 Subagent 拥有自己的命名空间，互不干扰：
 *   - pm：产品/需求管理 Agent
 *   - arch：架构设计 Agent
 *   - visual：视觉设计 Agent
 *   - task：任务执行 Agent
 *   - shared：跨 Agent 共享（只有 PlanningOrchestrator 可写入）
 */
export type MemoryNamespace = "pm" | "arch" | "visual" | "task" | "shared";

/**
 * 命名空间记忆管理器接口
 *
 * 每个 Subagent 持有一个绑定到自己命名空间的实例。
 * 读取时自动合并 shared 命名空间的内容。
 */
export interface NamespacedMemoryManager extends MemoryManager {
  /** 当前绑定的命名空间 */
  readonly namespace: MemoryNamespace;
}

/**
 * 共享记忆写入器接口
 *
 * 只有 PlanningOrchestrator 有权写入 shared 命名空间。
 */
export interface SharedMemoryWriter {
  /** 写入项目约束 */
  writeConstraint(content: string, confidence?: number): Promise<Fact>;
  /** 写入项目事实 */
  writeProjectFact(content: string, confidence?: number): Promise<Fact>;
  /** 写入共享经验 */
  writeEpisode(
    episode: Omit<Episode, "id" | "namespace" | "createdAt" | "lastAccessedAt">
  ): Promise<Episode>;
}

export interface MemoryManager {
  /** 中期记忆（经验） */
  readonly episodic: EpisodicMemory;
  /** 长期记忆（事实） */
  readonly semantic: SemanticMemory;

  /**
   * 任务开始时加载相关记忆
   * 返回格式化的 prompt 片段，注入 system prompt
   *
   * @param taskDescription 新任务的描述
   * @returns 记忆 prompt 片段（可能为 null，若无相关记忆）
   */
  loadForTask(taskDescription: string): Promise<string | null>;

  /**
   * 任务结束时保存经验
   * 自动记录 Episode + 尝试提炼新 Fact
   *
   * @param episode 本次执行的经验
   * @param extractFacts 是否尝试从经验中提炼事实（需要 LLM），默认 true
   */
  saveAfterTask(
    episode: Omit<Episode, "id" | "createdAt" | "lastAccessedAt">,
    extractFacts?: boolean
  ): Promise<void>;

  /**
   * 定期整理记忆
   * 压缩旧经验、清理低置信度事实
   */
  maintain(): Promise<void>;
}
