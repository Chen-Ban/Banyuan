/**
 * FlowRunnerService —— 后端 FlowSchema 执行服务
 *
 * 使用 banvas-flow/server 的 createServerFlowRunner 执行后端 FlowSchema。
 * 通过 ServerFlowContext 适配 OrmService 的 AppDB 为 banvas-flow 的 FlowContext。
 *
 * 对外提供与 FunctionRunner 类似的 run 接口：
 *   FlowRunnerService.run(appId, flowSchema, input) → result
 */

import { createServerFlowRunner } from '@banyuan/flow/server'
import type { FlowContext, FlowSchema } from '@banyuan/flow'
import { OrmService } from './OrmService.js'
import type { AppDB } from './OrmService.js'

// ── 单例 FlowRunner ─────────────────────────────────────────────────────────

const serverRunner = createServerFlowRunner()

// ── ServerFlowContext ───────────────────────────────────────────────────────

class ServerFlowContext implements FlowContext {
  eventArgs: unknown[]
  env: Record<string, unknown>
  private variables: Map<string, Map<string, unknown>> = new Map()

  constructor(appId: string, db: AppDB, input: Record<string, unknown>) {
    this.eventArgs = []

    // 将 input 写入 'local' 作用域
    const localScope = new Map<string, unknown>()
    for (const [key, val] of Object.entries(input)) {
      localScope.set(key, val)
    }
    this.variables.set('local', localScope)
    this.variables.set('flow', new Map())

    // 注入环境能力
    this.env = {
      appId,

      // banvas-flow 后端 db 接口适配
      db: {
        find: async (
          collection: string,
          filter: Record<string, unknown>,
          options?: { projection?: Record<string, 1 | 0>; sort?: Record<string, 1 | -1>; limit?: number },
        ) => {
          const accessor = db[collection]
          if (!accessor) return []
          const docs = await accessor.find(filter, {
            limit: options?.limit,
            sort: options?.sort,
          })
          return docs.map(d => (d as any).toObject ? (d as any).toObject() : d)
        },

        insertOne: async (collection: string, doc: Record<string, unknown>) => {
          const accessor = db[collection]
          if (!accessor) throw new Error(`Collection "${collection}" not found`)
          const created = await accessor.create(doc)
          return { insertedId: (created as any)._id?.toString() ?? '' }
        },

        updateMany: async (collection: string, filter: Record<string, unknown>, update: Record<string, unknown>) => {
          // 简化实现：查找匹配文档，逐个更新
          const accessor = db[collection]
          if (!accessor) return { modifiedCount: 0 }
          const docs = await accessor.find(filter)
          let count = 0
          for (const doc of docs) {
            const id = (doc as any)._id?.toString()
            if (id) {
              await accessor.updateById(id, update)
              count++
            }
          }
          return { modifiedCount: count }
        },

        deleteMany: async (collection: string, filter: Record<string, unknown>) => {
          const accessor = db[collection]
          if (!accessor) return { deletedCount: 0 }
          const docs = await accessor.find(filter)
          let count = 0
          for (const doc of docs) {
            const id = (doc as any)._id?.toString()
            if (id) {
              const deleted = await accessor.deleteById(id)
              if (deleted) count++
            }
          }
          return { deletedCount: count }
        },
      },

      httpClient: {
        request: async (options: { url: string; method: string; headers?: Record<string, string>; body?: unknown }) => {
          const resp = await fetch(options.url, {
            method: options.method,
            headers: options.headers,
            body: options.body != null ? JSON.stringify(options.body) : undefined,
          })
          const contentType = resp.headers.get('content-type') ?? ''
          return contentType.includes('application/json')
            ? resp.json()
            : resp.text()
        },
      },
    }
  }

  getVariable(scope: string, key: string): unknown {
    const scopeMap = this.variables.get(scope)
    return scopeMap?.get(key)
  }

  setVariable(scope: string, key: string, value: unknown): void {
    let scopeMap = this.variables.get(scope)
    if (!scopeMap) {
      scopeMap = new Map()
      this.variables.set(scope, scopeMap)
    }
    scopeMap.set(key, value)
  }

  /** 导出当前 local 变量作为结果 */
  getResult(): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    const localScope = this.variables.get('local')
    if (localScope) {
      for (const [key, val] of localScope) {
        result[key] = val
      }
    }
    return result
  }
}

// ── 公共 API ────────────────────────────────────────────────────────────────

export interface FlowRunResult {
  success: boolean
  result?: Record<string, unknown>
  error?: string
  duration: number
}

export class FlowRunnerService {
  /**
   * 执行一个后端 FlowSchema
   *
   * @param appId  应用 ID（用于 DB 操作的 scope）
   * @param schema FlowSchema JSON
   * @param input  输入变量（写入 local 作用域）
   */
  static async run(
    appId: string,
    schema: FlowSchema,
    input: Record<string, unknown> = {},
  ): Promise<FlowRunResult> {
    const startTime = Date.now()

    try {
      const db = await OrmService.buildAppDB(appId)
      const ctx = new ServerFlowContext(appId, db, input)
      await serverRunner.run(schema, ctx)

      const result = ctx.getResult()
      const duration = Date.now() - startTime
      return { success: true, result, duration }
    } catch (err: unknown) {
      const duration = Date.now() - startTime
      const error = err instanceof Error ? err.message : String(err)
      return { success: false, error, duration }
    }
  }
}
