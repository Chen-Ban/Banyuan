/**
 * CloudFunctionMode 组件
 *
 * 当用户在 Functions Tab 中点击"AI 生成"时，AiBar 切换到云函数生成上下文。
 * 对话结果定向写入 Functions Tab。
 *
 * 包含：
 *   - 模式标识 UI（显示当前处于云函数生成模式）
 *   - 输入框（描述函数功能）
 *   - 生成按钮
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Button, Spin } from 'antd'
import { ThunderboltOutlined, CloseOutlined, SendOutlined } from '@ant-design/icons'
import styles from './CloudFunctionMode.module.scss'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CloudFunctionResult {
  name: string
  code: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

export interface CloudFunctionModeProps {
  /** 是否可见 */
  visible: boolean
  /** 是否正在生成中 */
  loading: boolean
  /** 关闭云函数模式 */
  onClose: () => void
  /** 提交生成请求 */
  onGenerate: (description: string) => void
  /** 生成结果（由父组件传入） */
  result?: CloudFunctionResult | null
  /** 生成过程中的流式文本 */
  streamingText?: string
  /** 错误信息 */
  error?: string | null
}

// ─── CloudFunctionMode ────────────────────────────────────────────────────────

const CloudFunctionMode: React.FC<CloudFunctionModeProps> = ({
  visible,
  loading,
  onClose,
  onGenerate,
  streamingText,
  error,
}) => {
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // textarea 自动增高
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [inputValue])

  const handleSend = useCallback(() => {
    const description = inputValue.trim()
    if (!description || loading) return
    onGenerate(description)
  }, [inputValue, loading, onGenerate])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  if (!visible) return null

  return (
    <div className={styles.container}>
      {/* 模式标识 */}
      <div className={styles.modeHeader}>
        <div className={styles.modeIndicator}>
          <ThunderboltOutlined className={styles.modeIcon} />
          <span className={styles.modeLabel}>云函数生成模式</span>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="退出云函数模式">
          <CloseOutlined />
        </button>
      </div>

      {/* 流式输出区域 */}
      {(loading || streamingText) && (
        <div className={styles.streamingArea}>
          {loading && !streamingText && (
            <div className={styles.loadingHint}>
              <Spin size="small" />
              <span>AI 正在生成云函数...</span>
            </div>
          )}
          {streamingText && (
            <pre className={styles.streamingText}>{streamingText}</pre>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {error && <div className={styles.errorHint}>{error}</div>}

      {/* 输入区域 */}
      <div className={styles.inputArea}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你想要的云函数功能，如：查询所有未完成的订单并按时间排序..."
          rows={1}
          disabled={loading}
        />
        <Button
          className={styles.sendBtn}
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          disabled={!inputValue.trim() || loading}
          size="small"
        >
          生成
        </Button>
      </div>
    </div>
  )
}

export default CloudFunctionMode
