/**
 * 数据拉取工具集 — 注册到 ToolRegistry，供 AI Agent 按需获取应用数据
 *
 * 工具列表：
 *   - app_get_ui_definition：获取应用当前的 UI 定义 JSON（App 级别序列化字符串）
 *   - app_get_schema：获取应用数据库表结构定义
 *   - app_get_cloud_functions：获取应用所有云函数列表（摘要信息）
 *   - app_get_cloud_function_detail：获取单个云函数的完整 FlowSchema
 *
 * 架构说明：
 *   这些工具通过 BanyanClient 调用 banyan 后端的内部 API（/internal/apps/:appId/*），
 *   实现 Pull-based 的数据获取模式。AI 根据任务需要调用对应工具，
 *   而非一次性在请求体中接收所有数据。这样：
 *   1. 减小 XiangDi 请求体体积
 *   2. AI 可以选择性获取需要的信息（如只修改页面时不拉 schema）
 *   3. 支持未来扩展更多数据源
 */

import type { ToolRegistry, ToolDefinition } from '@banyuan/xiangdi-agent'
import type { BanyanClient } from './BanyanClient.js'

// ─── 工具定义 ─────────────────────────────────────────────────────────────────

const GET_APP_JSON_DEFINITION: ToolDefinition = {
  name: 'app_get_ui_definition',
  description:
    '获取当前应用的完整 UI 定义 JSON。包含应用生命周期和所有页面场景。在需要查看或修改应用内容前调用此工具。',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
}

const GET_SCHEMA_DEFINITION: ToolDefinition = {
  name: 'app_get_schema',
  description:
    '获取当前应用的数据库表结构定义（CollectionSchema）。返回所有集合及其字段信息。在需要了解数据模型、创建/修改数据表、或设计与数据相关的功能前调用此工具。',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
}

const GET_CLOUD_FUNCTIONS_DEFINITION: ToolDefinition = {
  name: 'app_get_cloud_functions',
  description:
    '获取当前应用的所有云函数列表（摘要信息：functionId、名称、描述）。不包含完整的 FlowSchema，如需查看某个云函数的详细编排逻辑，请使用 app_get_cloud_function_detail 工具。',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
}

const GET_CLOUD_FUNCTION_DETAIL_DEFINITION: ToolDefinition = {
  name: 'app_get_cloud_function_detail',
  description:
    '获取单个云函数的完整详情，包括 FlowSchema（nodes + edges 定义）。在需要理解或修改某个特定云函数的编排逻辑时调用。',
  input_schema: {
    type: 'object',
    properties: {
      functionId: {
        type: 'string',
        description: '要查询的云函数 ID（从 app_get_cloud_functions 工具结果中获取）',
      },
    },
    required: ['functionId'],
  },
}

// ─── 注册入口 ─────────────────────────────────────────────────────────────────

/**
 * 注册数据拉取工具到 ToolRegistry
 *
 * @param registry     工具注册表
 * @param banyanClient Banyan 后端 HTTP 客户端
 * @param appId        当前应用 ID（闭包捕获，工具执行时使用）
 */
export function registerDataFetchTools(
  registry: ToolRegistry,
  banyanClient: BanyanClient,
  appId: string,
): void {
  // app_get_ui_definition
  registry.register(GET_APP_JSON_DEFINITION, async () => {
    const uiJSON = await banyanClient.getUIDefinition(appId)
    return { uiJSON, hasData: !!uiJSON }
  })

  // app_get_schema
  registry.register(GET_SCHEMA_DEFINITION, async () => {
    const collections = await banyanClient.getSchema(appId)
    return { collections, count: collections.length }
  })

  // app_get_cloud_functions
  registry.register(GET_CLOUD_FUNCTIONS_DEFINITION, async () => {
    const functions = await banyanClient.getCloudFunctions(appId)
    // 返回摘要信息（不含 flowSchema），减少 token 消耗
    const summary = functions.map((f) => ({
      functionId: f.functionId,
      name: f.name,
      displayName: f.displayName,
      description: f.description,
      version: f.version,
    }))
    return { functions: summary, count: summary.length }
  })

  // app_get_cloud_function_detail
  registry.register(GET_CLOUD_FUNCTION_DETAIL_DEFINITION, async (input: { functionId: string }) => {
    const fn = await banyanClient.getCloudFunction(appId, input.functionId)
    if (!fn) {
      return { error: `云函数 ${input.functionId} 不存在` }
    }
    return { function: fn }
  })
}
