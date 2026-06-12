/**
 * 后端 action 执行器 —— HTTP + 数据库
 */

import type { NodeExecutor } from '../registry.js'
import type { FlowHttpRequestNode, FlowDbQueryNode, FlowDbInsertNode, FlowDbUpdateNode, FlowDbDeleteNode } from '../../types/nodes/action.js'

// ── httpRequest ──

export const httpRequestExecutor: NodeExecutor<FlowHttpRequestNode> = {
  kind: 'httpRequest',
  outputPorts: ['status', 'body', 'headers'],
  async execute(node, inputs, _in, _state, ctxCap) {
    const cap = ctxCap as any
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
  kind: 'dbQuery',
  outputPorts: ['rows', 'count'],
  async execute(node, inputs, _in, _state, ctxCap) {
    const cap = ctxCap as any
    const db = cap.db
    if (!db) throw new Error('db not available in context')

    const result = await db.query(node.collection, (inputs.filter ?? {}) as object)
    return { outputs: { rows: result.rows, count: result.count } }
  },
}

// ── dbInsert ──

export const dbInsertExecutor: NodeExecutor<FlowDbInsertNode> = {
  kind: 'dbInsert',
  outputPorts: ['id'],
  async execute(node, inputs, _in, _state, ctxCap) {
    const cap = ctxCap as any
    const db = cap.db
    if (!db) throw new Error('db not available in context')

    const result = await db.insert(node.collection, (inputs.document ?? {}) as object)
    return { outputs: { id: result.id } }
  },
}

// ── dbUpdate ──

export const dbUpdateExecutor: NodeExecutor<FlowDbUpdateNode> = {
  kind: 'dbUpdate',
  outputPorts: ['matchedCount', 'modifiedCount'],
  async execute(node, inputs, _in, _state, ctxCap) {
    const cap = ctxCap as any
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
  kind: 'dbDelete',
  outputPorts: ['deletedCount'],
  async execute(node, inputs, _in, _state, ctxCap) {
    const cap = ctxCap as any
    const db = cap.db
    if (!db) throw new Error('db not available in context')

    const result = await db.delete(node.collection, (inputs.filter ?? {}) as object)
    return { outputs: { deletedCount: result.deleted } }
  },
}
