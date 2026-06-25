/**
 * RemoteKnowledgeStore — 远程知识库代理
 *
 * 实现 KnowledgeStore 接口，但不持有本地数据。
 * query() 时通过 HTTP 调用独立知识服务（knowledge-server :3003）的 /knowledge/search 接口。
 *
 * 设计决策：
 *   - 知识服务独立于 banyan 后端和 xiangdi-server，作为专属微服务
 *   - 知识与 BanvasGL 版本强关联，独立发版便于追踪影响范围
 *   - xiangdi-server 作为无状态 AI 服务，通过本客户端"消费"知识
 *   - 知识通过 knowledge_search 工具以 Tool 模式按需检索
 *   - 检索结果进入对话流（tool_result），相当于 L1 的动态扩展
 *   - 错误处理：知识服务不可用时降级返回空结果（非致命），但通过结构化日志记录
 */

import http from 'http'
import https from 'https'
import type { KnowledgeStore, KnowledgeChunk, KnowledgeQueryOptions } from '@banyuan/xiangdi-agent'
import { logger } from '../logger.js'

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface RemoteKnowledgeStoreConfig {
  /** 知识服务基础 URL，默认 http://localhost:3003 */
  baseUrl?: string
  /** 内部认证 token */
  internalToken?: string
  /** 请求超时（ms），默认 10000 */
  timeout?: number
}

// ─── 实现 ──────────────────────────────────────────────────────────────────────

export class RemoteKnowledgeStore implements KnowledgeStore {
  private readonly baseUrl: string
  private readonly internalToken?: string
  private readonly timeout: number

  constructor(config: RemoteKnowledgeStoreConfig = {}) {
    this.baseUrl = config.baseUrl ?? process.env.KNOWLEDGE_URL ?? 'http://localhost:3003'
    this.internalToken = config.internalToken ?? process.env.KNOWLEDGE_INTERNAL_TOKEN
    this.timeout = config.timeout ?? 10000
  }

  async query(query: string, options?: KnowledgeQueryOptions): Promise<KnowledgeChunk[]> {
    const topK = options?.topK ?? 5
    const category = options?.filter?.['category'] as string | undefined

    const body = JSON.stringify({ query, topK, category })
    const url = new URL('/knowledge/search', this.baseUrl)
    const isHttps = url.protocol === 'https:'
    const transport = isHttps ? https : http

    return new Promise((resolve) => {
      const reqOptions: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 3003),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Accept: 'application/json',
          ...(this.internalToken ? { 'X-Internal-Token': this.internalToken } : {}),
        },
        timeout: this.timeout,
      }

      const req = transport.request(reqOptions, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data) as { chunks?: KnowledgeChunk[] }
            resolve(parsed.chunks ?? [])
          } catch (parseErr) {
            logger.warn('[RemoteKnowledgeStore] Failed to parse response, degrading to empty results', {
              error: parseErr instanceof Error ? parseErr.message : String(parseErr),
              query: query.slice(0, 100),
            })
            resolve([])
          }
        })
        res.on('error', (err) => {
          logger.warn('[RemoteKnowledgeStore] Response stream error, degrading to empty results', {
            error: err.message,
            query: query.slice(0, 100),
          })
          resolve([])
        })
      })

      req.on('error', (err) => {
        logger.warn('[RemoteKnowledgeStore] Request failed, degrading to empty results', {
          error: err.message,
          baseUrl: this.baseUrl,
          query: query.slice(0, 100),
        })
        resolve([])
      })

      req.on('timeout', () => {
        req.destroy()
        logger.warn('[RemoteKnowledgeStore] Request timeout, degrading to empty results', {
          timeout: this.timeout,
          query: query.slice(0, 100),
        })
        resolve([])
      })

      req.write(body)
      req.end()
    })
  }
}
