/**
 * 相地 · 云函数工具集
 *
 * 提供 AI 驱动的云函数生成、修改、解释能力。
 *
 * 工具列表：
 *   - generate_cloud_function：根据描述 + AppSchema 生成完整函数代码
 *   - update_cloud_function：修改已有函数代码
 *   - explain_cloud_function：解释函数逻辑
 *
 * 设计原则：
 *   - 每个工具导出为独立的 ToolDefinition
 *   - handler 内部构造 prompt 调用 LLMClient 生成代码
 *   - 生成结果包含完整的函数代码 + inputSchema + outputSchema（JSON Schema 格式）
 */

import type { ToolDefinition, ToolHandler } from "../core/types.js";
import type { LLMClient } from "../core/AgentLoop.js";
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

// ─── generate_cloud_function ────────────────────────────────────────────────────

export interface GenerateCloudFunctionInput {
  /** 函数功能描述（自然语言） */
  description: string;
  /** 应用的数据模型定义，帮助 AI 理解可操作的数据结构 */
  appSchema: AppSchemaCollectionDef[];
}

export interface GenerateCloudFunctionOutput {
  /** 生成的函数名称 */
  name: string;
  /** 生成的完整函数代码 */
  code: string;
  /** 函数输入参数的 JSON Schema */
  inputSchema: Record<string, unknown>;
  /** 函数输出结果的 JSON Schema */
  outputSchema: Record<string, unknown>;
  /** 函数功能说明 */
  description: string;
}

export const GENERATE_CLOUD_FUNCTION_TOOL_NAME = "generate_cloud_function" as const;

export const GENERATE_CLOUD_FUNCTION_TOOL_DEFINITION: ToolDefinition = {
  name: GENERATE_CLOUD_FUNCTION_TOOL_NAME,
  description:
    "根据自然语言描述和应用数据模型（AppSchema）生成完整的云函数代码。" +
    "生成结果包含函数代码、输入参数 Schema 和输出结果 Schema。" +
    "云函数可访问 ctx.db 进行数据库操作，ctx.input 获取调用参数。" +
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
          "应用的数据模型定义数组，每个元素包含 collectionName 和 fields。" +
          "帮助理解可操作的数据结构。",
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
  /** 当前函数代码 */
  currentCode: string;
  /** 应用的数据模型定义 */
  appSchema: AppSchemaCollectionDef[];
}

export interface UpdateCloudFunctionOutput {
  /** 修改后的完整函数代码 */
  code: string;
  /** 修改说明 */
  changelog: string;
  /** 更新后的输入参数 JSON Schema */
  inputSchema: Record<string, unknown>;
  /** 更新后的输出结果 JSON Schema */
  outputSchema: Record<string, unknown>;
}

export const UPDATE_CLOUD_FUNCTION_TOOL_NAME = "update_cloud_function" as const;

export const UPDATE_CLOUD_FUNCTION_TOOL_DEFINITION: ToolDefinition = {
  name: UPDATE_CLOUD_FUNCTION_TOOL_NAME,
  description:
    "修改已有的云函数代码。根据修改描述和当前代码，生成更新后的完整代码。" +
    "可用于优化性能、修复 bug、添加新功能、重构代码等。" +
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
      currentCode: {
        type: "string",
        description: "当前的函数代码（完整代码）",
      },
      appSchema: {
        type: "array",
        description: "应用的数据模型定义数组",
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
    required: ["name", "description", "currentCode", "appSchema"],
  },
};

// ─── explain_cloud_function ─────────────────────────────────────────────────────

export interface ExplainCloudFunctionInput {
  /** 函数名称 */
  name: string;
  /** 函数代码 */
  code: string;
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
    "解释一个云函数的逻辑。分析代码并返回自然语言解释，" +
    "包括函数功能、输入输出说明、关键逻辑步骤。" +
    "适用于理解他人编写的函数或为函数生成文档。",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "函数名称",
      },
      code: {
        type: "string",
        description: "要解释的函数代码（完整代码）",
      },
    },
    required: ["name", "code"],
  },
};

// ─── Handler 工厂 ───────────────────────────────────────────────────────────────

/**
 * 将 AppSchema 格式化为 LLM 可读的文本
 */
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

/**
 * 从 LLM 响应中提取 JSON 块
 */
function extractJsonFromResponse(text: string): Record<string, unknown> | null {
  // 尝试匹配 ```json ... ``` 代码块
  const jsonBlockMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```/);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1]) as Record<string, unknown>;
    } catch {
      // 继续尝试其他方式
    }
  }

  // 尝试直接解析整个文本
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    // 尝试找到第一个 { 和最后一个 } 之间的内容
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * 创建 generate_cloud_function 工具的 handler
 *
 * @param llmClient LLM 客户端实例
 * @param model 使用的模型名称
 */
export function createGenerateCloudFunctionHandler(
  llmClient: LLMClient,
  model: string
): ToolHandler<GenerateCloudFunctionInput, GenerateCloudFunctionOutput> {
  return async (input: GenerateCloudFunctionInput): Promise<GenerateCloudFunctionOutput> => {
    const schemaText = formatAppSchemaForPrompt(input.appSchema);

    const systemPrompt = `你是一个云函数代码生成专家。根据用户描述和数据模型生成完整的云函数代码。

云函数运行环境：
- ctx.db — 数据库操作对象，支持 ctx.db.collection('collectionName') 获取集合
- ctx.db.collection(name).find(query) — 查询文档
- ctx.db.collection(name).findOne(query) — 查询单个文档
- ctx.db.collection(name).insertOne(doc) — 插入文档
- ctx.db.collection(name).updateOne(query, update) — 更新文档
- ctx.db.collection(name).deleteOne(query) — 删除文档
- ctx.input — 调用时传入的参数对象

应用数据模型：
${schemaText}

请严格按以下 JSON 格式返回（不要包含其他内容）：
{
  "name": "函数名（camelCase）",
  "code": "完整的函数代码字符串",
  "inputSchema": { JSON Schema 格式的输入参数定义 },
  "outputSchema": { JSON Schema 格式的输出结果定义 },
  "description": "函数功能一句话说明"
}`;

    const response = await llmClient.createMessage({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: input.description }],
        },
      ],
      temperature: 0.3,
    });

    // 从 LLM 响应中提取文本
    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("LLM 未返回文本内容");
    }

    const parsed = extractJsonFromResponse(textContent.text);
    if (!parsed) {
      throw new Error("无法解析 LLM 返回的 JSON 结果");
    }

    return {
      name: String(parsed["name"] ?? "untitled"),
      code: String(parsed["code"] ?? ""),
      inputSchema: (parsed["inputSchema"] as Record<string, unknown>) ?? { type: "object", properties: {} },
      outputSchema: (parsed["outputSchema"] as Record<string, unknown>) ?? { type: "object", properties: {} },
      description: String(parsed["description"] ?? input.description),
    };
  };
}

/**
 * 创建 update_cloud_function 工具的 handler
 *
 * @param llmClient LLM 客户端实例
 * @param model 使用的模型名称
 */
export function createUpdateCloudFunctionHandler(
  llmClient: LLMClient,
  model: string
): ToolHandler<UpdateCloudFunctionInput, UpdateCloudFunctionOutput> {
  return async (input: UpdateCloudFunctionInput): Promise<UpdateCloudFunctionOutput> => {
    const schemaText = formatAppSchemaForPrompt(input.appSchema);

    const systemPrompt = `你是一个云函数代码优化专家。根据修改需求，对已有函数代码进行修改。

云函数运行环境：
- ctx.db — 数据库操作对象，支持 ctx.db.collection('collectionName') 获取集合
- ctx.db.collection(name).find(query) — 查询文档
- ctx.db.collection(name).findOne(query) — 查询单个文档
- ctx.db.collection(name).insertOne(doc) — 插入文档
- ctx.db.collection(name).updateOne(query, update) — 更新文档
- ctx.db.collection(name).deleteOne(query) — 删除文档
- ctx.input — 调用时传入的参数对象

应用数据模型：
${schemaText}

当前函数名：${input.name}
当前代码：
\`\`\`javascript
${input.currentCode}
\`\`\`

请严格按以下 JSON 格式返回（不要包含其他内容）：
{
  "code": "修改后的完整函数代码字符串",
  "changelog": "本次修改的说明",
  "inputSchema": { JSON Schema 格式的输入参数定义 },
  "outputSchema": { JSON Schema 格式的输出结果定义 }
}`;

    const response = await llmClient.createMessage({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: input.description }],
        },
      ],
      temperature: 0.3,
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("LLM 未返回文本内容");
    }

    const parsed = extractJsonFromResponse(textContent.text);
    if (!parsed) {
      throw new Error("无法解析 LLM 返回的 JSON 结果");
    }

    return {
      code: String(parsed["code"] ?? input.currentCode),
      changelog: String(parsed["changelog"] ?? "代码已更新"),
      inputSchema: (parsed["inputSchema"] as Record<string, unknown>) ?? { type: "object", properties: {} },
      outputSchema: (parsed["outputSchema"] as Record<string, unknown>) ?? { type: "object", properties: {} },
    };
  };
}

/**
 * 创建 explain_cloud_function 工具的 handler
 *
 * @param llmClient LLM 客户端实例
 * @param model 使用的模型名称
 */
export function createExplainCloudFunctionHandler(
  llmClient: LLMClient,
  model: string
): ToolHandler<ExplainCloudFunctionInput, ExplainCloudFunctionOutput> {
  return async (input: ExplainCloudFunctionInput): Promise<ExplainCloudFunctionOutput> => {
    const systemPrompt = `你是一个代码分析专家。分析给定的云函数代码，返回结构化的解释。

云函数运行环境：
- ctx.db — 数据库操作对象
- ctx.input — 调用时传入的参数对象

请严格按以下 JSON 格式返回（不要包含其他内容）：
{
  "explanation": "函数功能的一段话解释",
  "inputDescription": "函数需要的输入参数说明",
  "outputDescription": "函数返回结果的说明",
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
              text: `函数名：${input.name}\n\n代码：\n\`\`\`javascript\n${input.code}\n\`\`\``,
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
    if (!parsed) {
      throw new Error("无法解析 LLM 返回的 JSON 结果");
    }

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
 *
 * @example
 * ```ts
 * const registry = new ToolRegistry();
 * registerCloudFunctionTools(registry, {
 *   llmClient: myLLMClient,
 *   model: "deepseek-chat",
 * });
 * ```
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
