/**
 * TabCapsule — 顶部栏中间 Tab 胶囊
 *
 * 包含：
 *   - 画布区域 Segmented（预览 | 编辑），切换 /preview、/ui 子路由
 *   - 数据库 / 数据浏览 / 云函数 三个 Tab
 */

import React from 'react'
import { Tooltip } from 'antd'
import {
  DatabaseOutlined,
  FunctionOutlined,
  SearchOutlined,
  PlayCircleOutlined,
  EditOutlined,
} from '@ant-design/icons'
import styles from '../../index.module.scss'

interface TabCapsuleProps {
  activeTab: 'preview' | 'ui' | 'database' | 'data-browser' | 'functions'
  applicationId: string | undefined
  onNavigate: (path: string) => void
  onTabChange: (key: string) => void
}

const TabCapsule: React.FC<TabCapsuleProps> = ({ activeTab, applicationId, onNavigate, onTabChange }) => {
  return (
    <div className={styles.tabCapsule}>
      {/* 画布区域 Segmented：预览 | 编辑 */}
      <div className={styles.canvasSegmented}>
        <Tooltip title="预览应用">
          <button
            className={`${styles.segBtn} ${activeTab === 'preview' ? styles.segBtnActive : ''}`}
            onClick={() => {
              if (!applicationId) return
              onNavigate(`/application/${applicationId}/preview`)
            }}
          >
            <PlayCircleOutlined />
          </button>
        </Tooltip>
        <Tooltip title="编辑应用">
          <button
            className={`${styles.segBtn} ${activeTab === 'ui' ? styles.segBtnActive : ''}`}
            onClick={() => {
              if (!applicationId) return
              onNavigate(`/application/${applicationId}/ui`)
            }}
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
          onClick={() => onTabChange('database')}
        >
          <span className={styles.tabIcon}><DatabaseOutlined /></span>
        </button>
      </Tooltip>

      {/* 数据浏览 Tab */}
      <Tooltip title="数据浏览">
        <button
          className={`${styles.tabBtn} ${activeTab === 'data-browser' ? styles.tabBtnActive : ''}`}
          onClick={() => onTabChange('data-browser')}
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
          onClick={() => onTabChange('functions')}
        >
          <span className={styles.tabIcon}><FunctionOutlined /></span>
        </button>
      </Tooltip>
    </div>
  )
}

export default TabCapsule
