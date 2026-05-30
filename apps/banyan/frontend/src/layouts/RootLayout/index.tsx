/**
 * RootLayout — 全局左右布局容器
 *
 * 所有页面共享此布局：
 *   ┌──────────────┬──────────────────────────────────────────────┐
 *   │  Sidebar     │  <Outlet /> 右侧内容区                       │
 *   │  (260px)     │                                              │
 *   └──────────────┴──────────────────────────────────────────────┘
 *
 * 根据当前路由自动判断 Sidebar 的显示模式：
 *   - nav：首页 / 列表页 → 品牌文案 + 用户卡片 + 导航菜单
 *   - settings：设置页 → 面包屑 + 用户信息 + 设置项列表
 *   - app：应用编辑态 → 面包屑 + 用户信息 + AiBar（进度面板 + 聊天框）
 *
 * AiBar 单例：
 *   - RootLayout 在 sidebarMode === 'app' 时渲染唯一的 <AiBar>
 *   - appId 直接从路由参数 :id 取，无需子组件传递
 *   - AiBar 发送前通过 appEvents.emitSaveApp() 触发保存，UIPage 订阅后执行序列化
 *   - UIPage 通过 registerAiCallbacks 注册 onDone / onAppSnapshot，
 *     RootLayout 用稳定包装函数转发，避免 AiBar 实例重建
 *   - 切换 Tab 时 AiBar 实例不销毁，对话历史得以保留
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useParams } from 'react-router-dom'
import Sidebar from './Sidebar'
import LoginModal from '@/components/LoginModal'
import AiBar, { type AiBarHandle } from '@/components/AiBar'
import { appEvents } from '@/utils/appEvents'
import { RootLayoutCtx, type SidebarMode, type AiCallbacks } from './RootLayoutCtx'
import styles from './index.module.scss'

const RootLayout: React.FC = () => {
  const location = useLocation()
  const { id: appId } = useParams<{ id: string }>()

  const sidebarMode: SidebarMode = useMemo(() => {
    if (appId || location.pathname.startsWith('/application/')) {
      return 'app'
    }
    if (location.pathname.startsWith('/settings')) {
      return 'settings'
    }
    return 'nav'
  }, [location.pathname, appId])

  // ── 应用名称（ApplicationLayout 写入，Sidebar 面包屑读取） ──────────────────
  const [appName, setAppName] = useState('')

  // ── AiBar 画布回调（由 UIPage 注册） ──────────────────────────────────────
  // 用 ref 存储，稳定包装函数转发，避免 AiBar 因回调变化而重建
  const aiCallbacksRef = useRef<AiCallbacks>({})

  const registerAiCallbacks = useCallback((cbs: AiCallbacks) => {
    aiCallbacksRef.current = cbs
  }, [])

  const unregisterAiCallbacks = useCallback(() => {
    aiCallbacksRef.current = {}
  }, [])

  const stableOnAppSnapshot = useCallback((appJSON: string) => {
    aiCallbacksRef.current.onAppSnapshot?.(appJSON)
  }, [])

  const stableOnDone = useCallback((appJSON: string) => {
    aiCallbacksRef.current.onDone?.(appJSON)
  }, [])

  // ── AiBar handle（forwardRef 暴露，UIPage 用于 sendPrompt） ───────────────
  const aiBarRef = useRef<AiBarHandle>(null)
  const [aiBarHandle, setAiBarHandle] = useState<AiBarHandle | null>(null)

  const handleAiBarRef = useCallback((handle: AiBarHandle | null) => {
    if (handle !== aiBarRef.current) {
      ;(aiBarRef as React.MutableRefObject<AiBarHandle | null>).current = handle
      setAiBarHandle(handle)
    }
  }, [])

  // ── AiBar 节点（稳定引用，仅 appId 变化时重建） ───────────────────────────
  const aiBarNode = useMemo(() => {
    if (!appId) return null
    return (
      <AiBar
        ref={handleAiBarRef}
        appId={appId}
        onBeforeSend={appEvents.emitSaveApp}
        onAppSnapshot={stableOnAppSnapshot}
        onDone={stableOnDone}
      />
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, handleAiBarRef, stableOnAppSnapshot, stableOnDone])

  return (
    <RootLayoutCtx.Provider value={{
      sidebarMode,
      appName,
      setAppName,
      registerAiCallbacks,
      unregisterAiCallbacks,
      aiBarHandle,
      aiBarNode,
    }}>
      <div className={styles.root}>
        <aside className={`${styles.sidebar}${sidebarMode === 'app' ? ` ${styles.sidebarApp}` : ''}`}>
          <Sidebar mode={sidebarMode} />
        </aside>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
      <LoginModal />
    </RootLayoutCtx.Provider>
  )
}

export default RootLayout
