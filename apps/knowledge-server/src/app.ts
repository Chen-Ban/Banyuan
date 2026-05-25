/**
 * Knowledge Server — BanvasGL 知识服务
 *
 * 独立微服务，负责：
 *   - 知识条目的生成、持久化、删除（基于 LanceDB 嵌入式向量数据库）
 *   - 向量化（本地 ONNX 推理，Xenova/multilingual-e5-small）
 *   - 语义检索（向量搜索 + BM25 全文检索 + RRF 融合）
 *   - 按 BanvasGL 版本隔离知识表（knowledge_v{version}）
 *
 * 架构定位：
 *   banyan 后端(:3001) ──▶ 知识服务(:3003) ◀── XiangDi 服务(:3002)
 *
 * 设计决策：
 *   - 知识与 BanvasGL 强相关（AISchema 变更影响知识有效性），独立发布便于追踪发版影响
 *   - 依赖 @banyuan/banvasgl（仅读取 version 做表名隔离）
 *   - 无 MongoDB 依赖，纯 LanceDB 嵌入式存储
 *   - 向量化在进程内完成，无需远程 API 调用
 */

import Koa from 'koa'
import cors from '@koa/cors'
import { koaBody } from 'koa-body'
import { errorHandler } from './middleware/errorHandler.js'
import { logger } from './middleware/logger.js'
import { internalAuth } from './middleware/auth.js'
import knowledgeRouter from './routes/knowledge.js'
import healthRouter from './routes/health.js'

const app = new Koa()

// 全局错误处理
app.on('error', (err, ctx) => {
  console.error('[Knowledge Server Error]', err, ctx)
})

// 中间件
app.use(errorHandler)
app.use(logger)
app.use(cors())
app.use(koaBody())
app.use(internalAuth)

// 路由
app.use(healthRouter.routes())
app.use(healthRouter.allowedMethods())
app.use(knowledgeRouter.routes())
app.use(knowledgeRouter.allowedMethods())

export default app
