import type { NodeExecutor } from '../registry.js'
import type { FlowDbUpdateNode } from '../../types/nodes/server.js'
import type { FlowValue } from '../../types/values.js'

export const dbUpdateExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const n = node as unknown as FlowDbUpdateNode

  const filter: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(n.filter)) {
    filter[key] = resolve(val as FlowValue)
  }

  const update: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(n.update)) {
    update[key] = resolve(val as FlowValue)
  }

  const db = ctx.env.db as {
    updateMany: (collection: string, filter: Record<string, unknown>, update: Record<string, unknown>) => Promise<{ modifiedCount: number }>
  } | undefined

  if (!db) {
    console.warn('[dbUpdate] ctx.env.db 未注入，跳过')
    return
  }

  const result = await db.updateMany(n.collection, filter, update)
  ctx.setVariable('local', n.outputVariable, result.modifiedCount)
}
