import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { User, type IUserDoc } from '../models/auth/User.js'
import { Team } from '../models/auth/Team.js'
import { Membership } from '../models/auth/Membership.js'
import type { IUser, MembershipRole, MembershipStatus } from '../models/types/index.js'
import { RefreshToken } from '../models/auth/RefreshToken.js'
import { smsService } from './SmsService.js'

// ─── 环境变量 ─────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '2h'
const REFRESH_TOKEN_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '7')

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

/**
 * JWT 载荷
 * teamId 为可选：用户注册后尚未加入任何团队时，JWT 只携带 userId。
 * 前端检测到无 teamId 时，引导用户创建或加入团队。
 */
export interface AuthPayload {
  userId: string
  teamId?: string
  membershipRole?: MembershipRole
}

/** 用户可用的团队列表项 */
export interface TeamInfo {
  teamId: string
  name: string
  plan: 'free' | 'pro'
  role: MembershipRole
  status: MembershipStatus
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function generateAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions)
}

async function generateRefreshToken(userId: string, teamId?: string): Promise<string> {
  const tokenId = generateId('rt')
  const rawToken = crypto.randomBytes(64).toString('hex')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS)

  const doc: Record<string, unknown> = {
    tokenId,
    userId,
    token: rawToken,
    expiresAt,
  }
  if (teamId) {
    doc.teamId = teamId
  }

  await RefreshToken.create(doc)

  return rawToken
}

// ─── AuthService ──────────────────────────────────────────────────────────────

export class AuthService {
  /**
   * 刷新 Access Token
   */
  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const record = await RefreshToken.findOne({
      token: rawRefreshToken,
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    })

    if (!record) {
      throw Object.assign(new Error('Refresh token 无效或已过期'), { statusCode: 401 })
    }

    const user = await User.findOne({ userId: record.userId })
    if (!user || user.status === 'disabled') {
      throw Object.assign(new Error('用户不存在或已被禁用'), { statusCode: 401 })
    }

    // 吊销旧 token（rotation 策略）
    await RefreshToken.updateOne({ tokenId: record.tokenId }, { revokedAt: new Date() })

    // 从原 refresh token 中继承 team context
    return this._issueTokens(user.userId, record.teamId)
  }

  /**
   * 登出：吊销 refresh token
   */
  async logout(rawRefreshToken: string): Promise<void> {
    await RefreshToken.updateOne(
      { token: rawRefreshToken, revokedAt: { $exists: false } },
      { revokedAt: new Date() },
    )
  }

  /**
   * 发送手机验证码
   */
  async sendSmsCode(phone: string): Promise<string | undefined> {
    return smsService.sendOtp(phone)
  }

  /**
   * 手机号验证码登录/注册
   *
   * 新用户注册时自动创建：
   *   - 个人默认团队（name = "{username}的团队", plan='free', planId='plan_free'）
   *   - Membership（role='owner'）
   *   - JWT 直接携带 teamId，前端无需额外引导
   * 已有用户直接登录，JWT 不携带 teamId（需通过 /auth/switch-team 切换）
   */
  async loginByPhone(
    phone: string,
    code: string,
  ): Promise<{ user: Omit<IUser, 'passwordHash'>; tokens: TokenPair; isNewUser: boolean }> {
    // 验证 OTP（失败会抛出）
    smsService.verifyOtp(phone, code)

    // 查找已有用户
    let user = await User.findOne({ phone })
    let isNewUser = false

    if (!user) {
      // 创建 User + 默认个人团队 + Membership(role=owner) + 关联 plan_free
      isNewUser = true
      const userId = generateId('user')
      const teamId = generateId('team')
      const membershipId = generateId('ms')
      const username = `用户${phone.slice(-4)}`

      user = await User.create({
        userId,
        phone,
        username,
        status: 'active',
      })

      await Team.create({
        teamId,
        name: `${username}的个人空间`,
        plan: 'free',
        planId: 'plan_free',
      })

      await Membership.create({
        membershipId,
        userId,
        teamId,
        role: 'owner',
        status: 'active',
        joinedAt: new Date(),
      })

      const tokens = await this._issueTokens(userId, teamId)
      return { user: this._sanitizeUser(user), tokens, isNewUser }
    }

    if (user.status === 'disabled') {
      throw Object.assign(new Error('账号已被禁用'), { statusCode: 403 })
    }

    const tokens = await this._issueTokens(user.userId)
    return { user: this._sanitizeUser(user), tokens, isNewUser }
  }

  /**
   * 验证 Access Token，返回 payload
   */
  verifyAccessToken(token: string): AuthPayload {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as AuthPayload & jwt.JwtPayload
      return { userId: payload.userId, teamId: payload.teamId, membershipRole: payload.membershipRole }
    } catch {
      throw Object.assign(new Error('Token 无效或已过期'), { statusCode: 401 })
    }
  }

  // ─── 多团队相关 ─────────────────────────────────────────────────────────────

  /**
   * 查询用户可用的团队列表
   */
  async getUserTeams(userId: string): Promise<TeamInfo[]> {
    const memberships = await Membership.find({ userId, status: 'active' }).lean()

    if (memberships.length === 0) return []

    const teamIds = memberships.map((m) => m.teamId)
    const teams = await Team.find({ teamId: { $in: teamIds } }).lean()
    const teamMap = new Map(teams.map((t) => [t.teamId, t]))

    return memberships.map((m) => {
      const t = teamMap.get(m.teamId)
      return {
        teamId: m.teamId,
        name: t?.name ?? '未知团队',
        plan: t?.plan ?? 'free',
        role: m.role as MembershipRole,
        status: m.status as MembershipStatus,
      }
    })
  }

  /**
   * 切换当前会话的团队上下文，签发新 token
   */
  async switchTeam(userId: string, teamId: string): Promise<TokenPair> {
    const membership = await Membership.findOne({ userId, teamId, status: 'active' }).lean()
    if (!membership) {
      throw Object.assign(new Error('你不在该团队中或已被禁用'), { statusCode: 403 })
    }

    const accessToken = generateAccessToken({
      userId,
      teamId: membership.teamId,
      membershipRole: membership.role as MembershipRole,
    })
    const refreshToken = await generateRefreshToken(userId, membership.teamId)

    return { accessToken, refreshToken }
  }

  // ─── 私有方法 ───────────────────────────────────────────────────────────────

  private async _issueTokens(userId: string, teamId?: string): Promise<TokenPair> {
    const payload: AuthPayload = { userId }
    if (teamId) {
      payload.teamId = teamId
    }
    const accessToken = generateAccessToken(payload)
    const refreshToken = await generateRefreshToken(userId, teamId)
    return { accessToken, refreshToken }
  }

  private _sanitizeUser(user: IUserDoc): Omit<IUser, 'passwordHash'> {
    const obj = user.toObject()
    delete (obj as Record<string, unknown>).passwordHash
    return obj as Omit<IUser, 'passwordHash'>
  }
}

export const authService = new AuthService()
