import type { NodeExecutor } from '../registry.js'
import type { FlowDbInsertNode } from '../../types/nodes/server.js'
import type { FlowValue } from '../../types/values.js'

export const dbInsertExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const n = node as unknown as FlowDbInsertNode

  // 解析 document 中的 FlowValue
  const doc: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(n.document)) {
    doc[key] = resolve(val as FlowValue)
  }

  const db = ctx.env.db as {
    insertOne: (collection: string, doc: Record<string, unknown>) => Promise<{ insertedId: string }>
  } | undefined

  if (!db) {
    console.warn('[dbInsert] ctx.env.db 未注入，跳过')
    return
  }

  const result = await db.insertOne(n.collection, doc)
  ctx.setVariable('local', n.outputVariable, result.insertedId)
}
