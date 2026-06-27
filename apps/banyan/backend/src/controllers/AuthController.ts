import { Context } from 'koa'
import { authService } from '../services/AuthService.js'
import { User } from '../models/index.js'

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
   *
   * 注册成功后返回的 user 不携带 teamId。
   * 新用户需要创建或加入团队后才能使用大部分功能。
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
    const { userId, teamId, membershipRole } = ctx.state.user!
    const user = await User.findOne({ userId })
    if (!user) {
      ctx.status = 404
      ctx.body = { success: false, message: '用户不存在' }
      return
    }
    ctx.body = {
      success: true,
      data: {
        ...user.toObject(),
        teamId: teamId ?? '',
        role: membershipRole ?? 'member',
      },
    }
  }

  /**
   * GET /api/auth/teams
   * 返回当前用户可用的团队列表
   */
  async listTeams(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const teams = await authService.getUserTeams(userId)
    ctx.body = { success: true, data: teams }
  }

  /**
   * POST /api/auth/switch-team
   * Body: { teamId }
   * 切换当前会话的团队上下文，重新签发 token pair
   */
  async switchTeam(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { teamId } = ctx.request.body as Record<string, string>

    if (!teamId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 teamId' }
      return
    }

    const tokens = await authService.switchTeam(userId, teamId)
    ctx.body = { success: true, data: tokens }
  }
}

export default new AuthController()
