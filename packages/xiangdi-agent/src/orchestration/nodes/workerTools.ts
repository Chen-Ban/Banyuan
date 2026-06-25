/**
 * Worker SubAgent 工具定义
 *
 * ADR-041: Worker SubAgent 的工具集分三层：
 *   Layer 1（共享只读）：read_pages, knowledge_search, material_search, material_get_detail
 *   Layer 2（前端专属）：write_page, create_page, delete_page
 *   Layer 3（后端专属）：read_schema, read_cloud_functions, write_schema, write_cloud_function, delete_cloud_function
 *
 * 工具白名单（前端 Worker）：
 *   knowledge_search, read_pages, write_page, create_page, delete_page, material_search, material_get_detail
 *
 * 工具白名单（后端 Worker）：
 *   knowledge_search, read_schema, read_cloud_functions, write_schema, write_cloud_function, delete_cloud_function
 *
 * 工具设计原则：
 *   - write_page 是整页粒度（patch 语义，只写当前页）
 *   - write_cloud_function 是纯写入（Worker 自身在 think 阶段生成 FlowSchema，工具不调 LLM）
 *   - 所有工具返回 string 结果（成功/失败信息），由 LLM 解读
 */
import type { ToolDefinition, ToolHandler } from '../../core/types.js'
import { ToolRegistry } from '../../core/ToolRegistry.js'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工具定义
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── Layer 1: 共享只读工具 ───────────────────────────────────────────────────

export const KNOWLEDGE_SEARCH_DEF: ToolDefinition = {
  name: 'knowledge_search',
  description:
    '检索 BanvasGL 能力体系知识。输入关键词或问题，返回最相关的知识片段（ViewType 用法、属性规范、组合模式等）。',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '检索查询（如"如何创建列表视图"、"CombinedView layoutMode"）' },
      topK: { type: 'number', description: '返回结果数量，默认 5' },
    },
    required: ['query'],
  },
}

export const READ_PAGES_DEF: ToolDefinition = {
  name: 'read_pages',
  description:
    '读取应用的当前页面数据。可指定页面 ID 读取单个页面，不指定则返回所有页面的摘要列表。返回 AIProjectionScene 格式的完整视图结构。',
  input_schema: {
    type: 'object',
    properties: {
      pageId: { type: 'string', description: '可选，指定读取的页面 ID。不填则返回所有页面的 id+name 列表' },
    },
  },
}

export const MATERIAL_SEARCH_DEF: ToolDefinition = {
  name: 'material_search',
  description: '搜索可用的物料组件。输入关键词，返回匹配的物料列表（名称、分类、简介）。',
  input_schema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词（如"按钮"、"表格"、"图表"）' },
      category: { type: 'string', description: '可选，物料分类过滤（如"basic"、"form"、"chart"）' },
    },
    required: ['keyword'],
  },
}

export const MATERIAL_GET_DETAIL_DEF: ToolDefinition = {
  name: 'material_get_detail',
  description:
    '获取物料的详细信息，包含完整的属性定义、使用示例、默认配置。用于在 write_page 前了解组件的完整 schema。',
  input_schema: {
    type: 'object',
    properties: {
      materialId: { type: 'string', description: '物料 ID（从 material_search 结果中获取）' },
    },
    required: ['materialId'],
  },
}

// ─── Layer 2: 前端 Worker 专属写入工具 ───────────────────────────────────────

export const WRITE_PAGE_DEF: ToolDefinition = {
  name: 'write_page',
  description:
    '写入一个页面的完整视图结构。使用 AIProjectionScene 格式，整页覆盖（patch 语义：只影响指定 pageId，不覆盖其他页面）。页面必须已存在（通过 create_page 创建）。',
  input_schema: {
    type: 'object',
    properties: {
      pageId: { type: 'string', description: '目标页面 ID' },
      scene: {
        type: 'object',
        description: 'AIProjectionScene 完整结构（含 id, name, nodes[]）',
      },
    },
    required: ['pageId', 'scene'],
  },
}

export const CREATE_PAGE_DEF: ToolDefinition = {
  name: 'create_page',
  description: '创建一个新页面。返回新页面的 ID。创建后使用 write_page 写入视图结构。',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '页面名称' },
      pageId: { type: 'string', description: '可选，指定页面 ID（不填则自动生成 UUID）' },
    },
    required: ['name'],
  },
}

export const DELETE_PAGE_DEF: ToolDefinition = {
  name: 'delete_page',
  description: '删除一个已有页面。',
  input_schema: {
    type: 'object',
    properties: {
      pageId: { type: 'string', description: '要删除的页面 ID' },
    },
    required: ['pageId'],
  },
}

// ─── Layer 3: 后端 Worker 专属工具 ───────────────────────────────────────────

export const READ_SCHEMA_DEF: ToolDefinition = {
  name: 'read_schema',
  description: '读取应用当前的数据模型定义（所有 Collection 的字段列表、索引等）。',
  input_schema: {
    type: 'object',
    properties: {},
  },
}

export const READ_CLOUD_FUNCTIONS_DEF: ToolDefinition = {
  name: 'read_cloud_functions',
  description: '读取应用当前已有的云函数列表（ID、名称、描述、FlowSchema 摘要）。',
  input_schema: {
    type: 'object',
    properties: {
      functionId: {
        type: 'string',
        description: '可选，指定读取某个云函数的完整 FlowSchema。不填返回列表概览',
      },
    },
  },
}

export const WRITE_SCHEMA_DEF: ToolDefinition = {
  name: 'write_schema',
  description:
    '写入数据模型定义（全量替换所有 Collection）。Worker 在 think 阶段生成完整 schema，通过此工具一次性写入。',
  input_schema: {
    type: 'object',
    properties: {
      collections: {
        type: 'array',
        description: 'CollectionDefinition[] 完整定义',
      },
    },
    required: ['collections'],
  },
}

export const WRITE_CLOUD_FUNCTION_DEF: ToolDefinition = {
  name: 'write_cloud_function',
  description:
    '创建或更新一个云函数。Worker 在 think 阶段生成完整的服务端 FlowSchema，通过此工具写入。纯写入，工具内部不调用 LLM。',
  input_schema: {
    type: 'object',
    properties: {
      functionId: { type: 'string', description: '函数 ID（与契约中预分配的 UUID 一致）' },
      name: { type: 'string', description: '函数名（唯一标识）' },
      displayName: { type: 'string', description: '中文显示名' },
      description: { type: 'string', description: '功能描述' },
      flowSchema: { type: 'object', description: '服务端 FlowSchema（节点图，含 nodes[] + edges[]）' },
    },
    required: ['functionId', 'name', 'displayName', 'description', 'flowSchema'],
  },
}

export const DELETE_CLOUD_FUNCTION_DEF: ToolDefinition = {
  name: 'delete_cloud_function',
  description: '删除一个已有的云函数。',
  input_schema: {
    type: 'object',
    properties: {
      functionId: { type: 'string', description: '要删除的函数 ID' },
    },
    required: ['functionId'],
  },
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 工具处理器接口（由外部注入具体实现）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 前端 Worker 工具处理器集合
 *
 * 由 xiangdi-server 注入具体实现（HTTP 调用 banyan 后端、knowledge-server 等）。
 * 工厂函数只关心接口，不关心底层通信方式。
 */
export interface FrontendToolHandlers {
  knowledgeSearch: ToolHandler<{ query: string; topK?: number }, string>
  readPages: ToolHandler<{ pageId?: string }, string>
  writePage: ToolHandler<{ pageId: string; scene: Record<string, unknown> }, string>
  createPage: ToolHandler<{ name: string; pageId?: string }, string>
  deletePage: ToolHandler<{ pageId: string }, string>
  materialSearch: ToolHandler<{ keyword: string; category?: string }, string>
  materialGetDetail: ToolHandler<{ materialId: string }, string>
}

/**
 * 后端 Worker 工具处理器集合
 */
export interface BackendToolHandlers {
  knowledgeSearch: ToolHandler<{ query: string; topK?: number }, string>
  readSchema: ToolHandler<Record<string, unknown>, string>
  readCloudFunctions: ToolHandler<{ functionId?: string }, string>
  writeSchema: ToolHandler<{ collections: unknown[] }, string>
  writeCloudFunction: ToolHandler<
    {
      functionId: string
      name: string
      displayName: string
      description: string
      flowSchema: Record<string, unknown>
    },
    string
  >
  deleteCloudFunction: ToolHandler<{ functionId: string }, string>
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ToolRegistry 工厂
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 创建前端 Worker 的 ToolRegistry（7 个工具）
 */
export function createFrontendToolRegistry(handlers: FrontendToolHandlers): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(KNOWLEDGE_SEARCH_DEF, handlers.knowledgeSearch as ToolHandler)
  registry.register(READ_PAGES_DEF, handlers.readPages as ToolHandler)
  registry.register(WRITE_PAGE_DEF, handlers.writePage as ToolHandler)
  registry.register(CREATE_PAGE_DEF, handlers.createPage as ToolHandler)
  registry.register(DELETE_PAGE_DEF, handlers.deletePage as ToolHandler)
  registry.register(MATERIAL_SEARCH_DEF, handlers.materialSearch as ToolHandler)
  registry.register(MATERIAL_GET_DETAIL_DEF, handlers.materialGetDetail as ToolHandler)
  return registry
}

/**
 * 创建后端 Worker 的 ToolRegistry（6 个工具）
 */
export function createBackendToolRegistry(handlers: BackendToolHandlers): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(KNOWLEDGE_SEARCH_DEF, handlers.knowledgeSearch as ToolHandler)
  registry.register(READ_SCHEMA_DEF, handlers.readSchema as ToolHandler)
  registry.register(READ_CLOUD_FUNCTIONS_DEF, handlers.readCloudFunctions as ToolHandler)
  registry.register(WRITE_SCHEMA_DEF, handlers.writeSchema as ToolHandler)
  registry.register(WRITE_CLOUD_FUNCTION_DEF, handlers.writeCloudFunction as ToolHandler)
  registry.register(DELETE_CLOUD_FUNCTION_DEF, handlers.deleteCloudFunction as ToolHandler)
  return registry
}
