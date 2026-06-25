import Router from '@koa/router'
import { deployController } from '../controllers/DeployController.js'
import { requirePermission } from '../middleware/requirePermission.js'

const deployRouter = new Router({ prefix: '/api/deploy' })

// 发布应用到 Web（需要 deploy:publish 权限）
deployRouter.post('/publish', requirePermission('deploy:publish'), async (ctx) => {
  await deployController.publish(ctx)
})

// 回滚到历史发布版本（需要 deploy:publish 权限）
deployRouter.post('/rollback', requirePermission('deploy:publish'), async (ctx) => {
  await deployController.rollback(ctx)
})

// 查询部署状态
deployRouter.get('/status/:deploymentId', async (ctx) => {
  await deployController.getStatus(ctx)
})

// 查询应用部署历史
deployRouter.get('/history/:applicationId', async (ctx) => {
  await deployController.getHistory(ctx)
})

// 查询 agent 在线状态
deployRouter.get('/agent-status', async (ctx) => {
  await deployController.getAgentStatus(ctx)
})

export default deployRouter
