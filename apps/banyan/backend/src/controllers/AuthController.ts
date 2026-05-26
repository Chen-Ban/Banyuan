import { Context } from 'koa'
import { authService } from '../services/AuthService.js'

export class AuthController {
  /**
   * POST /api/auth/register
   * Body: { tenantName, email, username, password }
   */
  async register(ctx: Context): Promise<void> {
    const { tenantName, email, username, password } = ctx.request.body as Record<string, string>

    if (!tenantName || !email || !username || !password) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少必填字段：tenantName, email, username, password' }
      return
    }

    if (password.length < 8) {
      ctx.status = 400
      ctx.body = { success: false, message: '密码长度不能少于 8 位' }
      return
    }

    const result = await authService.register({ tenantName, email, username, password })
    ctx.status = 201
    ctx.body = { success: true, data: result }
  }

  /**
   * POST /api/auth/login
   * Body: { email, password }
   */
  async login(ctx: Context): Promise<void> {
    const { email, password } = ctx.request.body as Record<string, string>

    if (!email || !password) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少必填字段：email, password' }
      return
    }

    const result = await authService.login({ email, password })
    ctx.body = { success: true, data: result }
  }

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
   */
  async sendSmsCode(ctx: Context): Promise<void> {
    const { phone } = ctx.request.body as Record<string, string>
    if (!phone) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少手机号' }
      return
    }
    await authService.sendSmsCode(phone)
    ctx.body = { success: true, message: '验证码已发送' }
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
