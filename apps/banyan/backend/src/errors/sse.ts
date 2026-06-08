/**
 * SSE 通道错误写入工具
 *
 * 统一 SSE 流中 error 事件的格式，确保前端收到的错误载荷与 HTTP 响应一致。
 */

import type { ServerResponse } from 'http'
import { BanyanError, type ErrorPayload } from './BanyanError.js'

/** 向 SSE 流写入结构化错误事件 */
export function sseWriteError(res: ServerResponse, err: unknown): void {
  if (res.writableEnded) return

  const payload = toBanyanErrorPayload(err)
  res.write(`event: error\ndata: ${JSON.stringify(payload)}\n\n`)
}

/** 将任意错误转为统一的 ErrorPayload */
export function toBanyanErrorPayload(err: unknown): ErrorPayload {
  if (err instanceof BanyanError) {
    return err.toJSON()
  }

  const message = err instanceof Error ? err.message : String(err)
  return {
    code: 'INTERNAL_ERROR',
    category: 'internal',
    message: process.env.NODE_ENV === 'development' ? message : '服务内部错误',
    retryable: false,
  }
}
