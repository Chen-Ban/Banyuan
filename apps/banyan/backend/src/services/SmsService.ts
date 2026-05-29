/**
 * SmsService — 短信验证码服务
 *
 * 支持两种模式：
 * - Mock 模式（SMS_MOCK=true 或非 production 环境）：验证码打印到控制台，不发送真实短信
 * - 生产模式：调用阿里云短信 API（需配置 ALIYUN_* 环境变量）
 */

import crypto from 'crypto'

// ─── OTP 内存存储（生产环境建议换 Redis）────────────────────────────────────────

interface OtpRecord {
  code: string
  expiresAt: number   // Date.now() + TTL
  attempts: number    // 已尝试次数，超过上限后锁定
}

const otpStore = new Map<string, OtpRecord>()

const OTP_TTL_MS = 5 * 60 * 1000        // 5 分钟有效期
const OTP_MAX_ATTEMPTS = 5               // 最多尝试 5 次
const OTP_SEND_COOLDOWN_MS = 60 * 1000  // 60 秒内不能重复发送

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function generateOtp(): string {
  // 6 位数字验证码
  return String(crypto.randomInt(100000, 999999))
}

function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone)
}

// ─── SmsService ───────────────────────────────────────────────────────────────

export class SmsService {
  private isMock = process.env.SMS_MOCK === 'true' || process.env.NODE_ENV !== 'production'

  /**
   * 发送验证码
   * 60 秒冷却期内重复调用会抛出 429 错误
   * Mock 模式下返回验证码字符串，生产模式返回 undefined
   */
  async sendOtp(phone: string): Promise<string | undefined> {
    if (!isValidPhone(phone)) {
      throw Object.assign(new Error('手机号格式不正确'), { statusCode: 400 })
    }

    // 冷却检查：60 秒内不能重复发送
    const existing = otpStore.get(phone)
    if (existing) {
      const sentAt = existing.expiresAt - OTP_TTL_MS
      const elapsed = Date.now() - sentAt
      if (elapsed < OTP_SEND_COOLDOWN_MS) {
        const remaining = Math.ceil((OTP_SEND_COOLDOWN_MS - elapsed) / 1000)
        throw Object.assign(
          new Error(`请等待 ${remaining} 秒后再重新发送`),
          { statusCode: 429 }
        )
      }
    }

    const code = generateOtp()
    otpStore.set(phone, {
      code,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
    })

    if (this.isMock) {
      console.log(`[SmsService Mock] 手机号 ${phone} 的验证码：${code}（5 分钟内有效）`)
      return code
    }

    // 生产模式：调用阿里云短信
    await this._sendAliyunSms(phone, code)
    return undefined
  }

  /**
   * 验证 OTP
   * 验证成功后自动删除记录（一次性使用）
   * 验证失败会抛出对应错误
   */
  verifyOtp(phone: string, code: string): boolean {
    const record = otpStore.get(phone)

    if (!record) {
      throw Object.assign(new Error('验证码不存在或已过期'), { statusCode: 400 })
    }

    if (Date.now() > record.expiresAt) {
      otpStore.delete(phone)
      throw Object.assign(new Error('验证码已过期，请重新获取'), { statusCode: 400 })
    }

    record.attempts++

    if (record.attempts > OTP_MAX_ATTEMPTS) {
      otpStore.delete(phone)
      throw Object.assign(new Error('验证码错误次数过多，请重新获取'), { statusCode: 400 })
    }

    if (record.code !== code) {
      throw Object.assign(new Error('验证码错误'), { statusCode: 400 })
    }

    // 验证成功，删除记录（一次性）
    otpStore.delete(phone)
    return true
  }

  private async _sendAliyunSms(phone: string, code: string): Promise<void> {
    const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID
    const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET
    const signName = process.env.ALIYUN_SMS_SIGN_NAME ?? '班园'
    const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE

    if (!accessKeyId || !accessKeySecret || !templateCode) {
      throw new Error(
        '阿里云短信配置缺失，请设置环境变量：ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET / ALIYUN_SMS_TEMPLATE_CODE'
      )
    }

    // 动态 import，避免未安装 SDK 时启动报错
    // 使用 Function 构造器绕过 TypeScript 静态模块解析
    const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<Record<string, unknown>>

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dysmsapiModule = await dynamicImport('@alicloud/dysmsapi20170525').catch(() => {
      throw new Error('请安装阿里云短信 SDK：pnpm add @alicloud/dysmsapi20170525 @alicloud/openapi-client')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const openApiModule = await dynamicImport('@alicloud/openapi-client').catch(() => {
      throw new Error('请安装阿里云短信 SDK：pnpm add @alicloud/dysmsapi20170525 @alicloud/openapi-client')
    })

    const Dysmsapi = dysmsapiModule['default'] as new (config: unknown) => { sendSms: (req: unknown) => Promise<{ body: { code: string; message: string } }> }
    const SendSmsRequest = dysmsapiModule['SendSmsRequest'] as new (params: unknown) => unknown
    const Config = openApiModule['Config'] as new (params: unknown) => { endpoint: string }

    const config = new Config({ accessKeyId, accessKeySecret })
    config.endpoint = 'dysmsapi.aliyuncs.com'
    const client = new Dysmsapi(config)

    const sendSmsRequest = new SendSmsRequest({
      phoneNumbers: phone,
      signName,
      templateCode,
      templateParam: JSON.stringify({ code }),
    })

    const resp = await client.sendSms(sendSmsRequest)
    if (resp.body.code !== 'OK') {
      throw new Error(`短信发送失败：${resp.body.message}`)
    }
  }
}

export const smsService = new SmsService()
