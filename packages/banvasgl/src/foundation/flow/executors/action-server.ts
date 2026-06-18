/**
 * 后端 action 求值器 —— HTTP + 数据库
 *
 * 所有配置参数均从 slot.input 读取，支持 DataRef 绑定。
 */

import { NodeKind } from '@/types/foundation/flow/enums.js'
import type { NodeEvaluator } from "./types.js"
import type { FlowHttpRequestNode, FlowDbQueryNode, FlowDbInsertNode, FlowDbUpdateNode, FlowDbDeleteNode } from '@/types/foundation/flow/nodes/action.js'

// ── httpRequest ──

export const httpRequestExecutor: NodeEvaluator<FlowHttpRequestNode> = {
  kind: NodeKind.HttpRequest,
  outputPorts: ['status', 'body', 'headers'],
  async evaluate(_node, inputs, ctx) {
    const cap = ctx.cap as any
    const http = cap.httpClient
    if (!http) throw new Error('httpClient not available in context')

    const result = await http.request(
      String(inputs.method ?? 'GET'),
      String(inputs.url ?? ''),
      (inputs.headers ?? {}) as Record<string, string>,
      inputs.body,
    )
    return {
      outputs: {
        status: result.status,
        body: result.body,
        headers: result.headers,
      },
    }
  },
}

// ── dbQuery ──

export const dbQueryExecutor: NodeEvaluator<FlowDbQueryNode> = {
  kind: NodeKind.DbQuery,
  outputPorts: ['rows', 'count'],
  async evaluate(_node, inputs, ctx) {
    const cap = ctx.cap as any
    const db = cap.db
    if (!db) throw new Error('db not available in context')

    const result = await db.query(String(inputs.collection ?? ''), (inputs.filter ?? {}) as object)
    return { outputs: { rows: result.rows, count: result.count } }
  },
}

// ── dbInsert ──

export const dbInsertExecutor: NodeEvaluator<FlowDbInsertNode> = {
  kind: NodeKind.DbInsert,
  outputPorts: ['id'],
  async evaluate(_node, inputs, ctx) {
    const cap = ctx.cap as any
    const db = cap.db
    if (!db) throw new Error('db not available in context')

    const result = await db.insert(String(inputs.collection ?? ''), (inputs.document ?? {}) as object)
    return { outputs: { id: result.id } }
  },
}

// ── dbUpdate ──

export const dbUpdateExecutor: NodeEvaluator<FlowDbUpdateNode> = {
  kind: NodeKind.DbUpdate,
  outputPorts: ['matchedCount', 'modifiedCount'],
  async evaluate(_node, inputs, ctx) {
    const cap = ctx.cap as any
    const db = cap.db
    if (!db) throw new Error('db not available in context')

    const result = await db.update(
      String(inputs.collection ?? ''),
      (inputs.filter ?? {}) as object,
      (inputs.update ?? {}) as object,
    )
    return { outputs: { matchedCount: result.matched, modifiedCount: result.modified } }
  },
}

// ── dbDelete ──

export const dbDeleteExecutor: NodeEvaluator<FlowDbDeleteNode> = {
  kind: NodeKind.DbDelete,
  outputPorts: ['deletedCount'],
  async evaluate(_node, inputs, ctx) {
    const cap = ctx.cap as any
    const db = cap.db
    if (!db) throw new Error('db not available in context')

    const result = await db.delete(String(inputs.collection ?? ''), (inputs.filter ?? {}) as object)
    return { outputs: { deletedCount: result.deleted } }
  },
}
