import type { NodeExecutor } from '../registry.js'
import type { FlowDbDeleteNode } from '../../types/nodes/server.js'
import type { FlowValue } from '../../types/values.js'

export const dbDeleteExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const n = node as unknown as FlowDbDeleteNode

  const filter: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(n.filter)) {
    filter[key] = resolve(val as FlowValue)
  }

  const db = ctx.env.db as {
    deleteMany: (collection: string, filter: Record<string, unknown>) => Promise<{ deletedCount: number }>
  } | undefined

  if (!db) {
    console.warn('[dbDelete] ctx.env.db 未注入，跳过')
    return
  }

  const result = await db.deleteMany(n.collection, filter)
  ctx.setVariable('local', n.outputVariable, result.deletedCount)
}
