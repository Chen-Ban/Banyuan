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

  const activeTab = deriveActiveTab(location.pathname)

  const nav = (segment: string) => {
    if (!applicationId) return
    navigate(`/application/${applicationId}/${segment}`)
  }

  return (
    <div className={styles.tabCapsule}>
      {/* 画布区域 Segmented：预览 | 编辑 */}
      <div className={styles.canvasSegmented}>
        <Tooltip title="预览应用">
          <button
            className={`${styles.segBtn} ${activeTab === 'preview' ? styles.segBtnActive : ''}`}
            onClick={() => nav('preview')}
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
      <Tooltip title="数据浏览">
        <button
          className={`${styles.tabBtn} ${activeTab === 'data-browser' ? styles.tabBtnActive : ''}`}
          onClick={() => nav('data-browser')}
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
