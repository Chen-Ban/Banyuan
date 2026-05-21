import type { NodeExecutor } from '../registry.js'
import type { FlowDbQueryNode } from '../../types/nodes/server.js'
import type { FlowValue } from '../../types/values.js'

export const dbQueryExecutor: NodeExecutor = async (node, ctx, resolve) => {
  const n = node as unknown as FlowDbQueryNode

  // 解析 filter 中的 FlowValue
  const filter: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(n.filter)) {
    filter[key] = resolve(val as FlowValue)
  }

  const db = ctx.env.db as {
    find: (collection: string, filter: Record<string, unknown>, options?: {
      projection?: Record<string, 1 | 0>
      sort?: Record<string, 1 | -1>
      limit?: number
    }) => Promise<unknown[]>
  } | undefined

  if (!db) {
    console.warn('[dbQuery] ctx.env.db 未注入，跳过')
    return
  }

  const result = await db.find(n.collection, filter, {
    projection: n.projection,
    sort: n.sort,
    limit: n.limit,
  })

  ctx.setVariable('local', n.outputVariable, result)
}
