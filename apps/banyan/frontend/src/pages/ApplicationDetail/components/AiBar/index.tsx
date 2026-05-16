/**
 * AiBar 组件
 *
 * 固定在画布区域底部的 AI 对话栏，UI 风格参考 CatDesk。
 *
 * 布局：
 *   ┌─────────────────────────────────────────────┐
 *   │  进度区（消息列表 + 流式文字，可折叠）          │
 *   ├─────────────────────────────────────────────┤
 *   │  ┌───────────────────────────────────────┐  │
 *   │  │  图片预览区（有图片时显示）              │  │
 *   │  │  文本域（多行，自动增高）                │  │
 *   │  ├───────────────────────────────────────┤  │
 *   │  │  底部工具栏          [发送 / 停止 按钮] │  │
 *   │  └───────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────┘
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { Spin, Image } from 'antd'
import { RobotOutlined, CloseOutlined, SendOutlined, StopOutlined } from '@ant-design/icons'
import { useXiangDi } from '@/hooks/useXiangDi'
import type { ProgressMessage } from '@/hooks/useXiangDi'
import styles from './index.module.scss'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AiBarProps {
  appId: string
  onPagesUpdate: (pages: string[]) => void
  /** canvasSection 容器的 ref，用于 fixed 定位时对齐水平位置 */
  containerRef: React.RefObject<HTMLDivElement | null>
}

// ─── 粘贴图片类型 ─────────────────────────────────────────────────────────────

interface PastedImage {
  id: string
  dataUrl: string
  name: string
}

// ─── AiBar ────────────────────────────────────────────────────────────────────

const AiBar: React.FC<AiBarProps> = ({ appId, onPagesUpdate, containerRef }) => {
  const [inputValue, setInputValue] = useState('')
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([])
  const [progressVisible, setProgressVisible] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const progressEndRef = useRef<HTMLDivElement>(null)

  // ─── fixed 定位：跟随 containerRef 的水平位置 ────────────────────────────
  const [fixedStyle, setFixedStyle] = useState<React.CSSProperties>({})

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const update = () => {
      const rect = container.getBoundingClientRect()
      setFixedStyle({ left: rect.left, width: rect.width })
    }

    update()

    const ro = new ResizeObserver(update)
    ro.observe(container)
    // 窗口 resize 时也更新（容器位置可能因侧边栏宽度变化而移动）
    window.addEventListener('resize', update)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [containerRef])

  const { loading, messages, currentText, sendPrompt, abort, clearMessages } = useXiangDi({
    appId,
    onDone: (pages) => onPagesUpdate(pages),
  })

  // 有消息时自动展开进度区
  useEffect(() => {
    if (messages.length > 0 || loading) setProgressVisible(true)
  }, [messages.length, loading])

  // 自动滚动进度区到底部
  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentText])

  // textarea 自动增高
  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  useEffect(() => {
    autoResize()
  }, [inputValue, autoResize])

  // 处理粘贴（支持图片）
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items)
    const imageItems = items.filter((item) => item.type.startsWith('image/'))
    if (imageItems.length === 0) return

    e.preventDefault()
    imageItems.forEach((item) => {
      const file = item.getAsFile()
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string
        setPastedImages((prev) => [
          ...prev,
          { id: `img_${Date.now()}_${Math.random()}`, dataUrl, name: file.name || 'image' },
        ])
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const removeImage = useCallback((id: string) => {
    setPastedImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  const handleSend = useCallback(() => {
    const prompt = inputValue.trim()
    if ((!prompt && pastedImages.length === 0) || loading) return
    setInputValue('')
    setPastedImages([])
    sendPrompt(prompt)
  }, [inputValue, pastedImages, loading, sendPrompt])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleClose = useCallback(() => {
    setProgressVisible(false)
    clearMessages()
  }, [clearMessages])

  const canSend = (inputValue.trim().length > 0 || pastedImages.length > 0) && !loading

  return (
    <div className={styles.aiBar} style={fixedStyle}>
      {/* 进度区 */}
      {progressVisible && (
        <div className={styles.progressPanel}>
          <div className={styles.progressHeader}>
            <span className={styles.progressTitle}>
              <RobotOutlined /> AI 助手
            </span>
            <button className={styles.closeBtn} onClick={handleClose} aria-label="关闭">
              <CloseOutlined />
            </button>
          </div>
          <div className={styles.progressBody}>
            {loading && currentText && (
              <div className={styles.streamingText}>{currentText}</div>
            )}
            {messages.map((msg) => (
              <ProgressItem key={msg.id} message={msg} />
            ))}
            {loading && messages.length === 0 && !currentText && (
              <div className={styles.loadingPlaceholder}>
                <Spin size="small" />
                <span>AI 正在思考...</span>
              </div>
            )}
            <div ref={progressEndRef} />
          </div>
        </div>
      )}

      {/* 输入框容器 */}
      <div className={styles.inputWrapper}>
        {/* 图片预览区 —— 用 antd Image.PreviewGroup 支持点击放大 + 多图切换 */}
        {pastedImages.length > 0 && (
          <div className={styles.imagePreviewRow}>
            <Image.PreviewGroup>
              {pastedImages.map((img) => (
                <div key={img.id} className={styles.imageThumb}>
                  <Image
                    src={img.dataUrl}
                    alt={img.name}
                    width={60}
                    height={60}
                    style={{ objectFit: 'cover', borderRadius: 7, display: 'block' }}
                    preview={{ mask: false }}
                  />
                  <button
                    className={styles.imageRemoveBtn}
                    onClick={() => removeImage(img.id)}
                    aria-label="移除图片"
                  >
                    <CloseOutlined />
                  </button>
                </div>
              ))}
            </Image.PreviewGroup>
          </div>
        )}

        {/* 文本域 */}
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="描述你想要的界面，可粘贴图片..."
          rows={1}
          disabled={loading}
        />

        {/* 底部工具栏 */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft} />
          <div className={styles.toolbarRight}>
            {loading ? (
              <button
                className={`${styles.actionBtn} ${styles.stopBtn}`}
                onClick={abort}
                aria-label="停止"
              >
                <StopOutlined />
              </button>
            ) : (
              <button
                className={`${styles.actionBtn} ${styles.sendBtn} ${canSend ? styles.sendBtnActive : ''}`}
                onClick={handleSend}
                disabled={!canSend}
                aria-label="发送"
              >
                <SendOutlined />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ProgressItem ─────────────────────────────────────────────────────────────

const ProgressItem: React.FC<{ message: ProgressMessage }> = ({ message }) => {
  const cls = [
    styles.progressItem,
    message.type === 'error' || message.isError ? styles.progressItemError : '',
    message.type === 'done' ? styles.progressItemDone : '',
    message.type === 'tool_call' ? styles.progressItemTool : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cls}>
      {message.type === 'tool_call' && (
        <Spin size="small" className={styles.toolSpinner} />
      )}
      <span className={styles.progressContent}>{message.content}</span>
    </div>
  )
}

export default AiBar
