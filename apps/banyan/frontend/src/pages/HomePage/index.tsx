/**
 * HomePage — 首页
 *
 * bolt.new 风格：全屏渐变背景，居中大输入框。
 * 输入 prompt 发送后：
 *   1. 创建空白应用
 *   2. 跳转到 /application/:id/ui，通过 location.state 携带 initialPrompt
 *   3. UIPage 挂载后自动触发 AiBar.sendPrompt
 *
 * 下方提供「查看已有应用」入口，跳转到 /applications 列表页。
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { message, Spin } from 'antd'
import {
  SendOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import { applicationApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import UserWidget from '@/components/UserWidget'
import LoginModal from '@/components/LoginModal'
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
  const navigate = useNavigate()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

      {/* ── 右上角用户组件 ── */}
      <div className={styles.topRight}>
        <UserWidget />
      </div>

      {/* ── 登录弹窗 ── */}
      <LoginModal />

      {/* ── 主体居中区 ── */}
      <div className={styles.hero}>
        <h1 className={styles.title}>
          <span className={styles.titleGradient}>班园</span>
          <span className={styles.titleSub}>用自然语言构建可视化应用</span>
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
            <span className={styles.hint}>Enter 发送 · Shift+Enter 换行</span>
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

        {/* 已有应用入口 */}
        <button
          className={styles.listEntryBtn}
          onClick={() => navigate('/applications')}
        >
          <AppstoreOutlined />
          <span>查看已有应用</span>
        </button>
      </div>
    </div>
  )
}

export default HomePage
