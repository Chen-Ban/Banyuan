import Router from '@koa/router'
import aiRouter from './ai'

// 健康检查
const healthRouter = new Router()
healthRouter.get('/health', (ctx) => {
    ctx.body = { success: true, message: 'XiangDi server is running' }
})

export { healthRouter, aiRouter }
