/**
 * 相地 · BanvasGL 工具 Handler 工厂
 *
 * 后端场景下，Agent 操作的是画布 JSON（而非内存中的 View 树）。
 * BanvasHostAdapter 接口抽象了对画布数据的读写，由调用方（AiService）注入具体实现。
 *
 * 设计原则：
 * - Handler 只做数据变换，不持有状态
 * - 所有操作通过 adapter 读写，便于测试和替换
 * - 基于 AI Projection 格式（ADR-027），无损双向转换
 */

import { ToolRegistry } from "../core/ToolRegistry.js";
import { pagesToProjection, projectionToPages } from "../schema/projection.js";
import type { AIProjectionScene } from "../schema/projection.types.js";
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

// ─── AI Projection 读写 ──────────────────────────────────────────────────────

/**
 * 从 adapter 读取并转换为 AI Projection 格式。
 * 直接操作 Serializer 原生 JSON，无损双向转换。
 *
 * 当 pages 为空时返回空数组（支持新应用创建首页等场景）。
 *
 * @throws Error 当 JSON 解析/转换失败时抛出有意义的错误信息
 */
export async function readProjection(adapter: BanvasHostAdapter): Promise<AIProjectionScene[]> {
  const pages = await adapter.getPages();
  if (!pages || pages.length === 0) {
    return [];
  }
  try {
    return pagesToProjection(pages);
  } catch (err) {
    throw new Error(
      `[AI Projection] 页面数据转换失败: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/**
 * 将 AI Projection 写回 adapter。
 * @param version - BanvasGL 版本号，用于 SerializedData.version 字段
 */
export async function writeProjection(
  adapter: BanvasHostAdapter,
  scenes: AIProjectionScene[],
  version: string,
): Promise<void> {
  const pages = projectionToPages(scenes, version);
  await adapter.setPages(pages);
}

// ─── 工具执行上下文 ───────────────────────────────────────────────────────────

/**
 * 工具执行上下文
 *
 * 在 APPLY_PATCH 批量操作中，所有子工具共享同一个内存 Projection 状态，
 * 避免每个工具独立 readProjection/writeProjection 产生的 N+1 序列化开销。
 */
interface ToolExecutionContext {
  scenes: AIProjectionScene[];
  version: string;
  dirty: boolean;
}

// ─── Handler 实现 ─────────────────────────────────────────────────────────────

async function handleGetAppState(
  adapter: BanvasHostAdapter,
  input: GetAppStateInput,
  ctx?: ToolExecutionContext
): Promise<unknown> {
  const scenes = ctx ? ctx.scenes : await readProjection(adapter);
  if (input.pageId) {
    const scene = scenes.find((s) => s.id === input.pageId);
    if (!scene) return { error: `页面 ${input.pageId} 不存在` };
    return scene;
  }
  return scenes;
}

async function handleCreatePage(
  adapter: BanvasHostAdapter,
  input: CreatePageInput,
  ctx?: ToolExecutionContext
): Promise<unknown> {
  const scenes = ctx ? ctx.scenes : await readProjection(adapter);
  const meta = await adapter.getAppMeta();
  const newScene: AIProjectionScene = {
    id: `page_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: input.name,
    size: { width: input.width ?? 375, height: input.height ?? 812 },
    backgroundColor: input.backgroundColor ?? '#ffffff',
    children: [],
  };
  scenes.push(newScene);
  if (ctx) {
    ctx.dirty = true;
  } else {
    await writeProjection(adapter, scenes, meta.version);
  }
  return { pageId: newScene.id, message: `页面 "${input.name}" 已创建` };
}

async function handleAddNode(
  adapter: BanvasHostAdapter,
  input: AddNodeInput,
  ctx?: ToolExecutionContext
): Promise<unknown> {
  const scenes = ctx ? ctx.scenes : await readProjection(adapter);
  const meta = await adapter.getAppMeta();
  const scene = scenes.find((s) => s.id === input.pageId);
  if (!scene) return { error: `页面 ${input.pageId} 不存在` };

  const nodeId = (input.node["id"] as string | undefined) ?? `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const node = normalizeToProjectionNode({ ...input.node, id: nodeId });
  scene.children.push(node);

  if (ctx) {
    ctx.dirty = true;
  } else {
    await writeProjection(adapter, scenes, meta.version);
  }
  return { nodeId, message: "节点已添加" };
}

async function handleUpdateNode(
  adapter: BanvasHostAdapter,
  input: UpdateNodeInput,
  ctx?: ToolExecutionContext
): Promise<unknown> {
  const scenes = ctx ? ctx.scenes : await readProjection(adapter);
  const meta = await adapter.getAppMeta();
  const scene = scenes.find((s) => s.id === input.pageId);
  if (!scene) return { error: `页面 ${input.pageId} 不存在` };

  const found = updateNodeInChildren(scene.children, input.nodeId, input.patch);
  if (!found) return { error: `节点 ${input.nodeId} 不存在` };

  if (ctx) {
    ctx.dirty = true;
  } else {
    await writeProjection(adapter, scenes, meta.version);
  }
  return { message: "节点已更新" };
}

async function handleDeleteNode(
  adapter: BanvasHostAdapter,
  input: DeleteNodeInput,
  ctx?: ToolExecutionContext
): Promise<unknown> {
  const scenes = ctx ? ctx.scenes : await readProjection(adapter);
  const meta = await adapter.getAppMeta();
  const scene = scenes.find((s) => s.id === input.pageId);
  if (!scene) return { error: `页面 ${input.pageId} 不存在` };

  const found = deleteNodeInChildren(scene.children, input.nodeId);
  if (!found) return { error: `节点 ${input.nodeId} 不存在` };

  if (ctx) {
    ctx.dirty = true;
  } else {
    await writeProjection(adapter, scenes, meta.version);
  }
  return { message: "节点已删除" };
}

async function handleMoveNode(
  adapter: BanvasHostAdapter,
  input: MoveNodeInput,
  ctx?: ToolExecutionContext
): Promise<unknown> {
  return handleUpdateNode(
    adapter,
    {
      pageId: input.pageId,
      nodeId: input.nodeId,
      patch: { transform: { x: input.x, y: input.y } },
    },
    ctx
  );
}

async function handleResizeNode(
  adapter: BanvasHostAdapter,
  input: ResizeNodeInput,
  ctx?: ToolExecutionContext
): Promise<unknown> {
  return handleUpdateNode(
    adapter,
    {
      pageId: input.pageId,
      nodeId: input.nodeId,
      patch: { size: { width: input.width, height: input.height } },
    },
    ctx
  );
}

async function handleApplyPatch(adapter: BanvasHostAdapter, input: ApplyPatchInput): Promise<unknown> {
  const snapshot = await adapter.getPages();
  const scenes = await readProjection(adapter);
  const meta = await adapter.getAppMeta();
  const ctx: ToolExecutionContext = { scenes, version: meta.version, dirty: false };
  const results: unknown[] = [];

  try {
    for (const op of input.operations) {
      const result = await dispatchHandler(adapter, op.tool as BanvasToolName, op.input, ctx);
      results.push(result);
    }

    if (ctx.dirty) {
      await writeProjection(adapter, ctx.scenes, ctx.version);
    }

    return { message: `批量操作完成，共执行 ${input.operations.length} 步`, results };
  } catch (err) {
    await adapter.setPages(snapshot);
    throw new Error(`批量操作失败，已回滚：${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── 工具分发 ─────────────────────────────────────────────────────────────────

async function dispatchHandler(
  adapter: BanvasHostAdapter,
  tool: BanvasToolName,
  input: Record<string, unknown>,
  ctx?: ToolExecutionContext
): Promise<unknown> {
  switch (tool) {
    case BANVAS_TOOLS.GET_APP_STATE:
      return handleGetAppState(adapter, input as unknown as GetAppStateInput, ctx);
    case BANVAS_TOOLS.CREATE_PAGE:
      return handleCreatePage(adapter, input as unknown as CreatePageInput, ctx);
    case BANVAS_TOOLS.ADD_NODE:
      return handleAddNode(adapter, input as unknown as AddNodeInput, ctx);
    case BANVAS_TOOLS.UPDATE_NODE:
      return handleUpdateNode(adapter, input as unknown as UpdateNodeInput, ctx);
    case BANVAS_TOOLS.DELETE_NODE:
      return handleDeleteNode(adapter, input as unknown as DeleteNodeInput, ctx);
    case BANVAS_TOOLS.MOVE_NODE:
      return handleMoveNode(adapter, input as unknown as MoveNodeInput, ctx);
    case BANVAS_TOOLS.RESIZE_NODE:
      return handleResizeNode(adapter, input as unknown as ResizeNodeInput, ctx);
    case BANVAS_TOOLS.APPLY_PATCH:
      return handleApplyPatch(adapter, input as unknown as ApplyPatchInput);
    default:
      return { error: `未知工具：${tool}` };
  }
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

import type { AIProjectionNode } from "../schema/projection.types.js";

/**
 * 将 LLM 传入的节点数据宽容转换为 AIProjectionNode。
 * LLM 可能传入旧格式（x/y/width/height 扁平）或新格式（transform/size）。
 */
function normalizeToProjectionNode(raw: Record<string, unknown>): AIProjectionNode {
  const id = (raw.id as string) ?? `node_${Date.now()}`;
  const type = (raw.type as string) ?? 'GRAPHVIEW';

  // 解析 transform
  let x = 0, y = 0, rotation: number | undefined, scaleX: number | undefined, scaleY: number | undefined;
  if (raw.transform && typeof raw.transform === 'object') {
    const t = raw.transform as Record<string, unknown>;
    // 新格式：{ x, y, rotation?, scaleX?, scaleY? }
    if ('x' in t) {
      x = Number(t.x ?? 0);
      y = Number(t.y ?? 0);
      rotation = t.rotation != null ? Number(t.rotation) : undefined;
      scaleX = t.scaleX != null ? Number(t.scaleX) : undefined;
      scaleY = t.scaleY != null ? Number(t.scaleY) : undefined;
    }
    // 旧格式：{ position: { x, y }, size: { width, height } }
    else if ('position' in t) {
      const pos = t.position as Record<string, unknown>;
      x = Number(pos?.x ?? 0);
      y = Number(pos?.y ?? 0);
      rotation = t.rotation != null ? Number(t.rotation) : undefined;
    }
  } else {
    // 扁平格式：{ x, y, ... }
    x = Number(raw.x ?? 0);
    y = Number(raw.y ?? 0);
    rotation = raw.rotation != null ? Number(raw.rotation) : undefined;
  }

  // 解析 size
  let width = 100, height = 100;
  if (raw.size && typeof raw.size === 'object') {
    const s = raw.size as Record<string, unknown>;
    width = Number(s.width ?? 100);
    height = Number(s.height ?? 100);
  } else if (raw.transform && typeof raw.transform === 'object') {
    const t = raw.transform as Record<string, unknown>;
    if ('size' in t && typeof t.size === 'object') {
      const s = t.size as Record<string, unknown>;
      width = Number(s.width ?? 100);
      height = Number(s.height ?? 100);
    }
  } else {
    width = Number(raw.width ?? 100);
    height = Number(raw.height ?? 100);
  }

  const transform = { x, y, ...(rotation != null ? { rotation } : {}), ...(scaleX != null ? { scaleX } : {}), ...(scaleY != null ? { scaleY } : {}) };
  const size = { width, height };

  // 构建基础节点，其余字段透传
  const { id: _id, type: _type, x: _x, y: _y, width: _w, height: _h, rotation: _r, transform: _t, size: _s, ...rest } = raw;
  return { type, id, transform, size, ...rest } as unknown as AIProjectionNode;
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

/** 在 children 中递归查找并更新节点 */
function updateNodeInChildren(children: AIProjectionNode[], nodeId: string, patch: Record<string, unknown>): boolean {
  for (let i = 0; i < children.length; i++) {
    if (children[i].id === nodeId) {
      children[i] = deepMerge(children[i] as unknown as Record<string, unknown>, patch) as unknown as AIProjectionNode;
      return true;
    }
    // 递归搜索容器子节点
    const node = children[i] as unknown as Record<string, unknown>;
    if (node.children && Array.isArray(node.children)) {
      if (updateNodeInChildren(node.children as AIProjectionNode[], nodeId, patch)) return true;
    }
  }
  return false;
}

/** 在 children 中递归查找并删除节点 */
function deleteNodeInChildren(children: AIProjectionNode[], nodeId: string): boolean {
  const idx = children.findIndex((n) => n.id === nodeId);
  if (idx !== -1) {
    children.splice(idx, 1);
    return true;
  }
  for (const child of children) {
    const node = child as unknown as Record<string, unknown>;
    if (node.children && Array.isArray(node.children)) {
      if (deleteNodeInChildren(node.children as AIProjectionNode[], nodeId)) return true;
    }
  }
  return false;
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
