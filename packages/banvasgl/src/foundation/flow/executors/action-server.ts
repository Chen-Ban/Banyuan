/**
 * 后端 action 执行器 —— HTTP + 数据库
 */

import { NodeKind } from '@/types/foundation/flow/enums.js'
import type { NodeExecutor } from "./types.js"
import type { FlowHttpRequestNode, FlowDbQueryNode, FlowDbInsertNode, FlowDbUpdateNode, FlowDbDeleteNode } from '@/types/foundation/flow/nodes/action.js'

// ── httpRequest ──

export const httpRequestExecutor: NodeExecutor<FlowHttpRequestNode> = {
  kind: NodeKind.HttpRequest,
  outputPorts: ['status', 'body', 'headers'],
  async execute(node, inputs, frame) {
    const cap = frame.cap as any
    const http = cap.httpClient
    if (!http) throw new Error('httpClient not available in context')

    const result = await http.request(
      node.method,
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

export const dbQueryExecutor: NodeExecutor<FlowDbQueryNode> = {
  kind: NodeKind.DbQuery,
  outputPorts: ['rows', 'count'],
  async execute(node, inputs, frame) {
    const cap = frame.cap as any
    const db = cap.db
    if (!db) throw new Error('db not available in context')

    const result = await db.query(node.collection, (inputs.filter ?? {}) as object)
    return { outputs: { rows: result.rows, count: result.count } }
  },
}

// ── dbInsert ──

export const dbInsertExecutor: NodeExecutor<FlowDbInsertNode> = {
  kind: NodeKind.DbInsert,
  outputPorts: ['id'],
  async execute(node, inputs, frame) {
    const cap = frame.cap as any
    const db = cap.db
    if (!db) throw new Error('db not available in context')

    const result = await db.insert(node.collection, (inputs.document ?? {}) as object)
    return { outputs: { id: result.id } }
  },
}

// ── dbUpdate ──

export const dbUpdateExecutor: NodeExecutor<FlowDbUpdateNode> = {
  kind: NodeKind.DbUpdate,
  outputPorts: ['matchedCount', 'modifiedCount'],
  async execute(node, inputs, frame) {
    const cap = frame.cap as any
    const db = cap.db
    if (!db) throw new Error('db not available in context')

    const result = await db.update(
      node.collection,
      (inputs.filter ?? {}) as object,
      (inputs.update ?? {}) as object,
    )
    return { outputs: { matchedCount: result.matched, modifiedCount: result.modified } }
  },
}

// ── dbDelete ──

export const dbDeleteExecutor: NodeExecutor<FlowDbDeleteNode> = {
  kind: NodeKind.DbDelete,
  outputPorts: ['deletedCount'],
  async execute(node, inputs, frame) {
    const cap = frame.cap as any
    const db = cap.db
    if (!db) throw new Error('db not available in context')

    const result = await db.delete(node.collection, (inputs.filter ?? {}) as object)
    return { outputs: { deletedCount: result.deleted } }
  },
}
