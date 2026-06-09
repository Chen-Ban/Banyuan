/**
 * FlowEditorPanel — 流程编辑侧面板
 *
 * 替代原 FlowEditorModal 弹窗，改为右侧全高 Drawer 面板形式。
 *
 * 布局：
 *   ┌─────────────────────────────────────────────────────┐
 *   │  标题栏（事件名 + 保存 / 取消）                        │
 *   ├─────────────────────────────────────────────────────┤
 *   │  画布区域（自适应填满剩余高度）                         │
 *   │  ┌─┐                                                │
 *   │  │◎│ ← 物料触发按钮（左上浮层）                       │
 *   │  └─┘                                                │
 *   │  ← Drawer（UnifiedMaterialPanel client-flow）        │
 *   └─────────────────────────────────────────────────────┘
 *
 * 交互优势（相比弹窗）：
 *   - 设计画布仍然可见（被压缩到左侧），保持上下文感知
 *   - 画布空间显著增大（全高 - 标题栏）
 *   - 物料面板交互与 FunctionsPage 完全统一（左侧 Drawer 模式）
 *   - 渐进式焦点切换，不是粗暴的模态打断
 *
 * 接口与 FlowEditorModal 完全兼容，可直接替换。
 */

import React, { useCallback, useState } from 'react'
import { Button, Drawer, Tooltip } from 'antd'
import { AppstoreOutlined } from '@ant-design/icons'
import type { FlowSchema } from '@banyuan/banvasgl'
import useFlowBanvas from '../../../hooks/useFlowBanvas'
import { FlowContextMenu } from '../FlowContextMenu'
import UnifiedMaterialPanel from '../../UnifiedMaterialPanel'
import styles from './index.module.scss'

export interface FlowEditorPanelProps {
  open: boolean
  title: string
  initialSchema: FlowSchema
  onSave: (schema: FlowSchema) => void
  onClose: () => void
}

export const FlowEditorPanel: React.FC<FlowEditorPanelProps> = ({
  open,
  title,
  initialSchema,
  onSave,
  onClose,
}) => {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [canvasContainerEl, setCanvasContainerEl] = useState<HTMLDivElement | null>(null)

  const canvasContainerRef = useCallback((el: HTMLDivElement | null) => {
    setCanvasContainerEl(el)
  }, [])

  const {
    Canvas,
    getSchema,
    contextMenuState,
  } = useFlowBanvas(
    {
      // 自适应模式：不传 width/height，画布跟随容器 ResizeObserver 动态调整
      backgroundColor: 'transparent',
    },
    initialSchema,
  )

  const handleSave = useCallback(() => {
    onSave(getSchema())
    onClose()
  }, [getSchema, onSave, onClose])

  const handleCancel = useCallback(() => {
    // 取消时也写回（与原 FlowEditorModal 行为一致）
    onSave(getSchema())
    onClose()
  }, [getSchema, onSave, onClose])

  return (
    <Drawer
      open={open}
      onClose={handleCancel}
      placement="right"
      width={560}
      mask={false}
      closable={false}
      push={false}
      title={
        <div className={styles.titleBar}>
          <span className={styles.titleText}>{title}</span>
          <div className={styles.titleActions}>
            <Button size="small" onClick={handleCancel}>取消</Button>
            <Button size="small" type="primary" onClick={handleSave}>保存</Button>
          </div>
        </div>
      }
      classNames={{ body: styles.panelBody, header: styles.panelHeader }}
      styles={{
        wrapper: {
          boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
        },
      }}
    >
      {/* 画布区域：填满面板内容区 */}
      <div className={styles.canvasContainer} ref={canvasContainerRef}>
        {/* 流程画布（自适应容器尺寸） */}
        {Canvas}

        {/* 物料面板触发按钮（浮层左上角） */}
        <Tooltip title={paletteOpen ? '收起物料' : '节点物料'} placement="right">
          <button
            className={`${styles.paletteToggleBtn}${paletteOpen ? ` ${styles.paletteToggleBtnOpen}` : ''}`}
            onClick={() => setPaletteOpen((v) => !v)}
            aria-label="打开物料面板"
          >
            <AppstoreOutlined />
          </button>
        </Tooltip>

        {/* 物料抽屉（挂载在画布容器，从左侧弹出） */}
        <Drawer
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          placement="left"
          width={240}
          mask={false}
          closable={false}
          classNames={{ body: styles.drawerBody }}
          getContainer={canvasContainerEl ?? false}
          rootStyle={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, height: '100%' }}
          styles={{
            wrapper: {
              top: 8,
              bottom: 8,
              left: 8,
              height: 'calc(100% - 16px)',
              borderRadius: 10,
              border: '1px solid var(--color-border-md)',
              overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            },
            section: {
              borderRadius: 10,
              overflow: 'hidden',
            },
          }}
        >
          <UnifiedMaterialPanel mode="client-flow" />
        </Drawer>

        {/* 右键菜单 */}
        <FlowContextMenu state={contextMenuState} />
      </div>
    </Drawer>
  )
}

export default FlowEditorPanel
