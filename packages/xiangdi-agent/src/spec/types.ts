/**
 * 相地 · Spec 类型定义
 *
 * SDD（Spec-Driven Development）的核心契约。
 * Spec 分两层：
 *
 *   1. ProjectSpec（项目级规范）
 *      - 来源：固定文件（如 xiangdi.spec.md / AGENTS.md）
 *      - 生命周期：与项目共存，跨越所有任务
 *      - 作用：注入 system prompt，约束 Agent 的全局行为
 *
 *   2. ChangeSpec（变更级过程文件）
 *      - 来源：用户输入触发生成
 *      - 生命周期：单次任务，完成后可归档
 *      - 作用：描述"这次要做什么"，驱动 Harness 执行
 */

// ─── ProjectSpec（项目级规范）────────────────────────────────────────────────

/**
 * 项目级规范的原始内容
 * 通常从 AGENTS.md / xiangdi.spec.md 等固定文件加载
 */
export interface ProjectSpecRaw {
  /** 规范文件路径（可选，用于溯源） */
  filePath?: string;
  /** 规范的 Markdown 原文 */
  content: string;
  /** 加载时间戳 */
  loadedAt: number;
}

/**
 * 应用数据模型中的字段定义
 */
export interface AppSchemaField {
  /** 字段名 */
  name: string;
  /** 字段显示名 */
  displayName: string;
  /** 字段类型 */
  type: string;
  /** 是否必填 */
  required: boolean;
  /** 默认值 */
  defaultValue?: unknown;
  /** 引用的 Collection 名（type 为 ref 时） */
  refCollection?: string;
  /** 枚举值列表（type 为 enum 时） */
  enumValues?: string[];
}

/**
 * 应用数据模型中的 Collection 定义
 */
export interface AppSchemaCollection {
  /** Collection 名称 */
  collectionName: string;
  /** Collection 中的字段列表 */
  fields: AppSchemaField[];
}

/**
 * 解析后的项目级规范
 * 包含结构化的约束、惯例、禁止项等
 */
export interface ProjectSpec {
  /** 项目名称 */
  projectName: string;
  /** 项目描述 */
  description?: string;
  /**
   * 编码惯例 / 架构约束
   * 例如："所有节点 ID 必须使用 nanoid 生成"
   */
  conventions: string[];
  /**
   * 禁止行为
   * 例如："不得直接修改 BanvasGL 内部状态，必须通过工具调用"
   */
  prohibitions: string[];
  /**
   * Agent 行为指引
   * 例如："每次工具调用前先 get_app_state 确认当前状态"
   */
  agentGuidelines: string[];
  /**
   * 应用数据模型定义（可选）
   * 描述应用中所有 Collection 及其字段结构，
   * 供云函数工具等理解可操作的数据结构
   */
  appSchema?: AppSchemaCollection[];
  /** 原始内容，保留用于注入 system prompt */
  raw: ProjectSpecRaw;
}

// ─── ChangeSpec（变更级过程文件）─────────────────────────────────────────────

/** 变更的当前状态 */
export type ChangeStatus =
  | "draft"       // 草稿：proposal 已生成，待审核
  | "approved"    // 已批准：可以开始执行
  | "in_progress" // 执行中
  | "done"        // 完成
  | "archived";   // 已归档

/**
 * 单个任务项
 * 对应 OpenSpec 的 tasks.md 中的一行
 */
export interface ChangeTask {
  id: string;
  /** 任务描述 */
  description: string;
  /** 是否完成 */
  done: boolean;
  /** 依赖的前置任务 ID */
  dependsOn?: string[];
}

/**
 * 变更级 Spec（过程文件）
 * 由用户输入触发生成，描述单次任务的完整施工图纸
 */
export interface ChangeSpec {
  /** 变更唯一标识，如 "add-login-page" */
  id: string;
  /** 变更标题 */
  title: string;
  /**
   * Proposal：为什么做、做什么、不做什么
   * 对应 OpenSpec 的 proposal.md
   */
  proposal: {
    why: string;
    what: string;
    outOfScope?: string;
    successCriteria?: string[];
  };
  /**
   * 功能 Spec：行为契约，"Given...When...Then..."
   * 对应 OpenSpec 的 specs/ 目录
   */
  specs: string[];
  /**
   * 任务清单：有序的实施步骤
   * 对应 OpenSpec 的 tasks.md
   */
  tasks: ChangeTask[];
  /** 当前状态 */
  status: ChangeStatus;
  /** 创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
}

// ─── Spec 加载器接口 ──────────────────────────────────────────────────────────

/**
 * ProjectSpec 加载器接口
 * 可以从文件系统、内存、远程等不同来源加载
 */
export interface ProjectSpecLoader {
  load(): Promise<ProjectSpec | null>;
}

/**
 * ChangeSpec 存储接口
 * 可以持久化到文件系统或保持内存态
 */
export interface ChangeSpecStore {
  save(spec: ChangeSpec): Promise<void>;
  load(id: string): Promise<ChangeSpec | null>;
  list(): Promise<ChangeSpec[]>;
  archive(id: string): Promise<void>;
}
