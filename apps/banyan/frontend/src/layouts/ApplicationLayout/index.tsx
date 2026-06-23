/**
 * ApplicationLayout
 *
 * 应用级嵌套路由容器，子页面通过 React Router Outlet 渲染：
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  ← 返回    [ ▶预览 | ✏编辑 ]  [ 数据库 ]  [ 云函数 ]    💾  🚀  │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │                                                                  │
 *   │   <Outlet />  （预览 / 画布 / 数据库 / 云函数 子页面内容）       │
 *   │                                                                  │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * 职责：
 *   - 加载并管理应用元数据（名称、描述），写入 applicationStore 供各处读取
 *   - 编排保存（handleSave）操作，渲染 <AppHeader/> 顶部栏
 *   - Tab 导航通过 React Router navigate 切换子路由
 *   - 画布位置是 Segmented（预览 | 编辑），对应 /preview 和 /ui 两个子路由
 *   - 数据库和云函数是独立子路由（/database、/functions）
 *   - 管理 PreviewServer 生命周期（应用级）
 *
 * 所有共享状态通过 useApplicationStore 读写。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Outlet } from 'react-router-dom'
import { App } from 'antd'
import { applicationApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { useApplicationStore } from '@/stores/applicationStore'
import { usePreviewServerStore } from '@/stores/previewServerStore'
import AppHeader from './components/AppHeader'
import styles from './index.module.scss'


const ApplicationLayout: React.FC = () => {
  const { id: application_id } = useParams<{ id: string }>()
  const { message } = App.useApp()

  // ── ApplicationStore ────────────────────────────────────────────────────────
  const {
    appName: applicationName,
    setAppName,
    requestFlush,
    reset: resetStore,
    load: loadStore,
  } = useApplicationStore()

  // ── 应用元数据（本地 description 状态，不进 store） ─────────────────────────
  const [applicationDescription, setApplicationDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(applicationName)
  const descRef = useRef(applicationDescription)
  nameRef.current = applicationName
  descRef.current = applicationDescription

  // ── 加载应用元数据 + 业务数据 ─────────────────────────────────────────────
  useEffect(() => {
    if (!application_id) return
    // 切换应用时重置 store
    resetStore()
    usePreviewServerStore.getState().reset()

    // 加载应用元数据（名称/描述）
    applicationApi.fetchApplication(application_id).then((res) => {
      const app = res.data!
      setAppName(app.name)
      setApplicationDescription(app.description || '')
    }).catch(() => {})

    // 加载业务数据（uiJSON/dataSchema/cloudFunctions）到 store
    loadStore(application_id)
  }, [application_id, setAppName, resetStore, loadStore])

  // ── Preview Server 生命周期管理（应用级） ─────────────────────────────────
  useEffect(() => {
    if (!application_id) return
    const store = usePreviewServerStore.getState()
    store.start(application_id)
    return () => { store.stop(application_id) }
  }, [application_id])

  // ── 保存应用 ──────────────────────────────────────────────────────────────
  // requestFlush 刷回画布态 → store.save 持久化业务数据 + 保存元数据（名称/描述）
  const handleSave = useCallback(async () => {
    if (!applicationName.trim()) {
      message.warning('请输入应用名称')
      return
    }
    if (!application_id) return
    setSaving(true)
    try {
      // 先将画布最新状态刷回 store（必须 await 以确保 uiJSON 已写入 store）
      await requestFlush()
      // 然后并行执行：持久化业务数据 + 保存元数据
      await Promise.all([
        useApplicationStore.getState().save(),
        applicationApi.updateApplication(application_id, {
          name: nameRef.current,
          description: descRef.current,
        }),
      ])
      message.success('已保存')
    } catch (error: unknown) {
      message.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }, [applicationName, application_id, requestFlush, message])

  return (
    <div className={styles.layout}>
      <AppHeader
        saving={saving}
        onSave={handleSave}
      />

      {/* ── 子页面内容（通过 Outlet 渲染当前路由对应的子页面） ── */}
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  )
}

export default ApplicationLayout
