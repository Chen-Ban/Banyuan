/**
 * FunctionRunner — 云函数执行沙箱
 *
 * 使用 Node.js vm 模块在隔离上下文中执行用户云函数代码。
 *
 * 安全措施：
 *   - vm.runInNewContext 隔离，不暴露 require/process/__dirname 等
 *   - 沙箱上下文只注入 ctx（AppDB + appId + env）和 input
 *   - 执行超时保护（默认 5 秒）
 *   - 错误捕获并返回给调用方
 *
 * 注意：当前方案是进程级隔离，安全性不如 V8 Isolate；
 * 多租户场景需评估迁移到独立 Worker 进程或 Deno/Cloudflare Workers。
 */

import vm from 'node:vm'
import { OrmService } from './OrmService.js'
import type { AppDB } from './OrmService.js'

// ── 配置 ──────────────────────────────────────────────────────────────────────

/** 默认执行超时（毫秒） */
const DEFAULT_TIMEOUT_MS = 5000

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface RunOptions {
  appId: string
  functionName: string
  code: string
  input: Record<string, unknown>
  /** 执行超时（毫秒），默认 5000 */
  timeout?: number
  /** 环境变量（用户在 UI 上配置） */
  env?: Record<string, string>
}

export interface RunResult {
  success: boolean
  output?: unknown
  error?: string
  /** 执行耗时（毫秒） */
  duration: number
  logs: string[]
}

// ── 沙箱上下文接口（注入到云函数中） ──────────────────────────────────────────

interface SandboxContext {
  db: AppDB
  appId: string
  env: Record<string, string>
}

// ── FunctionRunner ────────────────────────────────────────────────────────────

export class FunctionRunner {
  /**
   * 在沙箱中执行云函数代码
   *
   * 云函数代码格式约定：
   *   函数体代码，最后一个表达式的值作为返回值。
   *   可通过 `input` 访问入参，通过 `ctx` 访问平台上下文。
   *
   * 示例代码：
   *   const users = await ctx.db.users.find({});
   *   return users;
   */
  static async run(options: RunOptions): Promise<RunResult> {
    const { appId, code, input, timeout = DEFAULT_TIMEOUT_MS, env = {} } = options
    const startTime = Date.now()
    const logs: string[] = []

    try {
      // 构建 AppDB 访问层
      const db = await OrmService.buildAppDB(appId)

      // 构建沙箱上下文
      const sandboxCtx: SandboxContext = { db, appId, env }

      // 沙箱全局对象：只暴露安全的 API
      const sandbox: Record<string, unknown> = {
        input,
        ctx: sandboxCtx,
        console: {
          log: (...args: unknown[]) => {
            logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
          },
          warn: (...args: unknown[]) => {
            logs.push(`[WARN] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`)
          },
          error: (...args: unknown[]) => {
            logs.push(`[ERROR] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`)
          },
        },
        // 提供 setTimeout/clearTimeout（受超时保护约束）
        setTimeout,
        clearTimeout,
        // 提供 Promise 支持
        Promise,
        // JSON 工具
        JSON,
        // 数学工具
        Math,
        // 日期
        Date,
      }

      // 将用户代码包装为 async 函数，支持 await 和 return
      const wrappedCode = `
        (async () => {
          ${code}
        })()
      `

      // 创建 vm 上下文
      const vmContext = vm.createContext(sandbox)

      // 编译并执行
      const script = new vm.Script(wrappedCode, {
        filename: `cloud-function:${options.functionName}`,
      })

      const resultPromise = script.runInContext(vmContext, {
        timeout,
        breakOnSigint: true,
      }) as Promise<unknown>

      // 等待异步结果（带超时保护）
      const output = await Promise.race([
        resultPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Function execution timed out after ${timeout}ms`)), timeout),
        ),
      ])

      const duration = Date.now() - startTime
      return { success: true, output, duration, logs }
    } catch (err: unknown) {
      const duration = Date.now() - startTime
      const error = err instanceof Error ? err.message : String(err)
      return { success: false, error, duration, logs }
    }
  }
}
