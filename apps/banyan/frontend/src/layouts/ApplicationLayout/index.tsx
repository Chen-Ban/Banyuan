/**
 * ApplicationLayout
 *
 * 应用级嵌套路由容器，三个子页面（画布 / 数据库 / 云函数）共用此 Layout：
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  应用名  描述          💾  🚀  │  [画布]  [数据库]  [云函数]      │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │                                                                  │
 *   │   <Outlet />  （画布 / 数据库 / 云函数 子页面内容）               │
 *   │                                                                  │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * 职责：
 *   - 加载并管理应用元数据（名称、描述），写入 AppLayoutCtx 供 Sidebar 面包屑读取
 *   - 提供保存（handleSave）和生成应用（handleBuild）操作
 *   - handleSave：发布 appEvents.saveApp 事件，UIPage 订阅后负责序列化 appJSON 并写 DB；
 *     ApplicationLayout 自身只负责保存 name / description
 *   - 通过 AppLayoutCtx.registerGetApp 接收 UIPage 注册的序列化函数（供 handleBuild 使用）
 *
 * 注：AiBar 单例已提升到 RootLayout 层，本组件不再持有任何 AiBar 相关逻辑。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { App, Dropdown, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  DatabaseOutlined,
  FunctionOutlined,
  SaveOutlined,
  RocketOutlined,
  ArrowLeftOutlined,
  GlobalOutlined,
  DesktopOutlined,
  AppleOutlined,
  AndroidOutlined,
} from '@ant-design/icons'
import { version as canvasVersion } from '@banyuan/banvasgl'
import { applicationApi, buildApi } from '@/api'
import type { Platform } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { appEvents } from '@/utils/appEvents'
import BuildTaskModal from '@/components/BuildTaskModal'
import UIPage from '@/pages/UIPage'
import DatabasePage from '@/pages/DatabasePage'
import FunctionsPage from '@/pages/FunctionsPage'
import { AppLayoutCtx } from './AppLayoutCtx'
import { useRootLayoutCtx } from '@/layouts/RootLayout/RootLayoutCtx'
import styles from './index.module.scss'

const TABS = [
  { key: 'ui',        label: '画布',   icon: <AppstoreOutlined /> },
  { key: 'database',  label: '数据库', icon: <DatabaseOutlined /> },
  { key: 'functions', label: '云函数', icon: <FunctionOutlined /> },
]

const AUTO_SAVE_DELAY = 800

const ApplicationLayout: React.FC = () => {
  const { id: application_id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()

  // ── 应用元数据 ────────────────────────────────────────────────────────────
  const [applicationName, setApplicationName] = useState('')
  const [applicationDescription, setApplicationDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(applicationName)
  const descRef = useRef(applicationDescription)
  nameRef.current = applicationName
  descRef.current = applicationDescription

  // ── 构建相关 ──────────────────────────────────────────────────────────────
  const [buildModalOpen, setBuildModalOpen] = useState(false)
  const [buildTaskId, setBuildTaskId] = useState<string | null>(null)
  const [buildSubmitting, setBuildSubmitting] = useState(false)

  // ── 画布尺寸（由 UIPage 通过 ctx 同步，供 handleBuild 使用） ──────────────
  const canvasSizeRef = useRef({ width: 1280, height: 800 })

  // ── getApp 回调注册（由 UIPage 注册，供 handleBuild 序列化） ─────────────
  const getAppRef = useRef<(() => string) | null>(null)

  const registerGetApp = useCallback((fn: () => string) => {
    getAppRef.current = fn
  }, [])

  const unregisterGetApp = useCallback(() => {
    getAppRef.current = null
  }, [])

  // ── 同步应用名称到 RootLayoutCtx（供 Sidebar 面包屑读取） ──────────────────
  const { setAppName: setRootAppName } = useRootLayoutCtx()

  // ── 加载应用元数据 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!application_id) return
    applicationApi.fetchApplication(application_id).then((res) => {
      const app = res.data!
      setApplicationName(app.name)
      setApplicationDescription(app.description || '')
      setRootAppName(app.name)
    }).catch(() => {})
  }, [application_id, setRootAppName])

  // ── Tab 导航 ──────────────────────────────────────────────────────────────
  const activeTabKey = (() => {
    if (location.pathname.endsWith('/database')) return 'database'
    if (location.pathname.endsWith('/functions')) return 'functions'
    return 'ui'
  })()

  const handleTabChange = useCallback((key: string) => {
    if (!application_id) return
    navigate(`/application/${application_id}/${key}`)
  }, [navigate, application_id])

  // ── 自动保存名称/描述（debounce） ─────────────────────────────────────────
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerAutoSaveMeta = useCallback(() => {
    if (!application_id) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await applicationApi.updateApplication(application_id, {
          name: nameRef.current,
          description: descRef.current,
        })
      } catch {
        // 静默失败
      }
    }, AUTO_SAVE_DELAY)
  }, [application_id])

  useEffect(() => () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
  }, [])

  const handleNameChange = useCallback((value: string) => {
    setApplicationName(value)
    setRootAppName(value)
    triggerAutoSaveMeta()
  }, [triggerAutoSaveMeta, setRootAppName])

  // ── 保存应用 ──────────────────────────────────────────────────────────────
  // 发布 saveApp 事件 → UIPage 订阅后序列化 appJSON 并写 DB
  // ApplicationLayout 自身只负责保存 name / description（元数据）
  const handleSave = useCallback(async () => {
    if (!applicationName.trim()) {
      message.warning('请输入应用名称')
      return
    }
    if (!application_id) return
    setSaving(true)
    try {
      await Promise.all([
        // 1. 通知各子页面保存自身数据（UIPage 序列化 appJSON 写 DB）
        appEvents.emitSaveApp(),
        // 2. 保存元数据（name / description）
        applicationApi.updateApplication(application_id, {
          name: nameRef.current,
          description: descRef.current,
        }),
      ])
      message.success('应用已保存')
    } catch (error: unknown) {
      message.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }, [applicationName, application_id])

  // ── 生成应用 ──────────────────────────────────────────────────────────────
  const handleBuild = useCallback(async (platform: Platform) => {
    if (!applicationName.trim()) {
      message.warning('请先输入应用名称')
      return
    }
    if (!getAppRef.current) {
      message.warning('请先切换到画布页再生成应用')
      return
    }
    setBuildSubmitting(true)
    try {
      const appJson = getAppRef.current()
      const { width, height } = canvasSizeRef.current
      const res = await buildApi.submitBuild({
        appJson,
        appName: applicationName,
        platform,
        width,
        height,
        canvasVersion: canvasVersion ?? 'unknown',
      })
      setBuildTaskId(res.taskId)
      setBuildModalOpen(true)
      message.success('构建任务已提交')
    } catch (error: unknown) {
      message.error(getErrorMessage(error))
    } finally {
      setBuildSubmitting(false)
    }
  }, [applicationName])

  // ── 生成应用下拉菜单 ────────────────────────────────────────────────────────
  const buildMenuItems: MenuProps['items'] = [
    { key: 'web', icon: <GlobalOutlined />, label: '网页', onClick: () => handleBuild('web' as Platform) },
    { key: 'desktop', icon: <DesktopOutlined />, label: '桌面客户端', onClick: () => handleBuild(navigator.platform.toLowerCase().includes('mac') ? 'mac' : navigator.platform.toLowerCase().includes('linux') ? 'linux' : 'win') },
    { key: 'ios', icon: <AppleOutlined />, label: 'iOS', onClick: () => handleBuild('ios' as Platform) },
    { key: 'android', icon: <AndroidOutlined />, label: 'Android', onClick: () => handleBuild('android' as Platform) },
  ]

  return (
    <AppLayoutCtx.Provider value={{
      registerGetApp,
      unregisterGetApp,
      appName: applicationName,
      onAppRename: handleNameChange,
    }}>
      <div className={styles.layout}>

        {/* ── AppHeader：应用级工具栏 ── */}
        <div className={styles.appHeader}>
          {/* 左侧：返回首页按钮 */}
          <Tooltip title="返回首页">
            <button
              className={styles.backBtn}
              onClick={() => navigate('/')}
              aria-label="返回首页"
            >
              <ArrowLeftOutlined />
            </button>
          </Tooltip>

          {/* 左侧弹性占位 */}
          <div className={styles.headerSpacer} />

          {/* 胶囊一：Tab 导航（画布 / 数据库 / 云函数） */}
          <div className={styles.tabCapsule}>
            {TABS.map((t) => (
              <Tooltip key={t.key} title={t.label}>
                <button
                  className={`${styles.tabBtn} ${activeTabKey === t.key ? styles.tabBtnActive : ''}`}
                  onClick={() => handleTabChange(t.key)}
                >
                  <span className={styles.tabIcon}>{t.icon}</span>
                </button>
              </Tooltip>
            ))}
          </div>

          {/* 右侧弹性占位 */}
          <div className={styles.headerSpacer} />

          {/* 胶囊二：操作（保存 / 生成应用） */}
          <div className={styles.actionCapsule}>
            <Tooltip title="保存应用">
              <button
                className={styles.actionBtn}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <span className={styles.actionSpinner} /> : <SaveOutlined />}
              </button>
            </Tooltip>
            <div className={styles.capsuleDivider} />
            <Dropdown
              menu={{ items: buildMenuItems }}
              trigger={['hover']}
              placement="bottomRight"
            >
              <button
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                disabled={buildSubmitting}
              >
                {buildSubmitting ? <span className={styles.actionSpinner} /> : <RocketOutlined />}
              </button>
            </Dropdown>
          </div>
        </div>

        {/* ── 子页面内容（KeepAlive：同时渲染，display 切换） ── */}
        <div className={styles.content} style={{ display: activeTabKey === 'ui' ? 'flex' : 'none' }}>
          <UIPage />
        </div>
        <div className={styles.content} style={{ display: activeTabKey === 'database' ? 'flex' : 'none' }}>
          <DatabasePage />
        </div>
        <div className={styles.content} style={{ display: activeTabKey === 'functions' ? 'flex' : 'none' }}>
          <FunctionsPage />
        </div>

      </div>

      <BuildTaskModal
        open={buildModalOpen}
        onClose={() => setBuildModalOpen(false)}
        taskId={buildTaskId}
      />
    </AppLayoutCtx.Provider>
  )
}

export default ApplicationLayout
