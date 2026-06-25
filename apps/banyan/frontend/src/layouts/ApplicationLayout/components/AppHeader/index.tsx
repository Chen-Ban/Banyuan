/**
 * AppHeader — 应用级顶部工具栏
 *
 * 编排顶部栏的各区块：
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  ← 返回   机型   ··   [▶预览|✏编辑] [数据库][数据浏览][云函数]  ··  💾 🚀 │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * 自身只负责返回按钮、保存按钮和布局，机型/Tab/构建分别委托给子组件。
 * 返回按钮的 navigate 和 DevicePicker 的 activeTab 条件均通过 router hooks 内部自持。
 */

import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Tooltip } from 'antd'
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useApplicationStore } from '@/stores/applicationStore'
import { useShallow } from 'zustand/shallow'
import DevicePicker from '../DevicePicker'
import TabCapsule from '../TabCapsule'
import BuildActions from '../BuildActions'
import styles from '../../index.module.scss'

interface AppHeaderProps {
  onSave: () => void
}

const AppHeader: React.FC<AppHeaderProps> = ({ onSave }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const isEditMode = location.pathname.endsWith('/ui')
  const { uiJSONDirty, dataSchemaDirty, cloudFunctionsDirty, isSaving } = useApplicationStore(
    useShallow((s) => ({
      uiJSONDirty: s.uiJSONDirty,
      dataSchemaDirty: s.dataSchemaDirty,
      cloudFunctionsDirty: s.cloudFunctionsDirty,
      isSaving: s.isSaving,
    })),
  )
  const isDirty = uiJSONDirty || dataSchemaDirty || cloudFunctionsDirty
  const saveTooltip = isSaving ? '正在保存…' : isDirty ? '保存' : '没有需要保存的更改'

  return (
    <div className={styles.appHeader}>
      {/* 左侧：返回首页按钮 */}
      <Tooltip title="返回首页">
        <button className={styles.backBtn} onClick={() => navigate('/')} aria-label="返回首页">
          <ArrowLeftOutlined />
        </button>
      </Tooltip>

      {/* 机型选择器（非编辑态保留等宽占位，避免胶囊抖动） */}
      <span className={styles.devicePickerSlot}>{isEditMode && <DevicePicker />}</span>

      {/* 左侧弹性占位 */}
      <div className={styles.headerSpacer} />

      {/* Tab 胶囊：[ ▶预览 | ✏编辑 ]  [ 数据库 ]  [ 云函数 ] */}
      <TabCapsule />

      {/* 右侧弹性占位 */}
      <div className={styles.headerSpacer} />

      {/* 操作胶囊：保存 / 生成应用 */}
      <div className={styles.actionCapsule}>
        <Tooltip title={saveTooltip}>
          <button className={styles.actionBtn} onClick={onSave} disabled={isSaving || !isDirty}>
            {isSaving ? <span className={styles.actionSpinner} /> : <SaveOutlined />}
          </button>
        </Tooltip>
        <div className={styles.capsuleDivider} />
        <BuildActions />
      </div>
    </div>
  )
}

export default AppHeader
