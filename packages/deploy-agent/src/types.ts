/**
 * Deploy Agent 共享类型定义
 */

/** Agent 配置 */
export interface AgentConfig {
  /** 认证 token */
  agentToken: string;
  /** 租户 ID */
  tenantId: string;
  /** 后端 WebSocket 地址 */
  backendWsUrl: string;
  /** 部署根目录 */
  deployRoot: string;
  /** nginx sites 目录 */
  nginxSitesDir: string;
}

/** WebSocket 消息类型 */
export type AgentMessageType =
  | 'deploy:start'
  | 'deploy:cancel'
  | 'heartbeat:ack'
  | 'auth:success'
  | 'auth:fail';

/** Agent 发送的消息类型 */
export type AgentOutMessageType =
  | 'auth'
  | 'heartbeat'
  | 'deploy:progress'
  | 'deploy:result';

/** 部署类型 */
export type DeployType = 'static' | 'fullstack';

// ─── 数据模型（与 banyan 后端 CollectionSchema / CloudFunction 对齐）────────────

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'ref' | 'array' | 'object';

export interface FieldDef {
  name: string;
  displayName: string;
  type: FieldType;
  required: boolean;
  defaultValue?: unknown;
  refCollection?: string;
  enumValues?: string[];
}

export interface CollectionDef {
  name: string;
  displayName: string;
  fields: FieldDef[];
}

export interface CloudFunctionDef {
  functionId: string;
  name: string;
  displayName: string;
  description: string;
  /** FlowSchema JSON（{ nodes: [], edges: [] }） */
  flowSchema: Record<string, unknown>;
}

/** WebSocket 接收的消息 */
export interface AgentMessage {
  type: AgentMessageType;
  payload?: unknown;
}

/** 认证消息 payload */
export interface AuthPayload {
  agentToken: string;
  tenantId: string;
}

/** 部署请求 */
export interface DeployRequest {
  /** 部署请求 ID */
  requestId: string;
  /** 应用 ID */
  appId: string;
  /** 应用 slug（用于 URL 路径） */
  appSlug: string;
  /** 部署类型 */
  deployType: DeployType;
  /** 租户域名 */
  tenantDomain: string;
  /** 应用 JSON 数据（pages、theme 等） */
  appJSON: AppJSON;
  /** 画布宽度 */
  width?: number;
  /** 画布高度 */
  height?: number;
  /** BanvasGL 版本 */
  canvasVersion?: string;
  /** 数据集合定义（fullstack 模式下） */
  collections?: CollectionDef[];
  /** 云函数定义（fullstack 模式下） */
  cloudFunctions?: CloudFunctionDef[];
  /** 容器端口（fullstack 模式下） */
  containerPort?: number;
}

/** 应用 JSON 结构 */
export interface AppJSON {
  /** 应用 ID */
  appId: string;
  /** 应用名称 */
  name: string;
  /** 页面列表 */
  pages: unknown[];
  /** 主题配置 */
  theme?: unknown;
  /** 全局数据 */
  globalData?: unknown;
  /** 数据集合定义 */
  collections?: unknown[];
}

/** 部署进度消息 */
export interface DeployProgress {
  /** 部署请求 ID */
  requestId: string;
  /** 当前步骤 */
  step: string;
  /** 进度百分比 0-100 */
  progress: number;
  /** 描述信息 */
  message: string;
}

/** 部署结果消息 */
export interface DeployResult {
  /** 部署请求 ID */
  requestId: string;
  /** 是否成功 */
  success: boolean;
  /** 访问 URL（成功时） */
  url?: string;
  /** 错误信息（失败时） */
  error?: string;
}
