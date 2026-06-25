/**
 * Knowledge 路由 — 代理模式
 *
 * banyan 后端不再自己持有知识服务，而是将请求代理到独立的 knowledge-server(:3003)。
 * 保留 /api/knowledge/* 路由前缀，保持对前端和外部脚本的 API 兼容性。
 *
 * 实际知识库操作由 knowledge-server 完成：
 *   - EmbeddingService（本地 ONNX 推理）
 *   - KnowledgeService（LanceDB 向量检索）
 *   - 版本化表名隔离
 */

import Router from '@koa/router'
import http from 'http'
import https from 'https'

const router = new Router({ prefix: '/api/knowledge' })

// 知识服务地址
const KNOWLEDGE_BASE_URL = process.env.KNOWLEDGE_URL ?? 'http://localhost:3003'
const KNOWLEDGE_INTERNAL_TOKEN = process.env.KNOWLEDGE_INTERNAL_TOKEN
const TIMEOUT = 15000

/**
 * 通用代理函数：将请求转发给 knowledge-server
 */
function proxyToKnowledge(method: string, targetPath: string, body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(targetPath, KNOWLEDGE_BASE_URL)
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
        Accept: 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...(KNOWLEDGE_INTERNAL_TOKEN ? { 'X-Internal-Token': KNOWLEDGE_INTERNAL_TOKEN } : {}),
      },
      timeout: TIMEOUT,
    }

    const req = transport.request(options, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString()
      })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, body: { raw: data } })
        }
      })
      res.on('error', reject)
    })

    req.on('error', (err) => {
      reject(new Error(`无法连接到知识服务 (${KNOWLEDGE_BASE_URL}): ${err.message}`))
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('知识服务请求超时'))
    })

    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

/**
 * POST /api/knowledge/search → knowledge-server POST /knowledge/search
 */
router.post('/search', async (ctx) => {
  try {
    const result = (await proxyToKnowledge('POST', '/knowledge/search', ctx.request.body)) as {
      status?: number
      body: unknown
    }
    ctx.status = result.status ?? 200
    ctx.body = result.body
  } catch (err) {
    ctx.status = 502
    ctx.body = { error: `知识服务不可用: ${err instanceof Error ? err.message : String(err)}` }
  }
})

/**
 * POST /api/knowledge/upsert → knowledge-server POST /knowledge/upsert
 */
router.post('/upsert', async (ctx) => {
  try {
    const result = (await proxyToKnowledge('POST', '/knowledge/upsert', ctx.request.body)) as {
      status?: number
      body: unknown
    }
    ctx.status = result.status ?? 200
    ctx.body = result.body
  } catch (err) {
    ctx.status = 502
    ctx.body = { error: `知识服务不可用: ${err instanceof Error ? err.message : String(err)}` }
  }
})

/**
 * DELETE /api/knowledge/entries → knowledge-server DELETE /knowledge/entries
 */
router.delete('/entries', async (ctx) => {
  try {
    const result = (await proxyToKnowledge('DELETE', '/knowledge/entries', ctx.request.body)) as {
      status?: number
      body: unknown
    }
    ctx.status = result.status ?? 200
    ctx.body = result.body
  } catch (err) {
    ctx.status = 502
    ctx.body = { error: `知识服务不可用: ${err instanceof Error ? err.message : String(err)}` }
  }
})

/**
 * GET /api/knowledge/stats → knowledge-server GET /knowledge/stats
 */
router.get('/stats', async (ctx) => {
  try {
    const result = (await proxyToKnowledge('GET', '/knowledge/stats', null)) as {
      status?: number
      body: unknown
    }
    ctx.status = result.status ?? 200
    ctx.body = result.body
  } catch (err) {
    ctx.status = 502
    ctx.body = { error: `知识服务不可用: ${err instanceof Error ? err.message : String(err)}` }
  }
})

/**
 * POST /api/knowledge/embed → knowledge-server POST /knowledge/embed
 */
router.post('/embed', async (ctx) => {
  try {
    const result = (await proxyToKnowledge('POST', '/knowledge/embed', ctx.request.body)) as {
      status?: number
      body: unknown
    }
    ctx.status = result.status ?? 200
    ctx.body = result.body
  } catch (err) {
    ctx.status = 502
    ctx.body = { error: `知识服务不可用: ${err instanceof Error ? err.message : String(err)}` }
  }
})

export default router
