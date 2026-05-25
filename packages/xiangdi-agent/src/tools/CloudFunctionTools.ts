/**
 * 相地 · 云函数工具集
 *
 * 提供 AI 驱动的云函数生成、修改、解释能力。
 * 云函数本质是 FlowSchema（节点图），而非代码字符串。
 *
 * 工具列表：
 *   - generate_cloud_function：根据描述 + AppSchema 生成完整 FlowSchema
 *   - update_cloud_function：修改已有云函数的 FlowSchema
 *   - explain_cloud_function：解释云函数的节点图逻辑
 *
 * 设计原则：
 *   - 输出为 FlowSchema JSON（{ nodes: FlowNode[], edges: FlowEdge[] }），
 *     与 banvas-flow 的 FlowRunnerService 直接兼容
 *   - handler 内部构造 prompt 调用 LLMClient 生成 FlowSchema
 *   - AppSchema 注入 prompt，帮助 AI 理解可操作的数据集合和字段
 *
 * FlowSchema 后端节点类型（ServerFlowNode）：
 *   dbQuery    — 数据库查询，输出到 outputVariable
 *   dbInsert   — 数据库插入，输出 insertedId 到 outputVariable
 *   dbUpdate   — 数据库更新，输出 modifiedCount 到 outputVariable
 *   dbDelete   — 数据库删除，输出 deletedCount 到 outputVariable
 *   httpRequest — HTTP 请求，输出 response 到 outputVariable
 *   transform  — 表达式转换（安全子集），输出到 outputVariable
 *   script     — 自定义脚本（vm 沙箱），支持 inputBindings / outputBindings
 *
 * 共享节点类型（SharedFlowNode）：
 *   condition  — 条件分支，边上用 branch: 'true'|'false' 区分
 *   setVariable — 设置变量（scope: 'local'|'flow'）
 *   callFlow   — 调用另一个 FlowSchema（flowId）
 *   delay      — 延迟等待（ms）
 *
 * FlowValue 值来源：
 *   { kind: 'literal', value: ... }           — 字面量
 *   { kind: 'dataRef', viewId: 'local', key } — 引用 local scope 变量
 *   { kind: 'dataRef', viewId: 'flow', key }  — 引用 flow scope 变量
 */

import type { ToolDefinition, ToolHandler } from "../core/types.js";
import type { LLMClient } from "../core/llmTypes.js";
import { ToolRegistry } from "../core/ToolRegistry.js";

// ─── AppSchema 类型（与 ProjectSpec 中的 appSchema 对齐）────────────────────────

export interface AppSchemaFieldDef {
  name: string;
  displayName: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  refCollection?: string;
  enumValues?: string[];
}

export interface AppSchemaCollectionDef {
  collectionName: string;
  fields: AppSchemaFieldDef[];
}

// ─── FlowSchema 类型（与 banvas-flow 对齐）──────────────────────────────────

export interface FlowLiteralValue {
  kind: "literal";
  value: string | number | boolean | null | object;
}

export interface FlowDataRefValue {
  kind: "dataRef";
  viewId: string; // 后端: 'local' | 'flow'
  key: string;
}

export type FlowValue = FlowLiteralValue | FlowDataRefValue | { kind: string; [k: string]: unknown };

export interface FlowEdge {
  from: string;
  to: string;
  branch?: "true" | "false";
  toParam?: string;
}

export interface FlowNode {
  id: string;
  kind: string;
  [key: string]: unknown;
}

export interface FlowSchema {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ─── generate_cloud_function ────────────────────────────────────────────────────

export interface GenerateCloudFunctionInput {
  /** 函数功能描述（自然语言） */
  description: string;
  /** 应用的数据模型定义，帮助 AI 理解可操作的数据结构 */
  appSchema: AppSchemaCollectionDef[];
}

export interface GenerateCloudFunctionOutput {
  /** 生成的函数名称（camelCase） */
  name: string;
  /** 生成的函数中文显示名 */
  displayName: string;
  /** 函数功能说明 */
  description: string;
  /** 生成的 FlowSchema（节点图） */
  schema: FlowSchema;
}

export const GENERATE_CLOUD_FUNCTION_TOOL_NAME = "generate_cloud_function" as const;

export const GENERATE_CLOUD_FUNCTION_TOOL_DEFINITION: ToolDefinition = {
  name: GENERATE_CLOUD_FUNCTION_TOOL_NAME,
  description:
    "根据自然语言描述和应用数据模型（AppSchema）生成完整的云函数 FlowSchema（节点图）。" +
    "生成结果为可直接被 FlowRunnerService 执行的 { nodes, edges } 结构。" +
    "示例：'查询所有未完成的订单并按创建时间排序'",
  input_schema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description:
          "函数功能的自然语言描述。应清晰说明函数要做什么、" +
          "操作哪些数据、返回什么结果。",
      },
      appSchema: {
        type: "array",
        description:
          "应用的数据模型定义数组，每个元素包含 collectionName 和 fields。",
        items: {
          type: "object",
          properties: {
            collectionName: { type: "string" },
            fields: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  displayName: { type: "string" },
                  type: { type: "string" },
                  required: { type: "boolean" },
                },
              },
            },
          },
        },
      },
    },
    required: ["description", "appSchema"],
  },
};

// ─── update_cloud_function ──────────────────────────────────────────────────────

export interface UpdateCloudFunctionInput {
  /** 函数名称 */
  name: string;
  /** 修改描述（自然语言，说明要改什么） */
  description: string;
  /** 当前 FlowSchema（节点图） */
  currentSchema: FlowSchema;
  /** 应用的数据模型定义 */
  appSchema: AppSchemaCollectionDef[];
}

export interface UpdateCloudFunctionOutput {
  /** 修改后的完整 FlowSchema */
  schema: FlowSchema;
  /** 修改说明 */
  changelog: string;
}

export const UPDATE_CLOUD_FUNCTION_TOOL_NAME = "update_cloud_function" as const;

export const UPDATE_CLOUD_FUNCTION_TOOL_DEFINITION: ToolDefinition = {
  name: UPDATE_CLOUD_FUNCTION_TOOL_NAME,
  description:
    "修改已有的云函数 FlowSchema。根据修改描述和当前节点图，生成更新后的完整 FlowSchema。" +
    "可用于添加新节点、修改查询条件、调整数据流向等。" +
    "示例：'给查询结果添加分页支持，每页 20 条'",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "要修改的函数名称",
      },
      description: {
        type: "string",
        description: "修改需求的自然语言描述，说明要改什么、为什么改。",
      },
      currentSchema: {
        type: "object",
        description: "当前的 FlowSchema（{ nodes: [], edges: [] }）",
        properties: {
          nodes: { type: "array" },
          edges: { type: "array" },
        },
      },
      appSchema: {
        type: "array",
        description: "应用的数据模型定义数组",
        items: {
          type: "object",
          properties: {
            collectionName: { type: "string" },
            fields: { type: "array" },
          },
        },
      },
    },
    required: ["name", "description", "currentSchema", "appSchema"],
  },
};

// ─── explain_cloud_function ─────────────────────────────────────────────────────

export interface ExplainCloudFunctionInput {
  /** 函数名称 */
  name: string;
  /** 函数的 FlowSchema（节点图） */
  schema: FlowSchema;
}

export interface ExplainCloudFunctionOutput {
  /** 函数功能的自然语言解释 */
  explanation: string;
  /** 函数的输入参数说明 */
  inputDescription: string;
  /** 函数的输出结果说明 */
  outputDescription: string;
  /** 关键逻辑步骤 */
  steps: string[];
}

export const EXPLAIN_CLOUD_FUNCTION_TOOL_NAME = "explain_cloud_function" as const;

export const EXPLAIN_CLOUD_FUNCTION_TOOL_DEFINITION: ToolDefinition = {
  name: EXPLAIN_CLOUD_FUNCTION_TOOL_NAME,
  description:
    "解释一个云函数的 FlowSchema 节点图逻辑。分析节点和边的结构，返回自然语言解释，" +
    "包括函数功能、输入输出说明、关键逻辑步骤。",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "函数名称",
      },
      schema: {
        type: "object",
        description: "要解释的 FlowSchema（{ nodes: [], edges: [] }）",
        properties: {
          nodes: { type: "array" },
          edges: { type: "array" },
        },
      },
    },
    required: ["name", "schema"],
  },
};

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function formatAppSchemaForPrompt(appSchema: AppSchemaCollectionDef[]): string {
  if (appSchema.length === 0) return "（无数据模型定义）";
  return appSchema
    .map((col) => {
      const fieldsStr = col.fields
        .map(
          (f) =>
            `  - ${f.name} (${f.type}${f.required ? ", 必填" : ""})${f.displayName ? ` // ${f.displayName}` : ""}`
        )
        .join("\n");
      return `Collection: ${col.collectionName}\n${fieldsStr}`;
    })
    .join("\n\n");
}

function extractJsonFromResponse(text: string): Record<string, unknown> | null {
  const jsonBlockMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) {
    try { return JSON.parse(jsonBlockMatch[1]) as Record<string, unknown>; } catch { /* continue */ }
  }
  try { return JSON.parse(text) as Record<string, unknown>; } catch { /* continue */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; } catch { /* continue */ }
  }
  return null;
}

const FLOW_SCHEMA_SYSTEM_PROMPT = `你是一个 FlowSchema 节点图生成专家。根据用户描述和数据模型，生成可被后端 FlowRunner 直接执行的 FlowSchema JSON。

## FlowSchema 结构
\`\`\`
{
  "nodes": [ FlowNode[] ],
  "edges": [ FlowEdge[] ]
}
\`\`\`

## 节点类型（后端 ServerFlowNode）

### dbQuery — 数据库查询
\`\`\`json
{
  "id": "node_1",
  "kind": "dbQuery",
  "collection": "orders",
  "filter": { "status": { "kind": "literal", "value": "pending" } },
  "sort": { "createdAt": -1 },
  "limit": 20,
  "outputVariable": "orders"
}
\`\`\`

### dbInsert — 数据库插入
\`\`\`json
{
  "id": "node_2",
  "kind": "dbInsert",
  "collection": "orders",
  "document": {
    "title": { "kind": "dataRef", "viewId": "local", "key": "title" },
    "status": { "kind": "literal", "value": "pending" }
  },
  "outputVariable": "insertedId"
}
\`\`\`

### dbUpdate — 数据库更新
\`\`\`json
{
  "id": "node_3",
  "kind": "dbUpdate",
  "collection": "orders",
  "filter": { "_id": { "kind": "dataRef", "viewId": "local", "key": "orderId" } },
  "update": { "status": { "kind": "literal", "value": "done" } },
  "outputVariable": "modifiedCount"
}
\`\`\`

### dbDelete — 数据库删除
\`\`\`json
{
  "id": "node_4",
  "kind": "dbDelete",
  "collection": "orders",
  "filter": { "_id": { "kind": "dataRef", "viewId": "local", "key": "orderId" } },
  "outputVariable": "deletedCount"
}
\`\`\`

### httpRequest — HTTP 请求
\`\`\`json
{
  "id": "node_5",
  "kind": "httpRequest",
  "url": { "kind": "literal", "value": "https://api.example.com/data" },
  "method": "GET",
  "outputVariable": "response"
}
\`\`\`

### transform — 表达式转换
\`\`\`json
{
  "id": "node_6",
  "kind": "transform",
  "expression": "items.length",
  "variables": { "items": { "kind": "dataRef", "viewId": "local", "key": "orders" } },
  "outputVariable": "count"
}
\`\`\`

### setVariable — 设置变量（共享节点）
\`\`\`json
{
  "id": "node_7",
  "kind": "setVariable",
  "scope": "local",
  "key": "result",
  "value": { "kind": "dataRef", "viewId": "local", "key": "orders" }
}
\`\`\`

### condition — 条件分支（共享节点）
\`\`\`json
{
  "id": "node_8",
  "kind": "condition",
  "condition": {
    "left": { "kind": "dataRef", "viewId": "local", "key": "count" },
    "op": ">",
    "right": { "kind": "literal", "value": 0 }
  }
}
\`\`\`
条件节点的出边需要 branch: "true" 或 "false"。

## FlowValue 值来源
- 字面量：\`{ "kind": "literal", "value": 123 }\`
- 引用 local 变量：\`{ "kind": "dataRef", "viewId": "local", "key": "varName" }\`
- 引用 flow 变量：\`{ "kind": "dataRef", "viewId": "flow", "key": "varName" }\`

## FlowEdge 结构
\`\`\`json
{ "from": "node_1", "to": "node_2" }
{ "from": "node_8", "to": "node_9", "branch": "true" }
\`\`\`

## 约定
- 函数的输入参数通过 local scope 变量传入（调用方写入 local scope）
- 函数的输出结果写入 local scope 的 "result" 变量（FlowRunnerService 读取 local scope 作为结果）
- 节点 id 使用 "node_1", "node_2" 等简单格式
- 所有节点必须通过 edges 连接，形成有向无环图（DAG）`;

// ─── Handler 工厂 ─────────────────────────────────────────────────────────────

export function createGenerateCloudFunctionHandler(
  llmClient: LLMClient,
  model: string
): ToolHandler<GenerateCloudFunctionInput, GenerateCloudFunctionOutput> {
  return async (input: GenerateCloudFunctionInput): Promise<GenerateCloudFunctionOutput> => {
    const schemaText = formatAppSchemaForPrompt(input.appSchema);

    const systemPrompt = `${FLOW_SCHEMA_SYSTEM_PROMPT}

## 应用数据模型
${schemaText}

请严格按以下 JSON 格式返回（不要包含其他内容）：
{
  "name": "函数名（camelCase）",
  "displayName": "函数中文显示名",
  "description": "函数功能一句话说明",
  "schema": {
    "nodes": [ ...FlowNode[] ],
    "edges": [ ...FlowEdge[] ]
  }
}`;

    const response = await llmClient.createMessage({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: [{ type: "text", text: input.description }] }],
      temperature: 0.3,
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("LLM 未返回文本内容");
    }

    const parsed = extractJsonFromResponse(textContent.text);
    if (!parsed) throw new Error("无法解析 LLM 返回的 JSON 结果");

    const schema = parsed["schema"] as FlowSchema | undefined;
    if (!schema || !Array.isArray(schema.nodes) || !Array.isArray(schema.edges)) {
      throw new Error("LLM 返回的 FlowSchema 格式不合法，缺少 nodes 或 edges");
    }

    return {
      name: String(parsed["name"] ?? "untitled"),
      displayName: String(parsed["displayName"] ?? input.description.slice(0, 20)),
      description: String(parsed["description"] ?? input.description),
      schema,
    };
  };
}

export function createUpdateCloudFunctionHandler(
  llmClient: LLMClient,
  model: string
): ToolHandler<UpdateCloudFunctionInput, UpdateCloudFunctionOutput> {
  return async (input: UpdateCloudFunctionInput): Promise<UpdateCloudFunctionOutput> => {
    const schemaText = formatAppSchemaForPrompt(input.appSchema);

    const systemPrompt = `${FLOW_SCHEMA_SYSTEM_PROMPT}

## 应用数据模型
${schemaText}

## 当前函数名
${input.name}

## 当前 FlowSchema
\`\`\`json
${JSON.stringify(input.currentSchema, null, 2)}
\`\`\`

请严格按以下 JSON 格式返回（不要包含其他内容）：
{
  "schema": {
    "nodes": [ ...FlowNode[] ],
    "edges": [ ...FlowEdge[] ]
  },
  "changelog": "本次修改的说明"
}`;

    const response = await llmClient.createMessage({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: [{ type: "text", text: input.description }] }],
      temperature: 0.3,
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("LLM 未返回文本内容");
    }

    const parsed = extractJsonFromResponse(textContent.text);
    if (!parsed) throw new Error("无法解析 LLM 返回的 JSON 结果");

    const schema = parsed["schema"] as FlowSchema | undefined;
    if (!schema || !Array.isArray(schema.nodes) || !Array.isArray(schema.edges)) {
      throw new Error("LLM 返回的 FlowSchema 格式不合法，缺少 nodes 或 edges");
    }

    return {
      schema,
      changelog: String(parsed["changelog"] ?? "FlowSchema 已更新"),
    };
  };
}

export function createExplainCloudFunctionHandler(
  llmClient: LLMClient,
  model: string
): ToolHandler<ExplainCloudFunctionInput, ExplainCloudFunctionOutput> {
  return async (input: ExplainCloudFunctionInput): Promise<ExplainCloudFunctionOutput> => {
    const systemPrompt = `你是一个 FlowSchema 分析专家。分析给定的云函数节点图，返回结构化的自然语言解释。

请严格按以下 JSON 格式返回（不要包含其他内容）：
{
  "explanation": "函数功能的一段话解释",
  "inputDescription": "函数需要的输入参数说明（来自 local scope 的变量）",
  "outputDescription": "函数返回结果的说明（local scope 的 result 变量）",
  "steps": ["步骤1说明", "步骤2说明", ...]
}`;

    const response = await llmClient.createMessage({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `函数名：${input.name}\n\nFlowSchema：\n\`\`\`json\n${JSON.stringify(input.schema, null, 2)}\n\`\`\``,
            },
          ],
        },
      ],
      temperature: 0.2,
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("LLM 未返回文本内容");
    }

    const parsed = extractJsonFromResponse(textContent.text);
    if (!parsed) throw new Error("无法解析 LLM 返回的 JSON 结果");

    return {
      explanation: String(parsed["explanation"] ?? ""),
      inputDescription: String(parsed["inputDescription"] ?? ""),
      outputDescription: String(parsed["outputDescription"] ?? ""),
      steps: Array.isArray(parsed["steps"])
        ? (parsed["steps"] as unknown[]).map(String)
        : [],
    };
  };
}

// ─── 便捷注册函数 ─────────────────────────────────────────────────────────────

export interface CloudFunctionToolsConfig {
  llmClient: LLMClient;
  model: string;
}

/**
 * 将所有云函数工具注册到 ToolRegistry
 */
export function registerCloudFunctionTools(
  registry: ToolRegistry,
  config: CloudFunctionToolsConfig
): void {
  const { llmClient, model } = config;

  registry.register(
    GENERATE_CLOUD_FUNCTION_TOOL_DEFINITION,
    createGenerateCloudFunctionHandler(llmClient, model) as unknown as ToolHandler
  );

  registry.register(
    UPDATE_CLOUD_FUNCTION_TOOL_DEFINITION,
    createUpdateCloudFunctionHandler(llmClient, model) as unknown as ToolHandler
  );

  registry.register(
    EXPLAIN_CLOUD_FUNCTION_TOOL_DEFINITION,
    createExplainCloudFunctionHandler(llmClient, model) as unknown as ToolHandler
  );
}
