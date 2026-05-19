/**
 * AiBar 组件
 *
 * 固定在内容区底部的应用级 AI 对话栏，跨画布 / 数据库 / 云函数三个子页面。
 *
 * 布局：
 *   ┌─────────────────────────────────────────────┐
 *   │  进度区（消息列表 + 流式文字，可折叠）          │
 *   ├─────────────────────────────────────────────┤
 *   │  ┌───────────────────────────────────────┐  │
 *   │  │  图片预览区（有图片时显示）              │  │
 *   │  │  文本域（多行，自动增高）                │  │
 *   │  ├───────────────────────────────────────┤  │
 *   │  │  模式标签  模型选择    [发送 / 停止 按钮]│  │
 *   │  └───────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────┘
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { Spin, Image, Select, Tag } from 'antd'
import {
  RobotOutlined,
  CloseOutlined,
  SendOutlined,
  StopOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  FunctionOutlined,
} from '@ant-design/icons'
import { useXiangDi } from '@/hooks/useXiangDi'
import type { ProgressMessage } from '@/hooks/useXiangDi'
import { aiApi } from '@/api'
import type { DisambiguationOptions, ProviderInfo } from '@/api'
import DisambiguationPanel from '@/components/DisambiguationPanel'
import styles from './index.module.scss'

// ─── 模式定义 ─────────────────────────────────────────────────────────────────

export type AiBarMode = 'canvas' | 'database' | 'functions'

interface ModeConfig {
  label: string
  placeholder: string
  color: string
  icon: React.ReactNode
}

const MODE_CONFIG: Record<AiBarMode, ModeConfig> = {
  canvas: {
    label: '画布',
    placeholder: '描述你想要的界面，可粘贴图片...',
    color: '#1677ff',
    icon: <AppstoreOutlined />,
  },
  database: {
    label: '数据库',
    placeholder: '描述你需要的数据结构，AI 将生成 Schema...',
    color: '#52c41a',
    icon: <DatabaseOutlined />,
  },
  functions: {
    label: '云函数',
    placeholder: '描述云函数的功能，AI 将生成函数 Flow...',
    color: '#722ed1',
    icon: <FunctionOutlined />,
  },
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AiBarProps {
  appId: string
  /** 当前所在页面模式，决定 AI 的操作上下文 */
  mode?: AiBarMode
  /**
   * 获取当前最新 pages 的回调。
   * AiBar 在发送请求时调用，将当前内存状态随流一并发送给 AI。
   */
  getPages: () => string[]
  onPagesUpdate: (pages: string[]) => void
  /** 写操作工具执行完毕后实时推送当前 pages，用于画布实时更新 */
  onPagesSnapshot?: (pages: string[]) => void
  /** 容器的 ref，用于 fixed 定位时对齐水平位置 */
  containerRef: React.RefObject<HTMLDivElement | null>
}

// ─── 粘贴图片类型 ─────────────────────────────────────────────────────────────

interface PastedImage {
  id: string
  dataUrl: string
  name: string
}

// ─── AiBar ────────────────────────────────────────────────────────────────────

const AiBar: React.FC<AiBarProps> = ({
  appId,
  mode = 'canvas',
  getPages,
  onPagesUpdate,
  onPagesSnapshot,
  containerRef,
}) => {
  const modeConfig = MODE_CONFIG[mode]

  const [inputValue, setInputValue] = useState('')
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([])
  const [progressVisible, setProgressVisible] = useState(false)
  const [disambiguationState, setDisambiguationState] = useState<DisambiguationOptions | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const progressEndRef = useRef<HTMLDivElement>(null)

  // ─── 模型选择 ──────────────────────────────────────────────────────────────
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [activeProvider, setActiveProvider] = useState<string>('')

  useEffect(() => {
    aiApi.getModels()
      .then((data) => {
        setProviders(data.providers)
        setActiveProvider(data.activeProvider)
      })
      .catch(() => { /* 静默失败，不影响主流程 */ })
  }, [])

  const handleModelChange = useCallback((provider: string) => {
    setActiveProvider(provider)
    aiApi.switchModel(provider).catch(() => { /* 静默失败 */ })
  }, [])

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
    window.addEventListener('resize', update)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [containerRef])

  const { loading, messages, currentText, sendPrompt, abort, clearMessages, respondToDisambiguation } = useXiangDi({
    appId,
    getPages,
    onDone: (pages) => onPagesUpdate(pages),
    onPagesSnapshot,
    onDisambiguation: (options) => setDisambiguationState(options),
  })

  const handleDisambiguationSelect = useCallback(async (choiceId: string) => {
    await respondToDisambiguation(choiceId)
    setDisambiguationState(null)
  }, [respondToDisambiguation])

  useEffect(() => {
    if (messages.length > 0 || loading) setProgressVisible(true)
  }, [messages.length, loading])

  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentText])

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [])

  useEffect(() => {
    autoResize()
  }, [inputValue, autoResize])

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
            {disambiguationState && (
              <DisambiguationPanel
                options={disambiguationState}
                onSelect={handleDisambiguationSelect}
              />
            )}
            {loading && messages.length === 0 && !currentText && !disambiguationState && (
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

        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={modeConfig.placeholder}
          rows={1}
          disabled={loading}
        />

        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            {/* 当前模式标签 */}
            <Tag
              icon={modeConfig.icon}
              color={modeConfig.color}
              className={styles.modeTag}
            >
              {modeConfig.label}
            </Tag>

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
