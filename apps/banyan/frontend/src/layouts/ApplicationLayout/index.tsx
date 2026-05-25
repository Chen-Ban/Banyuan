/**
 * ApplicationLayout
 *
 * 应用级嵌套路由容器，三个子页面（画布 / 数据库 / 云函数）共用此 Layout：
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  ← 应用名  描述          💾  🚀  │  [画布]  [数据库]  [云函数]   │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │                                                                  │
 *   │   <Outlet />  （画布 / 数据库 / 云函数 子页面内容）               │
 *   │                                                                  │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * 应用级操作（返回、命名、保存、生成应用）统一在此层处理，
 * 子页面通过 AppLayoutCtx.registerGetPages 向上注册画布序列化函数，
 * 供 handleSave / handleBuild 调用。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useNavigate, useParams, useLocation } from 'react-router-dom'
import { Button, Tabs, Tooltip, message } from 'antd'
import {
  ArrowLeftOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  FunctionOutlined,
  SaveOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { version as canvasVersion } from '@banyuan/banyan-sdk'
import { applicationApi, buildApi } from '@/api'
import type { Platform } from '@/api'
import { getErrorMessage } from '@/utils/error'
import BuildTaskModal from '@/components/BuildTaskModal'
import { AppLayoutCtx } from './AppLayoutCtx'
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

  // ── getPages 回调注册（由 UIPage 注册，非画布页时为 null） ─────────────────
  const getPagesRef = useRef<(() => string[]) | null>(null)

  const registerGetPages = useCallback((fn: () => string[]) => {
    getPagesRef.current = fn
  }, [])

  const unregisterGetPages = useCallback(() => {
    getPagesRef.current = null
  }, [])

  // ── 加载应用元数据 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!application_id) return
    applicationApi.fetchApplication(application_id).then((res) => {
      const app = res.data!
      setApplicationName(app.name)
      setApplicationDescription(app.description || '')
    }).catch(() => {})
  }, [application_id])

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

  // ── 返回 ──────────────────────────────────────────────────────────────────
  const handleBack = useCallback(() => navigate('/'), [navigate])

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
    triggerAutoSaveMeta()
  }, [triggerAutoSaveMeta])

  const handleDescChange = useCallback((value: string) => {
    setApplicationDescription(value)
    triggerAutoSaveMeta()
  }, [triggerAutoSaveMeta])

  // ── 保存应用 ──────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!applicationName.trim()) {
      message.warning('请输入应用名称')
      return
    }
    if (!application_id) return
    setSaving(true)
    try {
      const pages = getPagesRef.current?.() ?? []
      await applicationApi.updateApplication(application_id, {
        name: nameRef.current,
        description: descRef.current,
        ...(pages.length > 0 ? { pages } : {}),
      })
      message.success('应用已保存')
    } catch (error: unknown) {
      message.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }, [applicationName, application_id])

  // ── 生成应用 ──────────────────────────────────────────────────────────────
  const handleBuild = useCallback(async () => {
    if (!applicationName.trim()) {
      message.warning('请先输入应用名称')
      return
    }
    if (!getPagesRef.current) {
      message.warning('请先切换到画布页再生成应用')
      return
    }
    setBuildSubmitting(true)
    try {
      const serializedPages = getPagesRef.current()
      const appJson = JSON.stringify(serializedPages)
      const platform: Platform = navigator.platform.toLowerCase().includes('mac')
        ? 'mac'
        : navigator.platform.toLowerCase().includes('linux')
          ? 'linux'
          : 'win'
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

  return (
    <AppLayoutCtx.Provider value={{ registerGetPages, unregisterGetPages }}>
      <div className={styles.layout}>

        {/* ── AppHeader：应用级操作区 ── */}
        <div className={styles.appHeader}>
          <Button
            type="text"
            size="small"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            className={styles.backBtn}
          />
          <div className={styles.infoFields}>
            <input
              className={styles.nameInput}
              placeholder="未命名应用"
              value={applicationName}
              onChange={(e) => handleNameChange(e.target.value)}
            />
            <input
              className={styles.descInput}
              placeholder="添加描述..."
              value={applicationDescription}
              onChange={(e) => handleDescChange(e.target.value)}
            />
          </div>
          <div className={styles.headerActions}>
            <Tooltip title="保存应用">
              <Button
                type="text"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={handleSave}
                className={styles.actionBtn}
              />
            </Tooltip>
            <Tooltip title="生成应用">
              <Button
                type="text"
                icon={<RocketOutlined />}
                loading={buildSubmitting}
                onClick={handleBuild}
                className={styles.actionBtn}
              />
            </Tooltip>
          </div>

          {/* 竖线分割 */}
          <div className={styles.divider} />

          {/* Tab 导航（内联在 header 中） */}
          <Tabs
            activeKey={activeTabKey}
            onChange={handleTabChange}
            size="small"
            className={styles.headerTabs}
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

        {/* ── 子页面内容 ── */}
        <div className={styles.content}>
          <Outlet />
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
