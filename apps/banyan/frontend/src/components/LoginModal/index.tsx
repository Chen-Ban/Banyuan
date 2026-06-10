/**
 * LoginModal — 手机号验证码登录弹窗
 *
 * 两步流程：
 * 1. 输入手机号 → 点击「获取验证码」
 * 2. 输入 6 位验证码 → 点击「登录」
 *
 * 登录成功后调用 authStore.login() 保存 token 并关闭弹窗。
 */

import { useState, useCallback, useRef } from 'react'
import { App, Modal, Input, Button } from 'antd'
import { MobileOutlined, SafetyOutlined } from '@ant-design/icons'
import { authApi } from '@/api'
import { useAuthStore } from '@/stores/authStore'
import { getErrorMessage } from '@/utils/error'
import styles from './index.module.scss'

// ─── 手机号格式校验 ────────────────────────────────────────────────────────────

function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone)
}

// ─── 组件 ─────────────────────────────────────────────────────────────────────

const LoginModal = () => {
  const { message } = App.useApp()
  const loginModalOpen = useAuthStore((s) => s.loginModalOpen)
  const closeLoginModal = useAuthStore((s) => s.closeLoginModal)
  const login = useAuthStore((s) => s.login)

  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [sendingCode, setSendingCode] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 重置状态
  const handleClose = useCallback(() => {
    setPhone('')
    setCode('')
    setStep('phone')
    setSendingCode(false)
    setLoggingIn(false)
    setCountdown(0)
    if (countdownRef.current) clearInterval(countdownRef.current)
    closeLoginModal()
  }, [closeLoginModal])

  // 开始倒计时
  const startCountdown = useCallback((seconds = 60) => {
    setCountdown(seconds)
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  // 发送验证码
  const handleSendCode = useCallback(async () => {
    if (!isValidPhone(phone)) {
      message.warning('请输入正确的手机号')
      return
    }
    setSendingCode(true)
    try {
      const res = await authApi.sendSmsCode(phone)
      const devCode = res.data?.code
      if (devCode) {
        // 开发模式：自动填入验证码并登录
        setCode(devCode)
        setStep('code')
        startCountdown(60)
        message.success('开发模式：验证码已自动填入，正在登录...')
        // 自动登录
        setLoggingIn(true)
        try {
          const loginRes = await authApi.loginByPhone(phone, devCode)
          if (loginRes.data) {
            const { user, tokens, isNewUser } = loginRes.data
            login(user, tokens)
            message.success(isNewUser ? '注册成功，欢迎使用Banyan！' : '登录成功，欢迎回来！')
          }
        } catch (loginErr) {
          message.error(getErrorMessage(loginErr))
        } finally {
          setLoggingIn(false)
        }
      } else {
        message.success('验证码已发送，请注意查收')
        setStep('code')
        startCountdown(60)
      }
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSendingCode(false)
    }
  }, [phone, startCountdown, login, message])

  // 重新发送
  const handleResend = useCallback(async () => {
    if (countdown > 0) return
    setSendingCode(true)
    try {
      await authApi.sendSmsCode(phone)
      message.success('验证码已重新发送')
      startCountdown(60)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSendingCode(false)
    }
  }, [phone, countdown, startCountdown, message])

  // 登录
  const handleLogin = useCallback(async () => {
    if (code.length !== 6) {
      message.warning('请输入 6 位验证码')
      return
    }
    setLoggingIn(true)
    try {
      const res = await authApi.loginByPhone(phone, code)
      if (res.data) {
        const { user, tokens, isNewUser } = res.data
        login(user, tokens)
        message.success(isNewUser ? '注册成功，欢迎使用Banyan！' : '登录成功，欢迎回来！')
      }
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setLoggingIn(false)
    }
  }, [phone, code, login, message])

  return (
    <Modal
      open={loginModalOpen}
      onCancel={handleClose}
      footer={null}
      width={400}
      centered
      className={styles.modal}
      maskClosable={!loggingIn}
    >
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.logo}>Banyan</div>
          <p className={styles.subtitle}>手机号登录 · 未注册自动创建账号</p>
        </div>

        <div className={styles.form}>
          {/* 手机号输入 */}
          <div className={styles.field}>
            <Input
              prefix={<MobileOutlined className={styles.inputIcon} />}
              placeholder="请输入手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              onPressEnter={step === 'phone' ? handleSendCode : undefined}
              disabled={step === 'code' || sendingCode}
              size="large"
              className={styles.input}
            />
          </div>

          {/* 验证码输入（第二步显示） */}
          {step === 'code' && (
            <div className={styles.field}>
              <Input
                prefix={<SafetyOutlined className={styles.inputIcon} />}
                placeholder="请输入 6 位验证码"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onPressEnter={handleLogin}
                disabled={loggingIn}
                size="large"
                className={styles.input}
                suffix={
                  <button
                    className={`${styles.resendBtn} ${countdown > 0 ? styles.resendBtnDisabled : ''}`}
                    onClick={handleResend}
                    disabled={countdown > 0 || sendingCode}
                  >
                    {countdown > 0 ? `${countdown}s 后重发` : '重新发送'}
                  </button>
                }
              />
            </div>
          )}

          {/* 操作按钮 */}
          {step === 'phone' ? (
            <Button
              type="primary"
              size="large"
              block
              loading={sendingCode}
              disabled={!isValidPhone(phone)}
              onClick={handleSendCode}
              className={styles.submitBtn}
            >
              获取验证码
            </Button>
          ) : (
            <Button
              type="primary"
              size="large"
              block
              loading={loggingIn}
              disabled={code.length !== 6}
              onClick={handleLogin}
              className={styles.submitBtn}
            >
              登录 / 注册
            </Button>
          )}
        </div>

        <p className={styles.tip}>登录即代表同意用户协议与隐私政策</p>
      </div>
    </Modal>
  )
}

export default LoginModal
