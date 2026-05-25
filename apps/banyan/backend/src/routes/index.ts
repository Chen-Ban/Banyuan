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

const router = new Router()

// 健康检查
router.get('/health', async (ctx) => {
  ctx.body = {
    success: true,
    message: 'Banyan server is running',
    timestamp: new Date().toISOString(),
  }
})

// API 路由
router.use(applicationRoutes.routes())
router.use(aiRoutes.routes())
router.use(conversationRoutes.routes(), conversationRoutes.allowedMethods())
router.use(buildRouter.routes(), buildRouter.allowedMethods())
router.use(previewRouter.routes(), previewRouter.allowedMethods())

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

// 内部 API（供 XiangDi 服务回调读取应用状态）
router.use(internalRouter.routes(), internalRouter.allowedMethods())

export default router
