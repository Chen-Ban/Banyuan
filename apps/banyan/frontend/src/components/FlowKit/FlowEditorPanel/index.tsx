/**
 * FlowEditorPanel — 流程编辑侧面板
 *
 * 以 flex item 形式嵌入画布区域右侧，打开时向左挤压设计画布。
 * 带有从右到左的渐入动画，整体为圆角卡片风格。
 *
 * 布局（打开时）：
 *   ┌────────────────────────┬─ 12px ─┬────────────────────┐
 *   │     canvasSection      │        │  FlowEditorPanel   │
 *   │     （设计画布被挤压）   │        │  （圆角卡片）       │
 *   └────────────────────────┴────────┴────────────────────┘
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Drawer, Tooltip } from 'antd'
import { AppstoreOutlined, CloseOutlined } from '@ant-design/icons'
import type { FlowSchema } from '@banyuan/banvasgl'
import useFlowBanvas from '../../../hooks/useFlowBanvas'
import { FlowContextMenu } from '../FlowContextMenu'
import FlowNodePropertyPanel from '../FlowNodePropertyPanel'
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
    selectedNode,
    updateNodeSchema,
    contextMenuState,
  } = useFlowBanvas(
    {
      // 自适应模式：不传 width/height，画布跟随容器 ResizeObserver 动态调整
      backgroundColor: 'transparent',
    },
    initialSchema,
  )

  // ── 属性面板状态 ──
  const [panelDismissed, setPanelDismissed] = useState(false)
  const prevNodeIdRef = useRef<string | null>(null)

  useEffect(() => {
    const nodeId = selectedNode?.id ?? null
    if (nodeId !== prevNodeIdRef.current) {
      prevNodeIdRef.current = nodeId
      if (nodeId) setPanelDismissed(false)
    }
  }, [selectedNode])

  const handleSave = useCallback(() => {
    onSave(getSchema())
    onClose()
  }, [getSchema, onSave, onClose])

  const handleClose = useCallback(() => {
    // 关闭时也写回当前 schema（保留编辑内容）
    onSave(getSchema())
    onClose()
  }, [getSchema, onSave, onClose])

  return (
    <div className={`${styles.panelWrapper}${open ? ` ${styles.panelWrapperOpen}` : ''}`}>
      <div className={styles.panel}>
        {/* 标题栏 */}
        <div className={styles.panelHeader}>
          <div className={styles.titleBar}>
            <button className={styles.closeBtn} onClick={handleClose} aria-label="关闭">
              <CloseOutlined />
            </button>
            <span className={styles.titleText}>{title}</span>
            <div className={styles.titleActions}>
              <Button size="small" type="primary" onClick={handleSave}>保存</Button>
            </div>
          </div>
        </div>

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

          {/* 节点属性面板 */}
          {selectedNode && !panelDismissed && (
            <FlowNodePropertyPanel
              node={selectedNode}
              onChange={updateNodeSchema}
              onClose={() => setPanelDismissed(true)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default FlowEditorPanel
