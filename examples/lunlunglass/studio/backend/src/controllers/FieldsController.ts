import { Context } from 'koa'
import fetch from 'node-fetch'

/**
 * 字段代理控制器（Studio 专用）
 *
 * Studio 后端不维护字段注册表，而是代理转发到 POS 后端的 GET /fields 接口。
 * Studio 前端调用 GET /api/fields，完全不感知这是一个代理。
 *
 * POS 地址通过环境变量 POS_API_URL 配置：
 *   POS_API_URL=http://localhost:3001  （开发环境）
 *   POS_API_URL=http://192.168.1.100:3001  （局域网部署）
 */
class FieldsController {
  /**
   * GET /api/fields
   * 代理转发到 POS 后端的 GET /fields 接口
   */
  async getFields(ctx: Context) {
    const posApiUrl = process.env.POS_API_URL
    if (!posApiUrl) {
      ctx.status = 503
      ctx.body = {
        success: false,
        message: 'POS_API_URL is not configured. Please set the environment variable.',
      }
      return
    }

    try {
      const response = await fetch(`${posApiUrl}/api/fields`, {
        headers: { 'Content-Type': 'application/json' },
        // 5 秒超时
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        ctx.status = response.status
        ctx.body = {
          success: false,
          message: `POS fields API returned ${response.status}`,
        }
        return
      }

      const data = await response.json()
      ctx.body = data
    } catch (error: unknown) {
      const err = error as Error
      ctx.status = 502
      ctx.body = {
        success: false,
        message: `Failed to fetch fields from POS: ${err.message}`,
      }
    }
  }
}

export default new FieldsController()
