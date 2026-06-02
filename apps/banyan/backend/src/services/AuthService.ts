import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { Tenant } from '../models/Tenant.js'
import { User, IUser, UserRole } from '../models/User.js'
import { RefreshToken } from '../models/RefreshToken.js'
import { smsService } from './SmsService.js'
import { tenantProvisionService } from './TenantProvisionService.js'

// ─── 环境变量 ─────────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '2h'
const REFRESH_TOKEN_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? '7')

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface AuthPayload {
  userId: string
  tenantId: string
  role: UserRole
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function generateAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions)
}

async function generateRefreshToken(userId: string, tenantId: string): Promise<string> {
  const tokenId = generateId('rt')
  const rawToken = crypto.randomBytes(64).toString('hex')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS)

  await RefreshToken.create({
    tokenId,
    userId,
    tenantId,
    token: rawToken,
    expiresAt,
  })

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

    return this._issueTokens(user.userId, user.tenantId, user.role)
  }

  /**
   * 登出：吊销 refresh token
   */
  async logout(rawRefreshToken: string): Promise<void> {
    await RefreshToken.updateOne(
      { token: rawRefreshToken, revokedAt: { $exists: false } },
      { revokedAt: new Date() }
    )
  }

  /**
   * 发送手机验证码
   * Mock 模式下返回验证码字符串，生产模式返回 undefined
   */
  async sendSmsCode(phone: string): Promise<string | undefined> {
    return smsService.sendOtp(phone)
  }

  /**
   * 手机号验证码登录/注册
   * - 手机号已存在 → 直接登录
   * - 手机号不存在 → 自动注册（创建租户 + owner 用户）
   */
  async loginByPhone(
    phone: string,
    code: string
  ): Promise<{ user: Omit<IUser, 'passwordHash'>; tokens: TokenPair; isNewUser: boolean }> {
    // 验证 OTP（失败会抛出）
    smsService.verifyOtp(phone, code)

    // 查找已有用户
    let user = await User.findOne({ phone })
    let isNewUser = false

    if (!user) {
      // 自动注册：创建租户 + owner 用户
      isNewUser = true
      const tenantId = generateId('tenant')
      const agentToken = crypto.randomBytes(32).toString('hex')
      await Tenant.create({
        tenantId,
        name: `用户${phone.slice(-4)}的空间`,
        plan: 'free',
        agentToken,
        provisionStatus: 'pending',
      })
      const userId = generateId('user')
      user = await User.create({
        userId,
        tenantId,
        phone,
        username: `用户${phone.slice(-4)}`,
        role: 'owner',
        status: 'active',
      })

      // 异步触发租户环境开通（不阻塞登录响应）
      tenantProvisionService.provision(tenantId).catch((err) => {
        console.error(`[Auth] tenant provision failed for ${tenantId}:`, err)
      })
    }

    if (user.status === 'disabled') {
      throw Object.assign(new Error('账号已被禁用'), { statusCode: 403 })
    }

    const tokens = await this._issueTokens(user.userId, user.tenantId, user.role)
    return { user: this._sanitizeUser(user), tokens, isNewUser }
  }

  /**
   * 验证 Access Token，返回 payload
   */
  verifyAccessToken(token: string): AuthPayload {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as AuthPayload & jwt.JwtPayload
      return { userId: payload.userId, tenantId: payload.tenantId, role: payload.role }
    } catch {
      throw Object.assign(new Error('Token 无效或已过期'), { statusCode: 401 })
    }
  }

  // ─── 私有方法 ───────────────────────────────────────────────────────────────

  private async _issueTokens(userId: string, tenantId: string, role: UserRole): Promise<TokenPair> {
    const accessToken = generateAccessToken({ userId, tenantId, role })
    const refreshToken = await generateRefreshToken(userId, tenantId)
    return { accessToken, refreshToken }
  }

  private _sanitizeUser(user: IUser): Omit<IUser, 'passwordHash'> {
    const obj = user.toObject()
    delete (obj as Record<string, unknown>).passwordHash
    return obj as Omit<IUser, 'passwordHash'>
  }
}

export const authService = new AuthService()
