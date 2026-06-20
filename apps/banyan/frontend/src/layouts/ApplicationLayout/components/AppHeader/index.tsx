/**
 * AppHeader — 应用级顶部工具栏
 *
 * 编排顶部栏的各区块：
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  ← 返回   机型   ··   [▶预览|✏编辑] [数据库][数据浏览][云函数]  ··  💾 🚀 │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * 自身只负责返回按钮、保存按钮和布局，机型/Tab/构建分别委托给子组件。
 */

import React from 'react'
import { Tooltip } from 'antd'
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import type { DesignSize } from '@/stores/applicationStore'
import DevicePicker from '../DevicePicker'
import TabCapsule from '../TabCapsule'
import BuildActions from '../BuildActions'
import styles from '../../index.module.scss'

interface AppHeaderProps {
  applicationId: string | undefined
  appName: string
  designSize: DesignSize
  activeTab: 'preview' | 'ui' | 'database' | 'data-browser' | 'functions'
  saving: boolean
  /** 取应用最新序列化结果（透传给 BuildActions） */
  getSerializedApp: () => string
  onBack: () => void
  onSave: () => void
  onDeviceChange: (size: { width: number; height: number }) => void
  onNavigate: (path: string) => void
  onTabChange: (key: string) => void
}

const AppHeader: React.FC<AppHeaderProps> = ({
  applicationId,
  appName,
  designSize,
  activeTab,
  saving,
  getSerializedApp,
  onBack,
  onSave,
  onDeviceChange,
  onNavigate,
  onTabChange,
}) => {
  return (
    <div className={styles.appHeader}>
      {/* 左侧：返回首页按钮 */}
      <Tooltip title="返回首页">
        <button
          className={styles.backBtn}
          onClick={onBack}
          aria-label="返回首页"
        >
          <ArrowLeftOutlined />
        </button>
      </Tooltip>

      {/* 机型选择器（非编辑态保留等宽占位，避免胶囊抖动） */}
      <span className={styles.devicePickerSlot}>
        {activeTab === 'ui' && (
          <DevicePicker designSize={designSize} onChange={onDeviceChange} />
        )}
      </span>

      {/* 左侧弹性占位 */}
      <div className={styles.headerSpacer} />

      {/* Tab 胶囊：[ ▶预览 | ✏编辑 ]  [ 数据库 ]  [ 云函数 ] */}
      <TabCapsule
        activeTab={activeTab}
        applicationId={applicationId}
        onNavigate={onNavigate}
        onTabChange={onTabChange}
      />

      {/* 右侧弹性占位 */}
      <div className={styles.headerSpacer} />

      {/* 操作胶囊：保存 / 生成应用 */}
      <div className={styles.actionCapsule}>
        <Tooltip title="保存">
          <button
            className={styles.actionBtn}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? <span className={styles.actionSpinner} /> : <SaveOutlined />}
          </button>
        </Tooltip>
        <div className={styles.capsuleDivider} />
        <BuildActions
          applicationId={applicationId}
          appName={appName}
          designSize={designSize}
          getSerializedApp={getSerializedApp}
        />
      </div>
    </div>
  )
}

export default AppHeader
