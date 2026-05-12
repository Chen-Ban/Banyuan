import Koa from 'koa'
import cors from '@koa/cors'
import { koaBody } from 'koa-body'
import { errorHandler } from './middleware/errorHandler'
import { logger } from './middleware/logger'
import router from './routes'

const app = new Koa()

// 全局错误处理
app.on('error', (err, ctx) => {
    console.error('[Server Error]', err, ctx)
})

// 中间件
app.use(errorHandler)
app.use(logger)
app.use(cors())
app.use(koaBody())

// 路由
app.use(router.routes())
app.use(router.allowedMethods())

export default app
