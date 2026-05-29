import Router from '@koa/router'
import applicationRoutes from './applications.js'
import aiRoutes from './ai.js'
import conversationRoutes from './conversations.js'
import buildRouter from './build.js'
import previewRouter from './preview.js'
import schemaRouter from './schema.js'
import dataRouter from './data.js'
import flowsRouter from './flows.js'
import cloudFunctionsRouter from './cloudFunctions.js'
import { uploadRouter } from './upload.js'
import knowledgeRouter from './knowledge.js'
import internalRouter from './internal.js'
import { authMiddleware } from '../middleware/auth.js'

const router = new Router()

// 健康检查（无需认证）
router.get('/health', async (ctx) => {
  ctx.body = {
    success: true,
    message: 'Banyan server is running',
    timestamp: new Date().toISOString(),
  }
})

// 预览 GET（无需认证，供 iframe / 浏览器直接访问）
router.use(previewRouter.routes(), previewRouter.allowedMethods())

// 内部 API（供 XiangDi 服务回调，使用 X-Internal-Token 鉴权，不走 JWT）
router.use(internalRouter.routes(), internalRouter.allowedMethods())

// ─── 以下路由全部需要 JWT 认证 ─────────────────────────────────────────────────
router.use(authMiddleware)

// API 路由
router.use(applicationRoutes.routes())
router.use(aiRoutes.routes())
router.use(conversationRoutes.routes(), conversationRoutes.allowedMethods())
router.use(buildRouter.routes(), buildRouter.allowedMethods())

// Phase 1：后端能力体系
router.use(schemaRouter.routes(), schemaRouter.allowedMethods())
router.use(dataRouter.routes(), dataRouter.allowedMethods())

// Phase 2：FlowSchema 后端执行（ADR-013）
router.use(flowsRouter.routes(), flowsRouter.allowedMethods())

// 云函数 CRUD
router.use(cloudFunctionsRouter.routes(), cloudFunctionsRouter.allowedMethods())

// 文件上传（缩略图 → OSS）
router.use(uploadRouter.routes(), uploadRouter.allowedMethods())

// 知识库（向量检索 + 持久化）
router.use(knowledgeRouter.routes(), knowledgeRouter.allowedMethods())

export default router
