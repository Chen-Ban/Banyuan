/**
 * HomePage — 首页
 *
 * bolt.new 风格：渐变背景，居中大输入框。
 * 输入 prompt 发送后：
 *   1. 创建空白应用
 *   2. 跳转到 /application/:id/ui，通过 location.state 携带 initialPrompt
 *   3. UIPage 挂载后自动触发 AiBar.sendPrompt
 *
 * 注：用户信息和登录弹窗已移至全局 RootLayout/Sidebar。
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Spin, Select } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { applicationApi, aiApi } from '@/api'
import type { ProviderInfo } from '@/api'
import { getErrorMessage } from '@/utils/error'
import styles from './index.module.scss'

// ── 示例提示词 ────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  '帮我做一个眼镜店 POS 收银系统',
  '设计一个任务管理看板，支持拖拽排序',
  '做一个餐厅点餐界面，有菜单和购物车',
  '创建一个数据大屏，展示销售趋势图表',
]

// ── 组件 ──────────────────────────────────────────────────────────────────────

const HomePage = () => {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // ── 模型选择 ────────────────────────────────────────────────────────────
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [activeProvider, setActiveProvider] = useState<string>('')

  useEffect(() => {
    aiApi
      .getModels()
      .then((data) => {
        setProviders(data?.providers ?? [])
        setActiveProvider(data?.activeProvider ?? '')
      })
      .catch(() => { /* 静默失败 */ })
  }, [])

  const handleModelChange = useCallback((provider: string) => {
    setActiveProvider(provider)
    aiApi.switchModel(provider).catch(() => { /* 静默失败 */ })
  }, [])

  // ── 自动撑高 textarea ────────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [prompt])

  // ── 发送 prompt ──────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const text = prompt.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      const res = await applicationApi.createApplication()
      const app = res.data!
      navigate(`/application/${app.application_id}/ui`, {
        state: { initialPrompt: text },
      })
    } catch (err) {
      message.error(getErrorMessage(err))
      setSubmitting(false)
    }
  }, [prompt, submitting, navigate])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const handleSuggestion = useCallback((text: string) => {
    setPrompt(text)
    textareaRef.current?.focus()
  }, [])

  const canSend = prompt.trim().length > 0 && !submitting

  return (
    <div className={styles.page}>
      {/* ── 背景装饰 ── */}
      <div className={styles.bgGlow} />

      {/* ── 主体居中区 ── */}
      <div className={styles.hero}>
        <h1 className={styles.title}>
          <span className={styles.titleGradient}>Banyan</span>
          <span className={styles.titleSub}>以画布为山石，以组件为草木，以数据为活水，以 AI 为匠心，造一方数字园林</span>
        </h1>

        {/* 输入框卡片 */}
        <div className={styles.inputCard}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            placeholder="描述你想要的应用，例如：帮我做一个眼镜店 POS 收银系统..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
            rows={1}
          />
          <div className={styles.inputFooter}>
            <div className={styles.footerLeft}>
              {providers.length > 0 && (
                <Select
                  size="small"
                  variant="borderless"
                  value={activeProvider}
                  onChange={handleModelChange}
                  popupMatchSelectWidth={false}
                  className={styles.modelSelect}
                  options={providers.map((p) => ({
                    value: p.provider,
                    label: p.model,
                  }))}
                />
              )}
            </div>
            <button
              className={`${styles.sendBtn} ${canSend ? styles.sendBtnActive : ''}`}
              onClick={handleSubmit}
              disabled={!canSend}
              aria-label="发送"
            >
              {submitting ? (
                <Spin size="small" />
              ) : (
                <SendOutlined />
              )}
            </button>
          </div>
        </div>

        {/* 示例提示词 */}
        <div className={styles.suggestions}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className={styles.suggestionChip}
              onClick={() => handleSuggestion(s)}
              disabled={submitting}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default HomePage
