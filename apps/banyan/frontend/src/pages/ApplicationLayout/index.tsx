/**
 * ApplicationLayout
 *
 * 应用级嵌套路由容器，三个子页面（画布 / 数据库 / 云函数）共用此 Layout：
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  Tab 导航：[画布]  [数据库]  [云函数]                  │
 *   ├──────────────────────────────────────────────────────┤
 *   │                                                      │
 *   │   <Outlet />  （画布 / 数据库 / 云函数 子页面内容）     │
 *   │                                                      │
 *   └──────────────────────────────────────────────────────┘
 *   AiBar 固定在底部（fixed），跟随 content 水平位置，mode 随 Tab 切换
 *
 * AiBar mode 由当前路由决定：
 *   /application/:id           → canvas
 *   /application/:id/database  → database
 *   /application/:id/functions → functions
 */

import { createContext, useCallback, useContext, useRef } from 'react'
import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom'
import { Tabs } from 'antd'
import { AppstoreOutlined, DatabaseOutlined, FunctionOutlined } from '@ant-design/icons'
import AiBar from '@/components/AiBar'
import type { AiBarMode } from '@/components/AiBar'
import styles from './index.module.scss'

// ─── Layout Context：将回调下发给子页面 ──────────────────────────────────────

export interface ApplicationLayoutContext {
  /** AiBar canvas 模式 done 时，子页面注册的刷新回调 */
  setOnCanvasPagesUpdate: (fn: (pages: string[]) => void) => void
  /**
   * 画布子页面注册的「获取当前 pages」回调。
   * AiBar 在发送前调用，取得前端内存中最新的 pages 一并发送给 AI。
   */
  setGetCanvasPages: (fn: () => string[]) => void
  /** AiBar 定位锚点容器 ref（子页面用来对齐 AiBar 水平位置） */
  aiBarContainerRef: React.RefObject<HTMLDivElement | null>
}

export const AppLayoutCtx = createContext<ApplicationLayoutContext>({
  setOnCanvasPagesUpdate: () => {},
  setGetCanvasPages: () => {},
  aiBarContainerRef: { current: null },
})

export function useAppLayoutCtx() {
  return useContext(AppLayoutCtx)
}

// ─── Tab 定义 ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: '',           label: '画布',   icon: <AppstoreOutlined />,  mode: 'canvas'    as AiBarMode },
  { key: 'database',   label: '数据库', icon: <DatabaseOutlined />,  mode: 'database'  as AiBarMode },
  { key: 'functions',  label: '云函数', icon: <FunctionOutlined />,  mode: 'functions' as AiBarMode },
]

// ─── ApplicationLayout ────────────────────────────────────────────────────────

const ApplicationLayout: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const isNew = id === 'new' || !id

  // 从路由推导当前激活 Tab
  const activeTabKey = (() => {
    if (location.pathname.endsWith('/database')) return 'database'
    if (location.pathname.endsWith('/functions')) return 'functions'
    return ''
  })()

  const activeMode: AiBarMode = TABS.find((t) => t.key === activeTabKey)?.mode ?? 'canvas'

  // AiBar 定位锚点：整个内容区
  const contentRef = useRef<HTMLDivElement>(null)

  // canvas 模式 pages 更新回调（由 ApplicationDetail 子页面动态注入）
  const pagesUpdateCallbackRef = useRef<(pages: string[]) => void>(() => {})
  // canvas 模式「获取当前 pages」回调（由 ApplicationDetail 子页面动态注入）
  const getCanvasPagesRef = useRef<() => string[]>(() => [])

  const setOnCanvasPagesUpdate = useCallback((fn: (pages: string[]) => void) => {
    pagesUpdateCallbackRef.current = fn
  }, [])

  const setGetCanvasPages = useCallback((fn: () => string[]) => {
    getCanvasPagesRef.current = fn
  }, [])

  // AiBar onPagesUpdate 分发
  const handlePagesUpdate = useCallback((pages: string[]) => {
    if (activeMode === 'canvas') {
      pagesUpdateCallbackRef.current(pages)
    }
    // database / functions 模式：后续 AiBar 升级时在此扩展
  }, [activeMode])

  // AiBar getPages 分发
  const handleGetPages = useCallback((): string[] => {
    if (activeMode === 'canvas') {
      return getCanvasPagesRef.current()
    }
    // database / functions 模式暂时返回空数组，后续分别注入
    return []
  }, [activeMode])

  // Tab 切换
  const handleTabChange = useCallback((key: string) => {
    if (!id || isNew) return
    navigate(key === '' ? `/application/${id}` : `/application/${id}/${key}`)
  }, [id, isNew, navigate])

  // ─── 新建应用：无 Tab / 无 AiBar ─────────────────────────────────────────
  if (isNew) {
    return (
      <AppLayoutCtx.Provider value={{ setOnCanvasPagesUpdate, setGetCanvasPages, aiBarContainerRef: contentRef }}>
        <div className={styles.layout}>
          <div className={styles.content} ref={contentRef}>
            <Outlet />
          </div>
        </div>
      </AppLayoutCtx.Provider>
    )
  }

  // ─── 已有应用：Tab + AiBar ────────────────────────────────────────────────
  return (
    <AppLayoutCtx.Provider value={{ setOnCanvasPagesUpdate, setGetCanvasPages, aiBarContainerRef: contentRef }}>
      <div className={styles.layout}>
        {/* 顶部 Tab 导航 */}
        <div className={styles.tabBar}>
          <Tabs
            activeKey={activeTabKey}
            onChange={handleTabChange}
            size="small"
            className={styles.tabs}
            items={TABS.map((t) => ({
              key: t.key,
              label: (
                <span className={styles.tabLabel}>
                  {t.icon}
                  {t.label}
                </span>
              ),
            }))}
          />
        </div>

        {/* 子页面内容区 */}
        <div className={styles.content} ref={contentRef}>
          <Outlet />
        </div>

        {/* 应用级 AiBar：跨三个子页面，固定在底部 */}
        <AiBar
          appId={id!}
          mode={activeMode}
          getPages={handleGetPages}
          onPagesUpdate={handlePagesUpdate}
          onPagesSnapshot={activeMode === 'canvas' ? handlePagesUpdate : undefined}
          containerRef={contentRef}
        />
      </div>
    </AppLayoutCtx.Provider>
  )
}

export default ApplicationLayout
