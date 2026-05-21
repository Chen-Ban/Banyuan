/**
 * 相地 · Schema 工具集
 *
 * 提供 AI 读写应用数据 Schema 的能力。
 *
 * 工具列表：
 *   - schema_get：读取当前应用的完整 Schema（AI 在修改前应先调用此工具感知现有结构）
 *   - schema_set_collections：整体替换应用的 Schema（AI 生成完整 Schema 后一次性提交）
 *
 * 设计原则：
 *   - 整体替换（而非增量 patch）：AI 生成完整 Schema，后端负责 diff + 更新 + ORM 缓存失效
 *   - schema_set_collections 的执行结果通过 SchemaWriter 回调传出，
 *     由调用方（xiangdi/routes/ai.ts）通过 SSE schema_update 事件通知 banyan 后端写入 DB
 *   - 工具 handler 不直接访问 MongoDB，保持 XiangDi 服务无状态
 */

import type { ToolDefinition, ToolHandler } from "../core/types.js";
import { ToolRegistry } from "../core/ToolRegistry.js";

// ─── Schema 类型（与 banyan 后端 AppSchema model 对齐）────────────────────────

export type SchemaFieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "enum"
  | "ref"
  | "array"
  | "object";

export interface SchemaFieldDef {
  name: string;
  displayName: string;
  type: SchemaFieldType;
  required: boolean;
  defaultValue?: unknown;
  /** type === 'ref' 时，关联的集合名 */
  refCollection?: string;
  /** type === 'enum' 时，枚举值列表 */
  enumValues?: string[];
}

export interface SchemaCollectionDef {
  /** 集合英文标识符（唯一，用作 MongoDB 集合名的一部分） */
  name: string;
  /** 集合中文显示名 */
  displayName: string;
  fields: SchemaFieldDef[];
}

export interface AppSchemaSnapshot {
  collections: SchemaCollectionDef[];
}

// ─── SchemaWriter 回调（由调用方注入，工具执行时触发）────────────────────────

/**
 * AI 调用 schema_set_collections 时，工具 handler 通过此回调将新 Schema 传出。
 * 调用方（xiangdi/routes/ai.ts）收到后通过 SSE schema_update 事件通知 banyan 后端。
 */
export type SchemaWriter = (collections: SchemaCollectionDef[]) => void;

/**
 * AI 调用 schema_get 时，工具 handler 通过此回调读取当前 Schema。
 * 调用方注入当前请求携带的 appSchema（由 banyan 后端从 DB 读取后传入）。
 */
export type SchemaReader = () => AppSchemaSnapshot;

// ─── schema_get ──────────────────────────────────────────────────────────────

export interface SchemaGetInput {
  /** 无需参数，读取当前应用的完整 Schema */
  _?: never;
}

export interface SchemaGetOutput {
  schema: AppSchemaSnapshot;
}

export const SCHEMA_GET_TOOL_NAME = "schema_get" as const;

export const SCHEMA_GET_TOOL_DEFINITION: ToolDefinition = {
  name: SCHEMA_GET_TOOL_NAME,
  description:
    "读取当前应用的完整数据 Schema，包含所有集合（Collection）及其字段定义。" +
    "在生成或修改 Schema 之前，应先调用此工具了解现有数据结构，避免覆盖已有设计。",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export function createSchemaGetHandler(
  schemaReader: SchemaReader
): ToolHandler<SchemaGetInput, SchemaGetOutput> {
  return async (_input: SchemaGetInput): Promise<SchemaGetOutput> => {
    const schema = schemaReader();
    return { schema };
  };
}

// ─── schema_set_collections ──────────────────────────────────────────────────

export interface SchemaSetCollectionsInput {
  /**
   * 完整的集合定义列表。
   * 此操作为整体替换：后端将对比现有 Schema，新增/更新/删除集合和字段，
   * 并自动重建 ORM 缓存。
   */
  collections: SchemaCollectionDef[];
}

export interface SchemaSetCollectionsOutput {
  /** 操作是否成功触发 */
  success: boolean;
  /** 提交的集合数量 */
  collectionCount: number;
  message: string;
}

export const SCHEMA_SET_COLLECTIONS_TOOL_NAME = "schema_set_collections" as const;

export const SCHEMA_SET_COLLECTIONS_TOOL_DEFINITION: ToolDefinition = {
  name: SCHEMA_SET_COLLECTIONS_TOOL_NAME,
  description:
    "整体替换应用的数据 Schema。提交完整的集合定义列表，后端将自动 diff 并更新数据库结构，" +
    "同时重建 ORM 缓存。此操作为幂等操作，可安全重复调用。" +
    "字段类型支持：string / number / boolean / date / enum / ref / array / object。" +
    "enum 类型需提供 enumValues 列表；ref 类型需提供 refCollection（关联集合名）。",
  input_schema: {
    type: "object",
    properties: {
      collections: {
        type: "array",
        description: "完整的集合定义列表，整体替换现有 Schema",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "集合英文标识符（camelCase 或 snake_case，唯一）",
            },
            displayName: {
              type: "string",
              description: "集合中文显示名",
            },
            fields: {
              type: "array",
              description: "字段定义列表",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "字段英文名（camelCase）" },
                  displayName: { type: "string", description: "字段中文显示名" },
                  type: {
                    type: "string",
                    enum: ["string", "number", "boolean", "date", "enum", "ref", "array", "object"],
                    description: "字段类型",
                  },
                  required: { type: "boolean", description: "是否必填" },
                  defaultValue: { description: "默认值（可选）" },
                  refCollection: {
                    type: "string",
                    description: "type=ref 时，关联的集合名",
                  },
                  enumValues: {
                    type: "array",
                    items: { type: "string" },
                    description: "type=enum 时，枚举值列表",
                  },
                },
                required: ["name", "displayName", "type", "required"],
              },
            },
          },
          required: ["name", "displayName", "fields"],
        },
      },
    },
    required: ["collections"],
  },
};

export function createSchemaSetCollectionsHandler(
  schemaWriter: SchemaWriter
): ToolHandler<SchemaSetCollectionsInput, SchemaSetCollectionsOutput> {
  return async (input: SchemaSetCollectionsInput): Promise<SchemaSetCollectionsOutput> => {
    // 通过回调将新 Schema 传出，由调用方通过 SSE schema_update 事件通知 banyan 后端
    schemaWriter(input.collections);
    return {
      success: true,
      collectionCount: input.collections.length,
      message: `已提交 ${input.collections.length} 个集合的 Schema 定义，后端将自动更新数据库结构。`,
    };
  };
}

// ─── 便捷注册函数 ─────────────────────────────────────────────────────────────

export interface SchemaToolsConfig {
  schemaReader: SchemaReader;
  schemaWriter: SchemaWriter;
}

/**
 * 将所有 Schema 工具注册到 ToolRegistry
 *
 * @example
 * ```ts
 * const registry = new ToolRegistry();
 * registerSchemaTools(registry, {
 *   schemaReader: () => currentSchema,
 *   schemaWriter: (collections) => sseWrite(res, 'schema_update', { collections }),
 * });
 * ```
 */
export function registerSchemaTools(
  registry: ToolRegistry,
  config: SchemaToolsConfig
): void {
  const { schemaReader, schemaWriter } = config;

  registry.register(
    SCHEMA_GET_TOOL_DEFINITION,
    createSchemaGetHandler(schemaReader) as unknown as ToolHandler
  );

  registry.register(
    SCHEMA_SET_COLLECTIONS_TOOL_DEFINITION,
    createSchemaSetCollectionsHandler(schemaWriter) as unknown as ToolHandler
  );
}
