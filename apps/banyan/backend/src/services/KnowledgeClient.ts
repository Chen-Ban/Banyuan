/**
 * KnowledgeClient — 知识服务 HTTP 客户端
 *
 * 封装对独立知识服务（knowledge-server :3003）的 HTTP 调用。
 * 替代原先进程内的 EmbeddingService + KnowledgeService。
 *
 * 职责：
 *   - 为 ContextBuilder 提供 embedQuery（roundSummary 向量化 + prompt 向量化）
 *   - 为 AiService.persistRound 提供 embedPassage（生成 round embedding）
 *   - 知识检索代理（可选，当 banyan 后端需要中转时）
 *
 * 架构：
 *   banyan 后端 ──HTTP──▶ 知识服务(:3003)
 *   xiangdi-server ──HTTP──▶ 知识服务(:3003)（直连，不经过 banyan 后端）
 */

import http from 'http'
import https from 'https'

// ─── 配置 ──────────────────────────────────────────────────────────────────────

/** 知识服务地址，通过环境变量配置 */
const KNOWLEDGE_BASE_URL = process.env.KNOWLEDGE_URL ?? 'http://localhost:3003'
/** 内部认证 token */
const KNOWLEDGE_INTERNAL_TOKEN = process.env.KNOWLEDGE_INTERNAL_TOKEN
/** 请求超时（ms） */
const TIMEOUT = 15000

// ─── KnowledgeClient ──────────────────────────────────────────────────────────

class KnowledgeClient {
  /**
   * 为查询文本生成向量（query mode）。
   * 用于 ContextBuilder 的语义检索。
   */
  async embedQuery(text: string): Promise<number[] | null> {
    try {
      const result = await this.post<{ embeddings: number[][] }>('/knowledge/embed', {
        texts: [text],
        mode: 'query',
      })
      return result.embeddings?.[0] ?? null
    } catch (err) {
      console.error('[KnowledgeClient] embedQuery 失败:', err)
      return null
    }
  }

  /**
   * 为段落文本生成向量（passage mode）。
   * 用于 AiService.persistRound 的 roundSummary 向量化。
   */
  async embedPassage(text: string): Promise<number[] | null> {
    try {
      const result = await this.post<{ embeddings: number[][] }>('/knowledge/embed', {
        texts: [text],
        mode: 'passage',
      })
      return result.embeddings?.[0] ?? null
    } catch (err) {
      console.error('[KnowledgeClient] embedPassage 失败:', err)
      return null
    }
  }

  /**
   * 批量为段落文本生成向量。
   */
  async embedPassageBatch(texts: string[]): Promise<number[][] | null> {
    if (texts.length === 0) return []
    try {
      const result = await this.post<{ embeddings: number[][] }>('/knowledge/embed', {
        texts,
        mode: 'passage',
      })
      return result.embeddings ?? null
    } catch (err) {
      console.error('[KnowledgeClient] embedPassageBatch 失败:', err)
      return null
    }
  }

  /**
   * 知识库语义检索。
   * 供可能的中转场景使用（实际场景中 xiangdi-server 直连 knowledge-server）。
   */
  async search(query: string, topK?: number, category?: string): Promise<unknown> {
    return this.post('/knowledge/search', { query, topK, category })
  }

  /**
   * 获取知识库统计。
   */
  async stats(): Promise<{ totalEntries: number; tableName: string }> {
    return this.get('/knowledge/stats')
  }

  // ── 内部 HTTP 工具 ────────────────────────────────────────────────────────

  private post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request('POST', path, body) as Promise<T>
  }

  private get<T = unknown>(path: string): Promise<T> {
    return this.request('GET', path, null) as Promise<T>
  }

  private request(method: string, reqPath: string, body: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const url = new URL(reqPath, KNOWLEDGE_BASE_URL)
      const isHttps = url.protocol === 'https:'
      const transport = isHttps ? https : http

      const bodyStr = body !== null ? JSON.stringify(body) : undefined

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 3003),
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
          ...(KNOWLEDGE_INTERNAL_TOKEN ? { 'X-Internal-Token': KNOWLEDGE_INTERNAL_TOKEN } : {}),
        },
        timeout: TIMEOUT,
      }

      const req = transport.request(options, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => { data += chunk.toString() })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            reject(new Error(`知识服务返回非 JSON 响应: ${data.slice(0, 200)}`))
          }
        })
        res.on('error', reject)
      })

      req.on('error', (err) => {
        reject(new Error(`无法连接到知识服务 (${KNOWLEDGE_BASE_URL}): ${err.message}`))
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error(`知识服务请求超时 (${TIMEOUT}ms)`))
      })

      if (bodyStr) req.write(bodyStr)
      req.end()
    })
  }
}

export default new KnowledgeClient()
