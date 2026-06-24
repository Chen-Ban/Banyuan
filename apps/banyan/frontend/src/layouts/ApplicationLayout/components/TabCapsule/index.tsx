/**
 * TabCapsule — 顶部栏中间 Tab 胶囊
 *
 * 包含：
 *   - 画布区域 Segmented（预览 | 编辑），切换 /preview、/ui 子路由
 *   - 数据库 / 数据浏览 / 云函数 三个 Tab
 *
 * 所有路由相关状态（activeTab / applicationId / navigate）均通过
 * react-router-dom hooks 内部自持，不依赖父组件传参。
 */

import React from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Tooltip } from 'antd'
import {
  DatabaseOutlined,
  FunctionOutlined,
  SearchOutlined,
  PlayCircleOutlined,
  EditOutlined,
} from '@ant-design/icons'
import { usePreviewServerStore } from '@/stores/previewServerStore'
import styles from '../../index.module.scss'

function deriveActiveTab(pathname: string): 'preview' | 'ui' | 'database' | 'data-browser' | 'functions' {
  if (pathname.endsWith('/database')) return 'database'
  if (pathname.endsWith('/data-browser')) return 'data-browser'
  if (pathname.endsWith('/functions')) return 'functions'
  if (pathname.endsWith('/ui')) return 'ui'
  return 'preview'
}

const TabCapsule: React.FC = () => {
  const { id: applicationId } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const serverInfo = usePreviewServerStore((s) => s.serverInfo)
  const serverStatus = usePreviewServerStore((s) => s.status)
  const serverError = usePreviewServerStore((s) => s.errorMessage)

  const activeTab = deriveActiveTab(location.pathname)

  const nav = (segment: string) => {
    if (!applicationId) return
    navigate(`/application/${applicationId}/${segment}`)
  }

  // 预览/数据浏览依赖 Preview Server，不可用时禁用但保留占位避免布局抖动
  const previewDisabled = !serverInfo
  const previewDisabledReason = serverStatus === 'error'
    ? `预览服务启动失败${serverError ? '：' + serverError : ''}`
    : '预览服务不可用'

  return (
    <div className={styles.tabCapsule}>
      {/* 画布区域 Segmented：预览 | 编辑 */}
      <div className={styles.canvasSegmented}>
        <Tooltip title={previewDisabled ? previewDisabledReason : '预览应用'}>
          <button
            className={`${styles.segBtn} ${activeTab === 'preview' ? styles.segBtnActive : ''} ${previewDisabled ? styles.segBtnDisabled : ''}`}
            onClick={() => { if (!previewDisabled) nav('preview') }}
            disabled={previewDisabled}
          >
            <PlayCircleOutlined />
          </button>
        </Tooltip>
        <Tooltip title="编辑应用">
          <button
            className={`${styles.segBtn} ${activeTab === 'ui' ? styles.segBtnActive : ''}`}
            onClick={() => nav('ui')}
          >
            <EditOutlined />
          </button>
        </Tooltip>
      </div>

      {/* 分隔线 */}
      <div className={styles.tabDivider} />

      {/* 数据库 Tab */}
      <Tooltip title="数据库">
        <button
          className={`${styles.tabBtn} ${activeTab === 'database' ? styles.tabBtnActive : ''}`}
          onClick={() => nav('database')}
        >
          <span className={styles.tabIcon}><DatabaseOutlined /></span>
        </button>
      </Tooltip>

      {/* 数据浏览 Tab */}
      <Tooltip title={previewDisabled ? previewDisabledReason : '数据浏览'}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'data-browser' ? styles.tabBtnActive : ''} ${previewDisabled ? styles.tabBtnDisabled : ''}`}
          onClick={() => { if (!previewDisabled) nav('data-browser') }}
          disabled={previewDisabled}
        >
          <span className={styles.tabIcon}><SearchOutlined /></span>
        </button>
      </Tooltip>

      {/* 分隔线（数据组 vs 云函数组） */}
      <div className={styles.tabDivider} />

      {/* 云函数 Tab */}
      <Tooltip title="云函数">
        <button
          className={`${styles.tabBtn} ${activeTab === 'functions' ? styles.tabBtnActive : ''}`}
          onClick={() => nav('functions')}
        >
          <span className={styles.tabIcon}><FunctionOutlined /></span>
        </button>
      </Tooltip>
    </div>
  )
}

export default TabCapsule
