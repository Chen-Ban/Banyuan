/**
 * 相地 · 物料工具
 *
 * 让 AI Agent 能搜索和获取可用物料，实现通过 $material 引用复用物料模板，
 * 达到极致 token 压缩效果。
 *
 * 包含两个工具：
 *   - material_search：搜索可用物料，返回 meta 列表
 *   - material_get_detail：获取物料完整参数定义
 */

import type { ToolDefinition, ToolHandler } from "../core/types.js";
import { ToolRegistry } from "../core/ToolRegistry.js";

// ─── 物料存储接口（依赖注入） ───────────────────────────────────────────────────

/**
 * 物料存储接口，由 xiangdi-server 层实现并注入
 *
 * 抽象物料服务的网络调用，工具层只依赖此接口。
 */
export interface MaterialStore {
  /** 搜索物料，返回匹配的元数据列表 */
  search(keyword: string, limit?: number): Promise<MaterialSummary[]>;
  /** 获取物料详情（含完整参数定义） */
  getDetail(materialId: string): Promise<MaterialDetail | null>;
}

export interface MaterialSummary {
  material_id: string;
  name: string;
  description?: string;
  tags?: string[];
  /** 参数名列表（快速预览） */
  parameterNames?: string[];
}

export interface MaterialDetail {
  material_id: string;
  name: string;
  description?: string;
  tags?: string[];
  parameters: Array<{
    id: string;
    name: string;
    type: string;
    description?: string;
    defaultValue?: unknown;
    required?: boolean;
  }>;
  assets: Array<{
    id: string;
    type: string;
    url: string;
  }>;
}

// ─── material_search 工具 ────────────────────────────────────────────────────

export interface MaterialSearchInput {
  /** 搜索关键词，描述需要的物料类型或功能 */
  query: string;
  /** 返回结果数量，1-20，默认 10 */
  limit?: number;
}

export interface MaterialSearchOutput {
  materials: MaterialSummary[];
  total: number;
  query: string;
}

export const MATERIAL_SEARCH_TOOL_NAME = "material_search" as const;

export const MATERIAL_SEARCH_TOOL_DEFINITION: ToolDefinition = {
  name: MATERIAL_SEARCH_TOOL_NAME,
  description:
    "搜索可用的自定义物料（已保存的可复用 UI 组件模板）。" +
    "当需要创建复杂的 UI 组合（如导航栏、商品卡片、表单等）时，" +
    "先搜索是否有现成物料可直接引用。使用物料比逐个创建子视图更高效。" +
    "返回物料的基本信息（ID、名称、描述、参数列表），" +
    "如需获取完整参数定义请进一步调用 material_get_detail。",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "搜索查询词。描述需要的物料功能或类型。" +
          "例如：'导航栏'、'商品卡片'、'登录表单'",
      },
      limit: {
        type: "number",
        description: "返回结果数量，1-20，默认 10",
      },
    },
    required: ["query"],
  },
};

export function createMaterialSearchHandler(
  store: MaterialStore
): ToolHandler<MaterialSearchInput, MaterialSearchOutput> {
  return async (input: MaterialSearchInput): Promise<MaterialSearchOutput> => {
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 20);
    const materials = await store.search(input.query, limit);

    return {
      materials,
      total: materials.length,
      query: input.query,
    };
  };
}

// ─── material_get_detail 工具 ─────────────────────────────────────────────────

export interface MaterialGetDetailInput {
  /** 物料 ID（从 material_search 结果中获取） */
  material_id: string;
}

export interface MaterialGetDetailOutput {
  found: boolean;
  material: MaterialDetail | null;
}

export const MATERIAL_GET_DETAIL_TOOL_NAME = "material_get_detail" as const;

export const MATERIAL_GET_DETAIL_TOOL_DEFINITION: ToolDefinition = {
  name: MATERIAL_GET_DETAIL_TOOL_NAME,
  description:
    "获取物料的完整参数定义。传入物料 ID（从 material_search 结果获得），" +
    "返回该物料的所有可配置参数（类型、默认值、是否必填）和资源列表。" +
    "获取详情后可通过 $material 节点引用该物料并传入参数值。",
  input_schema: {
    type: "object",
    properties: {
      material_id: {
        type: "string",
        description: "物料的唯一标识符，从 material_search 结果的 material_id 字段获取",
      },
    },
    required: ["material_id"],
  },
};

export function createMaterialGetDetailHandler(
  store: MaterialStore
): ToolHandler<MaterialGetDetailInput, MaterialGetDetailOutput> {
  return async (input: MaterialGetDetailInput): Promise<MaterialGetDetailOutput> => {
    const detail = await store.getDetail(input.material_id);

    return {
      found: detail !== null,
      material: detail,
    };
  };
}

// ─── 便捷注册函数 ─────────────────────────────────────────────────────────────

/**
 * 将 Material 工具（search + get_detail）注册到 ToolRegistry
 *
 * @example
 * ```ts
 * const registry = new ToolRegistry();
 * const materialStore = new RemoteMaterialStore(banyanClient);
 * registerMaterialTools(registry, materialStore);
 * ```
 */
export function registerMaterialTools(
  registry: ToolRegistry,
  store: MaterialStore
): void {
  registry.register(
    MATERIAL_SEARCH_TOOL_DEFINITION,
    createMaterialSearchHandler(store) as unknown as ToolHandler
  );
  registry.register(
    MATERIAL_GET_DETAIL_TOOL_DEFINITION,
    createMaterialGetDetailHandler(store) as unknown as ToolHandler
  );
}
