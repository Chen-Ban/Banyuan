/**
 * 相地 · 编排层类型定义
 *
 * 如同园林营造中「主景、配景、借景」的分工协作，
 * 编排层将单页面生成拆解为多个 SubAgent 并行工作，
 * 最终由主 Agent 统筹组装。
 *
 * 核心概念：
 * - SubAgentTask：分配给子 Agent 的独立容器生成任务
 * - Port：子 Agent 对外暴露的强类型接口（数据端口 + 事件端口）
 * - SubAgentResult：子 Agent 的产出（节点 + 端口 + 流程片段）
 * - AssemblyPlan：主 Agent 的组装计划（定位 + 布线）
 * - AuditResult：审计 Agent 的验证结论
 */

import type { AINode, AIPage } from "../schema/AISchema.js";

// ─── Port 系统（强类型 + 事件描述混合）───────────────────────────────────────

/**
 * 数据端口方向
 * - in: 容器需要从外部接收的数据
 * - out: 容器向外部暴露的数据
 */
export type PortDirection = "in" | "out";

/**
 * 端口数据类型（强类型约束）
 */
export type PortDataType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "image_url"
  | "color"
  | "date"
  | "enum";

/**
 * 数据端口定义
 *
 * SubAgent 声明容器需要/暴露的数据接口，
 * 主 Agent 通过数据端口进行跨容器数据绑定。
 */
export interface DataPort {
  /** 端口唯一标识（容器内唯一） */
  id: string;
  /** 可读名称 */
  name: string;
  /** 方向：输入 or 输出 */
  direction: PortDirection;
  /** 数据类型 */
  dataType: PortDataType;
  /** 类型为 enum 时的可选值 */
  enumValues?: string[];
  /** 类型为 object 时的 schema 描述 */
  objectSchema?: Record<string, PortDataType>;
  /** 是否必须绑定（in 端口） */
  required?: boolean;
  /** 默认值（in 端口，当未绑定时使用） */
  defaultValue?: unknown;
  /** 端口描述（帮助主 Agent 理解语义） */
  description: string;
}

/**
 * 事件端口定义
 *
 * SubAgent 声明容器触发/监听的事件，
 * 主 Agent 通过事件端口进行跨容器交互绑定。
 */
export interface EventPort {
  /** 事件唯一标识（容器内唯一） */
  id: string;
  /** 可读名称 */
  name: string;
  /** 方向：emit（触发）or listen（监听） */
  direction: "emit" | "listen";
  /** 事件携带的 payload 描述 */
  payload?: Record<string, PortDataType>;
  /** 事件触发时机的自然语言描述 */
  description: string;
}

/**
 * 容器端口集合
 */
export interface ContainerPorts {
  data: DataPort[];
  events: EventPort[];
}

// ─── SubAgent 任务与结果 ─────────────────────────────────────────────────────

/**
 * 容器类型提示
 *
 * 帮助 LayoutPlanner 拆解时为每个容器标注类型，
 * SubAgent 据此选择不同的生成策略。
 */
export type ContainerRole =
  | "header"       // 顶部导航/标题栏
  | "footer"       // 底部导航/操作栏
  | "list"         // 列表/卡片流
  | "form"         // 表单输入区
  | "detail"       // 详情展示区
  | "chart"        // 图表/数据可视化
  | "media"        // 图片/视频区
  | "sidebar"      // 侧边栏
  | "modal"        // 弹窗/抽屉
  | "custom";      // 自定义

/**
 * SubAgent 任务定义
 *
 * 由 LayoutPlanner 生成，描述一个子容器的生成需求。
 */
export interface SubAgentTask {
  /** 任务唯一 ID */
  taskId: string;
  /** 容器角色 */
  role: ContainerRole;
  /** 容器自然语言描述（来自用户需求拆解） */
  description: string;
  /** 分配的尺寸（本地参考系） */
  size: { width: number; height: number };
  /** 需要遵守的设计约束 */
  constraints?: SubAgentConstraints;
  /** 上下文信息：页面整体描述、相邻容器信息 */
  context: SubAgentContext;
}

/**
 * SubAgent 设计约束
 */
export interface SubAgentConstraints {
  /** 最大节点层级深度 */
  maxDepth?: number;
  /** 允许使用的节点类型 */
  allowedNodeTypes?: AINode["type"][];
  /** 配色方案约束 */
  colorPalette?: string[];
  /** 字体大小范围 */
  fontSizeRange?: { min: number; max: number };
  /** 间距规范 */
  spacing?: { unit: number; minPadding: number };
}

/**
 * SubAgent 上下文信息
 */
export interface SubAgentContext {
  /** 页面整体描述 */
  pageDescription: string;
  /** 页面尺寸 */
  pageSize: { width: number; height: number };
  /** 相邻容器的简要描述（帮助理解上下文） */
  neighbors?: Array<{
    role: ContainerRole;
    direction: "above" | "below" | "left" | "right";
    description: string;
  }>;
  /** 全局数据模型（可选，来自 ProjectSpec） */
  dataModel?: Record<string, unknown>;
}

/**
 * 流程节点片段
 *
 * SubAgent 生成的内部流程逻辑，描述容器内数据如何流转。
 * 使用自然语言 + 结构化描述混合，主 Agent 组装时翻译为 FlowSchema。
 */
export interface FlowFragment {
  /** 片段 ID */
  id: string;
  /** 触发条件描述 */
  trigger: string;
  /** 操作序列（自然语言） */
  actions: string[];
  /** 引用的数据端口 */
  referencedPorts: string[];
}

/**
 * SubAgent 生成结果
 */
export interface SubAgentResult {
  /** 对应的任务 ID */
  taskId: string;
  /** 生成状态 */
  status: "success" | "partial" | "failed";
  /** 生成的节点列表（本地坐标系，左上角为 0,0） */
  nodes: AINode[];
  /** 对外暴露的端口 */
  ports: ContainerPorts;
  /** 内部流程片段 */
  flowFragments: FlowFragment[];
  /** 数据使用声明：容器使用了哪些数据、如何使用 */
  dataUsage: DataUsageDeclaration[];
  /** 生成过程的诊断信息 */
  diagnostics?: string[];
  /** 失败原因（status != success 时） */
  error?: string;
}

/**
 * 数据使用声明
 *
 * SubAgent 声明容器中节点如何绑定数据端口，
 * 帮助主 Agent 理解数据流向。
 */
export interface DataUsageDeclaration {
  /** 引用的数据端口 ID */
  portId: string;
  /** 使用该数据的节点 ID */
  nodeId: string;
  /** 绑定方式 */
  binding: "text_content" | "visibility" | "style" | "src" | "items" | "custom";
  /** 绑定表达式（自然语言描述） */
  expression: string;
}

// ─── 组装计划 ────────────────────────────────────────────────────────────────

/**
 * 容器定位信息
 *
 * 主 Agent 决定每个容器在页面全局坐标系中的位置。
 */
export interface ContainerPlacement {
  /** 对应的任务 ID */
  taskId: string;
  /** 全局坐标系中的位置 */
  position: { x: number; y: number };
  /** 最终尺寸（可能微调） */
  size: { width: number; height: number };
  /** z-index 层级 */
  zIndex: number;
}

/**
 * 数据绑定连接
 *
 * 主 Agent 将不同容器的端口连接起来。
 */
export interface DataBinding {
  /** 唯一 ID */
  id: string;
  /** 源端口：{taskId}.{portId} */
  source: { taskId: string; portId: string };
  /** 目标端口：{taskId}.{portId} */
  target: { taskId: string; portId: string };
  /** 可选的数据转换描述 */
  transform?: string;
}

/**
 * 事件连接
 *
 * 主 Agent 将不同容器的事件端口连接起来。
 */
export interface EventWiring {
  /** 唯一 ID */
  id: string;
  /** 触发方：{taskId}.{eventId} */
  emitter: { taskId: string; eventId: string };
  /** 监听方：{taskId}.{eventId} */
  listener: { taskId: string; eventId: string };
  /** 事件发生时执行的动作描述 */
  action?: string;
}

/**
 * 组装计划
 *
 * 主 Agent 根据所有 SubAgent 结果制定的组装方案。
 */
export interface AssemblyPlan {
  /** 页面元信息 */
  page: {
    id: string;
    name: string;
    width: number;
    height: number;
    backgroundColor: string;
  };
  /** 各容器的定位 */
  placements: ContainerPlacement[];
  /** 数据绑定 */
  dataBindings: DataBinding[];
  /** 事件连线 */
  eventWirings: EventWiring[];
  /** 页面级数据源（从外部注入的数据） */
  pageDataSources?: Array<{
    id: string;
    name: string;
    type: PortDataType;
    description: string;
  }>;
}

// ─── 审计 ────────────────────────────────────────────────────────────────────

/**
 * 审计问题严重级别
 */
export type AuditSeverity = "error" | "warning" | "info";

/**
 * 审计发现的问题
 */
export interface AuditIssue {
  /** 问题严重级别 */
  severity: AuditSeverity;
  /** 问题所在的节点 ID（可选） */
  nodeId?: string;
  /** 问题所在的任务 ID（可选） */
  taskId?: string;
  /** 问题类别 */
  category: "layout" | "overflow" | "visibility" | "data_binding" | "event_wiring" | "style";
  /** 问题描述 */
  message: string;
  /** 建议的修复方案 */
  suggestion?: string;
}

/**
 * 审计请求
 */
export interface AuditRequest {
  /** 组装后的完整页面 */
  assembledPage: AIPage;
  /** 组装计划（用于验证绑定） */
  assemblyPlan: AssemblyPlan;
  /** SubAgent 原始结果（用于验证端口一致性） */
  subAgentResults: SubAgentResult[];
}

/**
 * 审计结果
 */
export interface AuditResult {
  /** 是否通过（无 error 级别问题） */
  passed: boolean;
  /** 发现的问题列表 */
  issues: AuditIssue[];
  /** 修复后的页面（如果审计 Agent 自动修复了问题） */
  fixedPage?: AIPage;
  /** 修复说明 */
  fixSummary?: string;
}

// ─── 编排配置 ────────────────────────────────────────────────────────────────

/**
 * 并行编排配置
 */
export interface OrchestrationConfig {
  /** SubAgent 最大并行数 */
  maxConcurrency: number;
  /** 单个 SubAgent 超时时间（ms） */
  subAgentTimeout: number;
  /** 是否启用审计 Agent */
  enableAudit: boolean;
  /** 审计失败时是否自动修复 */
  autoFix: boolean;
  /** 最大自动修复轮次 */
  maxFixRounds: number;
  /** SubAgent 使用的 LLM 配置（可与主 Agent 不同） */
  subAgentLLM?: {
    model: string;
    maxTokens?: number;
    temperature?: number;
  };
  /** 审计 Agent 使用的 LLM 配置 */
  auditorLLM?: {
    model: string;
    maxTokens?: number;
    temperature?: number;
  };
}

/**
 * 默认编排配置
 */
export const DEFAULT_ORCHESTRATION_CONFIG: OrchestrationConfig = {
  maxConcurrency: 4,
  subAgentTimeout: 60_000,
  enableAudit: true,
  autoFix: true,
  maxFixRounds: 2,
};

// ─── 编排事件（进度上报）─────────────────────────────────────────────────────

/**
 * 编排阶段
 */
export type OrchestrationPhase =
  | "planning"       // 布局规划中
  | "generating"     // SubAgent 并行生成中
  | "assembling"     // 主 Agent 组装中
  | "auditing"       // 审计验证中
  | "fixing"         // 自动修复中
  | "completed"      // 完成
  | "failed";        // 失败

/**
 * 编排进度事件
 */
export interface OrchestrationProgressEvent {
  /** 当前阶段 */
  phase: OrchestrationPhase;
  /** 总任务数 */
  totalTasks: number;
  /** 已完成任务数 */
  completedTasks: number;
  /** 当前阶段的详细信息 */
  detail?: string;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 编排最终结果
 */
export interface OrchestrationResult {
  /** 是否成功 */
  success: boolean;
  /** 生成的页面 */
  page?: AIPage;
  /** 组装计划 */
  assemblyPlan?: AssemblyPlan;
  /** 审计结果 */
  auditResult?: AuditResult;
  /** 各 SubAgent 的结果 */
  subAgentResults: SubAgentResult[];
  /** 编排耗时（ms） */
  durationMs: number;
  /** 错误信息（失败时） */
  error?: string;
}
