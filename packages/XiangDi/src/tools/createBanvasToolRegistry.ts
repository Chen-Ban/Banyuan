/**
 * 相地 · BanvasGL 工具 Handler 工厂
 *
 * 后端场景下，Agent 操作的是画布 JSON（而非内存中的 View 树）。
 * BanvasHostAdapter 接口抽象了对画布数据的读写，由调用方（AiService）注入具体实现。
 *
 * 设计原则：
 * - Handler 只做数据变换，不持有状态
 * - 所有操作通过 adapter 读写，便于测试和替换
 * - APPLY_PATCH 实现事务性批量操作（顺序执行，任一失败则整体回滚）
 */

import { ToolRegistry } from "../core/ToolRegistry.js";
import { banvasToAIApp, aiAppToBanvas } from "../schema/converters.js";
import type { AIApp, AIPage, AINode } from "../schema/AISchema.js";
import {
  BANVAS_TOOLS,
  BANVAS_TOOL_DEFINITIONS,
  type GetAppStateInput,
  type CreatePageInput,
  type AddNodeInput,
  type UpdateNodeInput,
  type DeleteNodeInput,
  type MoveNodeInput,
  type ResizeNodeInput,
  type ApplyPatchInput,
  type BanvasToolName,
} from "./BanvasToolProtocol.js";

// ─── BanvasHostAdapter 接口 ───────────────────────────────────────────────────

/**
 * 画布宿主适配器接口
 * 后端实现：读写 MongoDB 中存储的 pages JSON 字符串数组
 */
export interface BanvasHostAdapter {
  /** 读取当前应用的完整 pages JSON（BanvasGL 原生格式） */
  getPages(): Promise<string[]>;
  /** 将修改后的 pages JSON 写回存储 */
  setPages(pages: string[]): Promise<void>;
  /** 应用的元信息（id、name），用于构造 AIApp */
  getAppMeta(): Promise<{ id: string; name: string; version: string }>;
}

// ─── 内部工具函数 ─────────────────────────────────────────────────────────────

/** 从 adapter 读取并转换为 AIApp */
async function readAIApp(adapter: BanvasHostAdapter): Promise<AIApp> {
  const [pages, meta] = await Promise.all([adapter.getPages(), adapter.getAppMeta()]);
  const rawApp = {
    id: meta.id,
    name: meta.name,
    version: meta.version,
    pages: pages.map((p) => JSON.parse(p)),
  };
  return banvasToAIApp(rawApp);
}

/** 将 AIApp 写回 adapter */
async function writeAIApp(adapter: BanvasHostAdapter, app: AIApp): Promise<void> {
  const banvasApp = aiAppToBanvas(app) as { pages: unknown[] };
  const pages = banvasApp.pages.map((p) => JSON.stringify(p));
  await adapter.setPages(pages);
}

/** 深度合并两个对象（patch 覆盖 target） */
function deepMerge<T extends Record<string, unknown>>(target: T, patch: Record<string, unknown>): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const tv = result[key];
    if (
      pv !== null &&
      typeof pv === "object" &&
      !Array.isArray(pv) &&
      tv !== null &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      result[key] = deepMerge(tv as Record<string, unknown>, pv as Record<string, unknown>);
    } else {
      result[key] = pv;
    }
  }
  return result as T;
}

/** 在页面的 nodes 中递归查找并更新节点 */
function updateNodeInList(nodes: AINode[], nodeId: string, patch: Record<string, unknown>): { nodes: AINode[]; found: boolean } {
  let found = false;
  const updated = nodes.map((n) => {
    if (n.id === nodeId) {
      found = true;
      return deepMerge(n as unknown as Record<string, unknown>, patch) as unknown as AINode;
    }
    if (n.type === "group") {
      const result = updateNodeInList(n.children, nodeId, patch);
      if (result.found) {
        found = true;
        return { ...n, children: result.nodes };
      }
    }
    return n;
  });
  return { nodes: updated, found };
}

/** 在页面的 nodes 中递归查找并删除节点 */
function deleteNodeInList(nodes: AINode[], nodeId: string): { nodes: AINode[]; found: boolean } {
  let found = false;
  const filtered = nodes.filter((n) => {
    if (n.id === nodeId) { found = true; return false; }
    return true;
  });
  if (found) return { nodes: filtered, found };
  const updated = filtered.map((n) => {
    if (n.type === "group") {
      const result = deleteNodeInList(n.children, nodeId);
      if (result.found) { found = true; return { ...n, children: result.nodes }; }
    }
    return n;
  });
  return { nodes: updated, found };
}

// ─── Handler 实现 ─────────────────────────────────────────────────────────────

async function handleGetAppState(adapter: BanvasHostAdapter, input: GetAppStateInput): Promise<unknown> {
  const app = await readAIApp(adapter);
  if (input.pageId) {
    const page = app.pages.find((p) => p.id === input.pageId);
    if (!page) return { error: `页面 ${input.pageId} 不存在` };
    return { ...app, pages: [page] };
  }
  return app;
}

async function handleCreatePage(adapter: BanvasHostAdapter, input: CreatePageInput): Promise<unknown> {
  const app = await readAIApp(adapter);
  const newPage: AIPage = {
    id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: input.name,
    width: input.width ?? 375,
    height: input.height ?? 812,
    backgroundColor: input.backgroundColor ?? "#ffffff",
    nodes: [],
  };
  app.pages.push(newPage);
  await writeAIApp(adapter, app);
  return { pageId: newPage.id, message: `页面 "${input.name}" 已创建` };
}

async function handleAddNode(adapter: BanvasHostAdapter, input: AddNodeInput): Promise<unknown> {
  const app = await readAIApp(adapter);
  const pageIdx = app.pages.findIndex((p) => p.id === input.pageId);
  if (pageIdx === -1) return { error: `页面 ${input.pageId} 不存在` };

  const nodeId = (input.node["id"] as string | undefined) ?? `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const node = { ...input.node, id: nodeId } as unknown as AINode;
  app.pages[pageIdx].nodes.push(node);
  await writeAIApp(adapter, app);
  return { nodeId, message: "节点已添加" };
}

async function handleUpdateNode(adapter: BanvasHostAdapter, input: UpdateNodeInput): Promise<unknown> {
  const app = await readAIApp(adapter);
  const pageIdx = app.pages.findIndex((p) => p.id === input.pageId);
  if (pageIdx === -1) return { error: `页面 ${input.pageId} 不存在` };

  const { nodes, found } = updateNodeInList(app.pages[pageIdx].nodes, input.nodeId, input.patch);
  if (!found) return { error: `节点 ${input.nodeId} 不存在` };
  app.pages[pageIdx].nodes = nodes;
  await writeAIApp(adapter, app);
  return { message: "节点已更新" };
}

async function handleDeleteNode(adapter: BanvasHostAdapter, input: DeleteNodeInput): Promise<unknown> {
  const app = await readAIApp(adapter);
  const pageIdx = app.pages.findIndex((p) => p.id === input.pageId);
  if (pageIdx === -1) return { error: `页面 ${input.pageId} 不存在` };

  const { nodes, found } = deleteNodeInList(app.pages[pageIdx].nodes, input.nodeId);
  if (!found) return { error: `节点 ${input.nodeId} 不存在` };
  app.pages[pageIdx].nodes = nodes;
  await writeAIApp(adapter, app);
  return { message: "节点已删除" };
}

async function handleMoveNode(adapter: BanvasHostAdapter, input: MoveNodeInput): Promise<unknown> {
  return handleUpdateNode(adapter, {
    pageId: input.pageId,
    nodeId: input.nodeId,
    patch: { transform: { position: { x: input.x, y: input.y } } },
  });
}

async function handleResizeNode(adapter: BanvasHostAdapter, input: ResizeNodeInput): Promise<unknown> {
  return handleUpdateNode(adapter, {
    pageId: input.pageId,
    nodeId: input.nodeId,
    patch: { transform: { size: { width: input.width, height: input.height } } },
  });
}

async function handleApplyPatch(adapter: BanvasHostAdapter, input: ApplyPatchInput): Promise<unknown> {
  // 先读取一次快照，用于回滚
  const snapshot = await adapter.getPages();
  const results: unknown[] = [];

  try {
    for (const op of input.operations) {
      const result = await dispatchHandler(adapter, op.tool as BanvasToolName, op.input);
      results.push(result);
    }
    return { message: `批量操作完成，共执行 ${input.operations.length} 步`, results };
  } catch (err) {
    // 回滚到快照
    await adapter.setPages(snapshot);
    throw new Error(`批量操作失败，已回滚：${err instanceof Error ? err.message : String(err)}`);
  }
}

/** 工具名 → Handler 分发 */
async function dispatchHandler(
  adapter: BanvasHostAdapter,
  tool: BanvasToolName,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (tool) {
    case BANVAS_TOOLS.GET_APP_STATE:
      return handleGetAppState(adapter, input as unknown as GetAppStateInput);
    case BANVAS_TOOLS.CREATE_PAGE:
      return handleCreatePage(adapter, input as unknown as CreatePageInput);
    case BANVAS_TOOLS.ADD_NODE:
      return handleAddNode(adapter, input as unknown as AddNodeInput);
    case BANVAS_TOOLS.UPDATE_NODE:
      return handleUpdateNode(adapter, input as unknown as UpdateNodeInput);
    case BANVAS_TOOLS.DELETE_NODE:
      return handleDeleteNode(adapter, input as unknown as DeleteNodeInput);
    case BANVAS_TOOLS.MOVE_NODE:
      return handleMoveNode(adapter, input as unknown as MoveNodeInput);
    case BANVAS_TOOLS.RESIZE_NODE:
      return handleResizeNode(adapter, input as unknown as ResizeNodeInput);
    case BANVAS_TOOLS.APPLY_PATCH:
      return handleApplyPatch(adapter, input as unknown as ApplyPatchInput);
    default:
      return { error: `未知工具：${tool}` };
  }
}

// ─── 工厂函数 ─────────────────────────────────────────────────────────────────

/**
 * 创建绑定了 BanvasHostAdapter 的 ToolRegistry
 *
 * @param adapter 画布宿主适配器，由调用方（AiService）注入
 * @returns 已注册所有 Banvas 工具的 ToolRegistry
 */
export function createBanvasToolRegistry(adapter: BanvasHostAdapter): ToolRegistry {
  const registry = new ToolRegistry();

  for (const def of BANVAS_TOOL_DEFINITIONS) {
    registry.register(def, async (input: Record<string, unknown>) => {
      return dispatchHandler(adapter, def.name as BanvasToolName, input);
    });
  }

  return registry;
}
