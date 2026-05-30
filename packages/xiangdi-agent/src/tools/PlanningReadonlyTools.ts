/**
 * 相地 · 规划只读工具集
 *
 * 「观其所聚，闻其所以兴」—— 子 Agent 感知项目全貌的只读窗口。
 *
 * 这些工具仅供 PlanningOrchestrator 中的 SubAgent 使用：
 *   - ArchAgent：get_adr_constraints / get_existing_schema
 *   - VisualAgent：get_page_tree / get_design_tokens
 *   - TaskPlannerAgent：get_pages / get_page_tree / validate_change_spec
 *
 * 设计原则：
 *   - 只读：所有工具仅读取状态，绝不修改任何数据
 *   - 轻量：返回精简信息，控制 token 消耗
 *   - 无副作用：幂等，任意调用顺序均安全
 */

import type { ToolDefinition, ToolHandler } from "../core/types.js";
import { ToolRegistry } from "../core/ToolRegistry.js";
import type { ProjectSpec, ChangeSpec, ChangeTask } from "../spec/types.js";
import type { AIProjectionScene, AIProjectionNode } from "../schema/projection.types.js";
import { ChangeSpecSchema } from "../spec/planningTypes.js";

// ─── 工具名称常量 ─────────────────────────────────────────────────────────────

export const PLANNING_TOOLS = {
  GET_ADR_CONSTRAINTS: "get_adr_constraints",
  GET_EXISTING_SCHEMA: "get_existing_schema",
  GET_PAGE_TREE: "get_page_tree",
  GET_DESIGN_TOKENS: "get_design_tokens",
  GET_PAGES: "get_pages",
  VALIDATE_CHANGE_SPEC: "validate_change_spec",
} as const;

export type PlanningToolName = (typeof PLANNING_TOOLS)[keyof typeof PLANNING_TOOLS];

// ─── get_adr_constraints ─────────────────────────────────────────────────────

export interface GetAdrConstraintsInput {
  /** 可选：筛选与特定关键词相关的约束 */
  keyword?: string;
}

export interface GetAdrConstraintsOutput {
  conventions: string[];
  prohibitions: string[];
  agentGuidelines: string[];
}

export const GET_ADR_CONSTRAINTS_DEFINITION: ToolDefinition = {
  name: PLANNING_TOOLS.GET_ADR_CONSTRAINTS,
  description:
    "获取项目的架构约束和编码规范。" +
    "返回编码惯例、禁止行为、Agent 行为指引三部分。" +
    "在制定技术方案时使用，确保方案不违反项目约束。" +
    "可通过 keyword 筛选特定领域的约束（如 'layout'、'memory'）。",
  input_schema: {
    type: "object",
    properties: {
      keyword: {
        type: "string",
        description: "可选：按关键词过滤约束条目（模糊匹配）",
      },
    },
  },
};

// ─── get_existing_schema ─────────────────────────────────────────────────────

export interface GetExistingSchemaInput {
  /** 可选：指定 collection 名称，不传则返回全部 */
  collectionName?: string;
}

export interface GetExistingSchemaOutput {
  collections: Array<{
    collectionName: string;
    fields: Array<{
      name: string;
      type: string;
      required: boolean;
    }>;
  }>;
  totalCollections: number;
}

export const GET_EXISTING_SCHEMA_DEFINITION: ToolDefinition = {
  name: PLANNING_TOOLS.GET_EXISTING_SCHEMA,
  description:
    "读取当前应用的数据模型 Schema。" +
    "返回所有 Collection 的字段定义（名称、类型、必填状态）。" +
    "在规划数据层变更前使用，避免与现有结构冲突。" +
    "可通过 collectionName 只查看特定集合。",
  input_schema: {
    type: "object",
    properties: {
      collectionName: {
        type: "string",
        description: "可选：指定集合名称，不传则返回全部集合",
      },
    },
  },
};

// ─── get_page_tree ───────────────────────────────────────────────────────────

export interface GetPageTreeInput {
  /** 可选：指定页面 ID，不传则返回所有页面 */
  pageId?: string;
  /** 树深度限制，默认 3 */
  maxDepth?: number;
}

export interface PageTreeNode {
  id: string;
  type: string;
  name?: string;
  children?: PageTreeNode[];
}

export interface GetPageTreeOutput {
  pages: Array<{
    id: string;
    name: string;
    tree: PageTreeNode[];
  }>;
}

export const GET_PAGE_TREE_DEFINITION: ToolDefinition = {
  name: PLANNING_TOOLS.GET_PAGE_TREE,
  description:
    "获取当前应用的页面结构树（精简格式）。" +
    "返回每个页面的视图层级关系：id、type、name（如有）和 children。" +
    "不含样式/坐标等详细信息，适合快速了解布局结构。" +
    "可通过 maxDepth 限制树深度（默认 3），避免过大输出。",
  input_schema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: "可选：指定页面 ID，不传则返回所有页面",
      },
      maxDepth: {
        type: "number",
        description: "树深度限制，默认 3",
      },
    },
  },
};

// ─── get_design_tokens ───────────────────────────────────────────────────────

export interface GetDesignTokensInput {
  /** 可选：筛选 token 类别 */
  category?: "colors" | "typography" | "spacing" | "all";
}

export interface GetDesignTokensOutput {
  colors: Record<string, string>;
  typography: Record<string, unknown>;
  spacing: Record<string, string | number>;
  hasTokens: boolean;
}

export const GET_DESIGN_TOKENS_DEFINITION: ToolDefinition = {
  name: PLANNING_TOOLS.GET_DESIGN_TOKENS,
  description:
    "获取应用的设计 Token（颜色、字体、间距等视觉规范）。" +
    "在进行视觉设计规划时使用，确保设计方案与已有 token 体系一致。" +
    "可通过 category 筛选特定类别的 token。" +
    "注意：如果项目未定义 designTokens，返回 hasTokens=false。",
  input_schema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: ["colors", "typography", "spacing", "all"],
        description: "可选：筛选 token 类别，默认 'all'",
      },
    },
  },
};

// ─── get_pages ───────────────────────────────────────────────────────────────

export interface GetPagesInput {
  /** 可选：指定页面 ID */
  pageId?: string;
}

export interface GetPagesOutput {
  pages: AIProjectionScene[];
  totalPages: number;
}

export const GET_PAGES_DEFINITION: ToolDefinition = {
  name: PLANNING_TOOLS.GET_PAGES,
  description:
    "获取当前应用的完整页面数据（AI Projection 格式）。" +
    "返回所有页面的完整结构化数据，包括视图树、坐标、尺寸、装饰等。" +
    "比 get_page_tree 更详细，适合需要精确数据做任务规划时使用。" +
    "可通过 pageId 只获取单个页面。",
  input_schema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: "可选：指定页面 ID",
      },
    },
  },
};

// ─── validate_change_spec ────────────────────────────────────────────────────

export interface ValidateChangeSpecInput {
  /** 待验证的 ChangeSpec JSON */
  changeSpec: Record<string, unknown>;
}

export interface ValidateChangeSpecOutput {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const VALIDATE_CHANGE_SPEC_DEFINITION: ToolDefinition = {
  name: PLANNING_TOOLS.VALIDATE_CHANGE_SPEC,
  description:
    "预检验 ChangeSpec 的结构合法性。" +
    "输入一个 ChangeSpec JSON，验证其是否满足 Zod Schema 约束。" +
    "返回验证结果：valid 为 true/false，errors 列出所有错误，warnings 列出警告。" +
    "在最终输出 ChangeSpec 前调用，确保结构正确、任务依赖合理。",
  input_schema: {
    type: "object",
    properties: {
      changeSpec: {
        type: "object",
        description: "待验证的 ChangeSpec JSON 对象",
      },
    },
    required: ["changeSpec"],
  },
};

// ─── 所有规划工具定义列表 ─────────────────────────────────────────────────────

export const PLANNING_TOOL_DEFINITIONS: ToolDefinition[] = [
  GET_ADR_CONSTRAINTS_DEFINITION,
  GET_EXISTING_SCHEMA_DEFINITION,
  GET_PAGE_TREE_DEFINITION,
  GET_DESIGN_TOKENS_DEFINITION,
  GET_PAGES_DEFINITION,
  VALIDATE_CHANGE_SPEC_DEFINITION,
];

// ─── Handler 数据源接口 ──────────────────────────────────────────────────────

/**
 * 规划工具的数据源接口
 * 由调用方（xiangdi-server 或 PlanningOrchestrator）注入
 */
export interface PlanningToolsDataSource {
  /** 项目规范（提供约束/设计 token） */
  getProjectSpec(): ProjectSpec | null;
  /** 当前应用页面数据（AI Projection 格式） */
  getPages(): AIProjectionScene[];
}

// ─── Handler 实现 ─────────────────────────────────────────────────────────────

function createGetAdrConstraintsHandler(
  dataSource: PlanningToolsDataSource
): ToolHandler<GetAdrConstraintsInput, GetAdrConstraintsOutput> {
  return async (input: GetAdrConstraintsInput): Promise<GetAdrConstraintsOutput> => {
    const spec = dataSource.getProjectSpec();
    if (!spec) {
      return { conventions: [], prohibitions: [], agentGuidelines: [] };
    }

    const keyword = input.keyword?.toLowerCase();
    const filterFn = keyword
      ? (item: string) => item.toLowerCase().includes(keyword)
      : () => true;

    return {
      conventions: spec.conventions.filter(filterFn),
      prohibitions: spec.prohibitions.filter(filterFn),
      agentGuidelines: spec.agentGuidelines.filter(filterFn),
    };
  };
}

function createGetExistingSchemaHandler(
  dataSource: PlanningToolsDataSource
): ToolHandler<GetExistingSchemaInput, GetExistingSchemaOutput> {
  return async (input: GetExistingSchemaInput): Promise<GetExistingSchemaOutput> => {
    const spec = dataSource.getProjectSpec();
    const collections = spec?.appSchema ?? [];

    const filtered = input.collectionName
      ? collections.filter(c => c.collectionName === input.collectionName)
      : collections;

    return {
      collections: filtered.map(c => ({
        collectionName: c.collectionName,
        fields: c.fields.map(f => ({
          name: f.name,
          type: f.type,
          required: f.required,
        })),
      })),
      totalCollections: filtered.length,
    };
  };
}

function buildPageTree(node: AIProjectionNode, depth: number, maxDepth: number): PageTreeNode {
  const result: PageTreeNode = {
    id: node.id,
    type: node.type,
  };

  // 尝试获取 name（如果存在于 text 属性中）
  const raw = node as unknown as Record<string, unknown>;
  if (raw.name && typeof raw.name === "string") {
    result.name = raw.name;
  }

  // 递归子节点
  if (depth < maxDepth && raw.children && Array.isArray(raw.children)) {
    result.children = (raw.children as AIProjectionNode[]).map(child =>
      buildPageTree(child, depth + 1, maxDepth)
    );
  }

  return result;
}

function createGetPageTreeHandler(
  dataSource: PlanningToolsDataSource
): ToolHandler<GetPageTreeInput, GetPageTreeOutput> {
  return async (input: GetPageTreeInput): Promise<GetPageTreeOutput> => {
    const scenes = dataSource.getPages();
    const maxDepth = Math.min(Math.max(input.maxDepth ?? 3, 1), 10);

    const filtered = input.pageId
      ? scenes.filter(s => s.id === input.pageId)
      : scenes;

    return {
      pages: filtered.map(scene => ({
        id: scene.id,
        name: scene.name ?? '',
        tree: scene.children.map(child => buildPageTree(child, 1, maxDepth)),
      })),
    };
  };
}

function createGetDesignTokensHandler(
  dataSource: PlanningToolsDataSource
): ToolHandler<GetDesignTokensInput, GetDesignTokensOutput> {
  return async (input: GetDesignTokensInput): Promise<GetDesignTokensOutput> => {
    const spec = dataSource.getProjectSpec();
    const tokens = spec?.designTokens;

    if (!tokens) {
      return { colors: {}, typography: {}, spacing: {}, hasTokens: false };
    }

    const category = input.category ?? "all";
    return {
      colors: category === "all" || category === "colors" ? (tokens.colors ?? {}) : {},
      typography: category === "all" || category === "typography" ? (tokens.typography ?? {}) : {},
      spacing: category === "all" || category === "spacing" ? (tokens.spacing ?? {}) : {},
      hasTokens: true,
    };
  };
}

function createGetPagesHandler(
  dataSource: PlanningToolsDataSource
): ToolHandler<GetPagesInput, GetPagesOutput> {
  return async (input: GetPagesInput): Promise<GetPagesOutput> => {
    const scenes = dataSource.getPages();
    const filtered = input.pageId
      ? scenes.filter(s => s.id === input.pageId)
      : scenes;

    return {
      pages: filtered,
      totalPages: filtered.length,
    };
  };
}

function createValidateChangeSpecHandler(): ToolHandler<ValidateChangeSpecInput, ValidateChangeSpecOutput> {
  return async (input: ValidateChangeSpecInput): Promise<ValidateChangeSpecOutput> => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 用 Zod Schema 做结构验证
    const result = ChangeSpecSchema.safeParse(input.changeSpec);

    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${issue.path.join(".")}: ${issue.message}`);
      }
      return { valid: false, errors, warnings };
    }

    // 额外语义检查
    const spec = result.data as unknown as ChangeSpec;

    // 检查 tasks 依赖关系的合法性
    const taskIds = new Set(spec.tasks.map((t: ChangeTask) => t.id));
    for (const task of spec.tasks) {
      if (task.dependsOn) {
        for (const dep of task.dependsOn) {
          if (!taskIds.has(dep)) {
            errors.push(`task "${task.id}" 依赖不存在的 task "${dep}"`);
          }
        }
      }
    }

    // 检查循环依赖
    const hasCycle = detectTaskCycle(spec.tasks);
    if (hasCycle) {
      errors.push("tasks 存在循环依赖");
    }

    // 警告：任务描述过短
    for (const task of spec.tasks) {
      if (task.description.length < 10) {
        warnings.push(`task "${task.id}" 的描述过短（${task.description.length} 字符），建议更具体`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  };
}

/** 检测任务依赖图中是否存在环 */
function detectTaskCycle(tasks: ChangeTask[]): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const adjMap = new Map<string, string[]>();

  for (const task of tasks) {
    adjMap.set(task.id, task.dependsOn ?? []);
  }

  function dfs(id: string): boolean {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    for (const dep of adjMap.get(id) ?? []) {
      if (dfs(dep)) return true;
    }
    inStack.delete(id);
    return false;
  }

  for (const task of tasks) {
    if (dfs(task.id)) return true;
  }
  return false;
}

// ─── 注册函数 ─────────────────────────────────────────────────────────────────

/**
 * 将所有规划只读工具注册到 ToolRegistry
 *
 * @param registry 目标注册表
 * @param dataSource 数据源实现
 *
 * @example
 * ```ts
 * const registry = new ToolRegistry();
 * registerPlanningReadonlyTools(registry, {
 *   getProjectSpec: () => currentSpec,
 *   getPages: () => currentPages,
 * });
 * ```
 */
export function registerPlanningReadonlyTools(
  registry: ToolRegistry,
  dataSource: PlanningToolsDataSource
): void {
  registry.register(
    GET_ADR_CONSTRAINTS_DEFINITION,
    createGetAdrConstraintsHandler(dataSource) as unknown as ToolHandler
  );
  registry.register(
    GET_EXISTING_SCHEMA_DEFINITION,
    createGetExistingSchemaHandler(dataSource) as unknown as ToolHandler
  );
  registry.register(
    GET_PAGE_TREE_DEFINITION,
    createGetPageTreeHandler(dataSource) as unknown as ToolHandler
  );
  registry.register(
    GET_DESIGN_TOKENS_DEFINITION,
    createGetDesignTokensHandler(dataSource) as unknown as ToolHandler
  );
  registry.register(
    GET_PAGES_DEFINITION,
    createGetPagesHandler(dataSource) as unknown as ToolHandler
  );
  registry.register(
    VALIDATE_CHANGE_SPEC_DEFINITION,
    createValidateChangeSpecHandler() as unknown as ToolHandler
  );
}
