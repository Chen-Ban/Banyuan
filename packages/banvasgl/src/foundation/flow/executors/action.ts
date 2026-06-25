/**
 * Action 求值器 —— 副作用节点
 *
 * Action 节点是流程中唯一可产生外部副作用的节点类型，
 * 通过 `cap` 代理访问宿主能力（导航、数据读写、HTTP 请求等）。
 *
 * 所有 action 集中定义于此，前后端通过 presets 组装不同子集：
 *
 * **共享（前后端通用）：**
 * - `setVariable`：写入当前帧的 `local` 变量（`stack.local[key] = value`）
 *
 * **前端（client preset）：**
 * - `setViewData`：更新指定 View 的 data 字段
 * - `setViewVisible`：控制 View 可见性
 * - `playAnimation`：触发 View 动画
 * - `navigate`：页面跳转
 * - `cloudFunction`：调用后端云函数（HTTP POST）
 *
 * **后端（server preset）：**
 * - `httpRequest`：通用 HTTP 请求
 * - `dbQuery`：数据库查询
 * - `dbInsert`：数据库插入
 * - `dbUpdate`：数据库更新
 * - `dbDelete`：数据库删除
 *
 * 每个 executor 从 `inputs` 读取已解析的参数（由 Runner 的 pullSlots 阶段完成），
 * 通过 `ctx.cap` 调用宿主能力，返回 `{ outputs?, nextNodeId }`。
 */

import type { NodeExecutor } from '@/types/foundation/flow/executor.js'
import type { FrontendCapProxy, BackendCapProxy, CapProxy } from '@/types/foundation/flow/context.js'
import type {
  FlowSetVariableNode,
  FlowSetViewDataNode,
  FlowSetViewVisibleNode,
  FlowPlayAnimationNode,
  FlowNavigateNode,
  FlowCloudFunctionNode,
  FlowHttpRequestNode,
  FlowDbQueryNode,
  FlowDbInsertNode,
  FlowDbUpdateNode,
  FlowDbDeleteNode,
} from '@/types/foundation/flow/nodes/action.js'

// ── 共享（前后端通用） ──

/**
 * setVariable 执行器：写入当前帧的 `local` 变量。
 *
 * 支持两种目标路径格式：
 * - `vars.local.xxx` → 写入 `stack.local`（兼容旧写法）
 * - `xxx` → 直接写入 `stack.local`（默认）
 *
 * `state.*` 已废弃，调用时打印 warning 并跳过。
 * 写入完成后沿 `slot.next` 推进控制流。
 */
export const setVariableExecutor: NodeExecutor<FlowSetVariableNode, CapProxy> = async (node, inputs, ctx) => {
  const target = node.slots[0].input.target as string
  const value = inputs.value

  const parts = target.split('.')
  if (parts[0] === 'state') {
    console.warn(
      `[setVariable] state.* 已废弃，请使用 setViewData / setViewVisible / playAnimation 节点。` +
        `收到目标: ${target}`,
    )
    return { nextNodeId: node.slots[0].next || null }
  }
  if (parts[0] === 'vars' && parts[1] === 'local') {
    const key = parts.slice(2).join('.')
    ctx.stack.local[key] = value
    return { nextNodeId: node.slots[0].next || null }
  }
  ctx.stack.local[target] = value
  return { nextNodeId: node.slots[0].next || null }
}

// ── 前端 ──

/**
 * setViewData 执行器：更新指定 View 的 data 字段。
 *
 * 调用 `cap.setViewData(viewId, key, value)`。
 * 仅在前端 preset 注册，需要 `FrontendCapProxy`。
 */
export const setViewDataExecutor: NodeExecutor<FlowSetViewDataNode, FrontendCapProxy> = async (
  node,
  inputs,
  ctx,
) => {
  if (typeof ctx.cap.setViewData === 'function') {
    ctx.cap.setViewData(
      String(inputs.viewId ?? ''),
      String(inputs.key ?? ''),
      inputs.value as string | number | boolean | object,
    )
  }
  return { nextNodeId: node.slots[0].next || null }
}

/**
 * setViewVisible 执行器：控制 View 可见性。
 *
 * 调用 `cap.setViewVisible(viewId, visible)`。
 * 仅在前端 preset 注册，需要 `FrontendCapProxy`。
 */
export const setViewVisibleExecutor: NodeExecutor<FlowSetViewVisibleNode, FrontendCapProxy> = async (
  node,
  inputs,
  ctx,
) => {
  if (typeof ctx.cap.setViewVisible === 'function') {
    ctx.cap.setViewVisible(String(inputs.viewId ?? ''), Boolean(inputs.visible))
  }
  return { nextNodeId: node.slots[0].next || null }
}

/**
 * playAnimation 执行器：触发 View 动画。
 *
 * 调用 `cap.playAnimation(viewId, animationId)`。
 * 仅在前端 preset 注册，需要 `FrontendCapProxy`。
 */
export const playAnimationExecutor: NodeExecutor<FlowPlayAnimationNode, FrontendCapProxy> = async (
  node,
  inputs,
  ctx,
) => {
  if (typeof ctx.cap.playAnimation === 'function') {
    ctx.cap.playAnimation(String(inputs.viewId ?? ''), String(inputs.animationId ?? ''))
  }
  return { nextNodeId: node.slots[0].next || null }
}

/**
 * navigate 执行器：页面跳转。
 *
 * 调用 `cap.navigate(target)`。跳转后当前 flow 的 context 失效，
 * 后续节点不再有效——navigate 必须是控制路径上的终点节点。
 * 仅在前端 preset 注册，需要 `FrontendCapProxy`。
 */
export const navigateExecutor: NodeExecutor<FlowNavigateNode, FrontendCapProxy> = async (
  node,
  inputs,
  ctx,
) => {
  if (typeof ctx.cap.navigate === 'function') {
    await ctx.cap.navigate(String(inputs.target ?? ''))
  }
  return { nextNodeId: node.slots[0].next || null }
}

/**
 * cloudFunction 执行器：调用后端云函数（HTTP POST）。
 *
 * 通过 `cap.httpClient` 发 HTTP 请求到 `/api/functions/{functionId}`。
 * 产出 `{ outputs: { status, body, headers }, nextNodeId }`。
 * 仅在前端 preset 注册，需要 `FrontendCapProxy`。
 */
export const cloudFunctionExecutor: NodeExecutor<FlowCloudFunctionNode, FrontendCapProxy> = async (
  node,
  inputs,
  ctx,
) => {
  const http = ctx.cap.httpClient
  if (!http) throw new Error('httpClient not available in context')

  const result = await http.request(
    String(inputs.method ?? 'POST'),
    `/api/functions/${String(inputs.functionId ?? '')}`,
    { 'Content-Type': 'application/json' },
    inputs.args as string | object | undefined,
  )
  return {
    outputs: {
      status: result.status,
      body: result.body,
      headers: result.headers,
    },
    nextNodeId: node.slots[0].next || null,
  }
}

// ── 后端 ──

/**
 * httpRequest 执行器：通用 HTTP 请求。
 *
 * 通过 `cap.httpClient` 发 HTTP 请求。
 * 产出 `{ outputs: { status, body, headers }, nextNodeId }`。
 * 仅在后端 preset 注册，需要 `BackendCapProxy`。
 */
export const httpRequestExecutor: NodeExecutor<FlowHttpRequestNode, BackendCapProxy> = async (
  node,
  inputs,
  ctx,
) => {
  const http = ctx.cap.httpClient
  if (!http) throw new Error('httpClient not available in context')

  const result = await http.request(
    String(inputs.method ?? 'GET'),
    String(inputs.url ?? ''),
    (inputs.headers ?? {}) as Record<string, string>,
    inputs.body as string | object | undefined,
  )
  return {
    outputs: {
      status: result.status,
      body: result.body,
      headers: result.headers,
    },
    nextNodeId: node.slots[0].next || null,
  }
}

/**
 * dbQuery 执行器：数据库查询。
 *
 * 调用 `cap.db.query(collection, filter)`。
 * 产出 `{ outputs: { rows, count }, nextNodeId }`。
 * 仅在后端 preset 注册，需要 `BackendCapProxy`。
 */
export const dbQueryExecutor: NodeExecutor<FlowDbQueryNode, BackendCapProxy> = async (node, inputs, ctx) => {
  if (!ctx.cap.db) throw new Error('db not available in context')
  const result = await ctx.cap.db.query(String(inputs.collection ?? ''), (inputs.filter ?? {}) as object)
  return { outputs: { rows: result.rows, count: result.count }, nextNodeId: node.slots[0].next || null }
}

/**
 * dbInsert 执行器：数据库插入。
 *
 * 调用 `cap.db.insert(collection, document)`。
 * 产出 `{ outputs: { id }, nextNodeId }`。
 * 仅在后端 preset 注册，需要 `BackendCapProxy`。
 */
export const dbInsertExecutor: NodeExecutor<FlowDbInsertNode, BackendCapProxy> = async (
  node,
  inputs,
  ctx,
) => {
  if (!ctx.cap.db) throw new Error('db not available in context')
  const result = await ctx.cap.db.insert(String(inputs.collection ?? ''), (inputs.document ?? {}) as object)
  return { outputs: { id: result.id }, nextNodeId: node.slots[0].next || null }
}

/**
 * dbUpdate 执行器：数据库更新。
 *
 * 调用 `cap.db.update(collection, filter, update)`。
 * 产出 `{ outputs: { matchedCount, modifiedCount }, nextNodeId }`。
 * 仅在后端 preset 注册，需要 `BackendCapProxy`。
 */
export const dbUpdateExecutor: NodeExecutor<FlowDbUpdateNode, BackendCapProxy> = async (
  node,
  inputs,
  ctx,
) => {
  if (!ctx.cap.db) throw new Error('db not available in context')
  const result = await ctx.cap.db.update(
    String(inputs.collection ?? ''),
    (inputs.filter ?? {}) as object,
    (inputs.update ?? {}) as object,
  )
  return {
    outputs: { matchedCount: result.matched, modifiedCount: result.modified },
    nextNodeId: node.slots[0].next || null,
  }
}

/**
 * dbDelete 执行器：数据库删除。
 *
 * 调用 `cap.db.delete(collection, filter)`。
 * 产出 `{ outputs: { deletedCount }, nextNodeId }`。
 * 仅在后端 preset 注册，需要 `BackendCapProxy`。
 */
export const dbDeleteExecutor: NodeExecutor<FlowDbDeleteNode, BackendCapProxy> = async (
  node,
  inputs,
  ctx,
) => {
  if (!ctx.cap.db) throw new Error('db not available in context')
  const result = await ctx.cap.db.delete(String(inputs.collection ?? ''), (inputs.filter ?? {}) as object)
  return { outputs: { deletedCount: result.deleted }, nextNodeId: node.slots[0].next || null }
}
