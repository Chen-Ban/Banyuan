import Router from '@koa/router'
import applicationRoutes from './applications.js'
import aiRoutes, { publicAiRouter } from './ai.js'
import conversationRoutes from './conversations.js'
import buildRouter from './build.js'
import previewRouter from './preview.js'
import schemaRouter from './schema.js'
import uiDefinitionRouter from './uiDefinition.js'
import cloudFunctionsRouter from './cloudFunctions.js'
import fullStateRouter from './fullState.js'
import { uploadRouter } from './upload.js'
import knowledgeRouter from './knowledge.js'
import materialRouter from './materials.js'
import planningRouter from './planning.js'
import internalRouter from './internal.js'
import deployRouter from './deploy.js'
import teamRouter from './teams.js'
import creditRouter from './credits.js'
import paymentRouter, { paymentNotifyRouter } from './payment.js'
import notificationRouter from './notification.js'
import { authMiddleware } from '../middleware/auth.js'
import { requireTeam } from '../middleware/requirePermission.js'

const router = new Router()

// 健康检查（无需认证）
router.get('/health', async (ctx) => {
  ctx.body = {
    success: true,
    message: 'Banyan server is running',
    service: process.env.SERVICE_NAME ?? 'banyan-backend',
    version: '0.0.1',
    timestamp: new Date().toISOString(),
  }
})

// 预览 GET（无需认证，供 iframe / 浏览器直接访问）
router.use(previewRouter.routes(), previewRouter.allowedMethods())

// AI 模型查询 / 切换（无需认证，前端登录页需要展示可选模型）
router.use(publicAiRouter.routes(), publicAiRouter.allowedMethods())

// 内部 API（供 XiangDi 服务回调，使用 X-Internal-Token 鉴权，不走 JWT）
router.use(internalRouter.routes(), internalRouter.allowedMethods())

// 支付回调通知（聚合商回调，使用 X-Internal-Token 鉴权，不走 JWT）
router.use(paymentNotifyRouter.routes(), paymentNotifyRouter.allowedMethods())

// ─── 以下路由全部需要 JWT 认证 ─────────────────────────────────────────────────
router.use(authMiddleware)

// ─── 以下路由需要团队上下文（除团队管理外的所有业务路由）────────────────────────
router.use(async (ctx, next) => {
  // 跳过 teamRouter 路由路径（创建团队不需要团队上下文）
  if (ctx.path.startsWith('/api/teams')) {
    await next()
    return
  }
  // 其余路由使用 requireTeam 中间件
  const middleware = requireTeam()
  await middleware(ctx, next)
})

// API 路由
router.use(applicationRoutes.routes())
router.use(aiRoutes.routes())
router.use(conversationRoutes.routes(), conversationRoutes.allowedMethods())
router.use(buildRouter.routes(), buildRouter.allowedMethods())

// Phase 1：后端能力体系
router.use(schemaRouter.routes(), schemaRouter.allowedMethods())

// 画布 UI 定义 JSON 直接编辑（手动保存，自动验收的 edit 对话）
router.use(uiDefinitionRouter.routes(), uiDefinitionRouter.allowedMethods())

// 云函数 CRUD（仅定义存储；执行宿主已迁往用户 ECS 产物，banyan 不再执行 FlowSchema）
router.use(cloudFunctionsRouter.routes(), cloudFunctionsRouter.allowedMethods())

// 全量状态聚合端点（save-all / full-state，M6 数据流）
router.use(fullStateRouter.routes(), fullStateRouter.allowedMethods())

// 文件上传（缩略图 → OSS）
router.use(uploadRouter.routes(), uploadRouter.allowedMethods())

// 知识库（向量检索 + 持久化）
router.use(knowledgeRouter.routes(), knowledgeRouter.allowedMethods())

// 物料 CRUD（ADR-027 Step 5）
router.use(materialRouter.routes(), materialRouter.allowedMethods())

// Multi-Agent 规划产物 + Agent Prompt 配置（ADR-032/033/034）
router.use(planningRouter.routes(), planningRouter.allowedMethods())

// Web 部署（ADR-028）
router.use(deployRouter.routes(), deployRouter.allowedMethods())

// 团队管理（多团队 N:N，Phase 1 重构）
router.use(teamRouter.routes(), teamRouter.allowedMethods())

// AI Credit 用量查询
router.use(creditRouter.routes(), creditRouter.allowedMethods())

// 聚合支付
router.use(paymentRouter.routes(), paymentRouter.allowedMethods())

// 通知
router.use(notificationRouter.routes(), notificationRouter.allowedMethods())

export default router
