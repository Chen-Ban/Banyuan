import Router from '@koa/router'
import { creditService } from '../services/CreditService.js'

const creditRouter = new Router({ prefix: '/api/credits' })

// 查询当月 credit 用量
creditRouter.get('/usage', async (ctx) => {
  const user = ctx.state.user
  if (!user) {
    ctx.status = 401
    ctx.body = { success: false, message: '未认证' }
    return
  }

  if (!user.tenantId) {
    ctx.status = 403
    ctx.body = { success: false, message: '请先创建或加入一个团队' }
    return
  }

  const usage = await creditService.getMonthlyUsage(user.tenantId)
  ctx.body = { success: true, data: usage }
})

export default creditRouter
