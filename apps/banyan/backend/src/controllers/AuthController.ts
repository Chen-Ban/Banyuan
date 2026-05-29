import { Context } from 'koa'
import { authService } from '../services/AuthService.js'

export class AuthController {

  /**
   * POST /api/auth/refresh
   * Body: { refreshToken }
   */
  async refresh(ctx: Context): Promise<void> {
    const { refreshToken } = ctx.request.body as Record<string, string>

    if (!refreshToken) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 refreshToken' }
      return
    }

    const tokens = await authService.refresh(refreshToken)
    ctx.body = { success: true, data: tokens }
  }

  /**
   * POST /api/auth/logout
   * Body: { refreshToken }
   */
  async logout(ctx: Context): Promise<void> {
    const { refreshToken } = ctx.request.body as Record<string, string>
    if (refreshToken) {
      await authService.logout(refreshToken)
    }
    ctx.body = { success: true, message: '已登出' }
  }

  /**
   * POST /api/auth/sms/send
   * Body: { phone }
   * 开发环境（Mock 模式）下会在响应中返回验证码，方便调试
   */
  async sendSmsCode(ctx: Context): Promise<void> {
    const { phone } = ctx.request.body as Record<string, string>
    if (!phone) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少手机号' }
      return
    }
    const code = await authService.sendSmsCode(phone)
    if (code) {
      // Mock 模式：直接返回验证码，前端可自动填入
      ctx.body = { success: true, message: '验证码已发送（开发模式）', data: { code } }
    } else {
      ctx.body = { success: true, message: '验证码已发送' }
    }
  }

  /**
   * POST /api/auth/sms/verify
   * Body: { phone, code }
   */
  async loginByPhone(ctx: Context): Promise<void> {
    const { phone, code } = ctx.request.body as Record<string, string>
    if (!phone || !code) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少手机号或验证码' }
      return
    }
    const result = await authService.loginByPhone(phone, code)
    ctx.body = { success: true, data: result }
  }

  /**
   * GET /api/auth/me
   * 需要 authMiddleware
   */
  async me(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { User } = await import('../models/User.js')
    const user = await User.findOne({ userId })
    if (!user) {
      ctx.status = 404
      ctx.body = { success: false, message: '用户不存在' }
      return
    }
    ctx.body = { success: true, data: user }
  }
}

export default new AuthController()
