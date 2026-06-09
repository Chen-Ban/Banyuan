/**
 * EditableListItem — 通用可编辑列表项
 *
 * 默认态：图标 + 中文名 + 英文名（单行紧凑）
 * 编辑态：双击进入，双 Input（中文名 + 英文名），Enter/失焦保存，Esc 取消
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Input, Popconfirm } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import type { InputRef } from 'antd'
import styles from './index.module.scss'

export interface EditableListItemProps {
  /** 左侧图标 */
  icon: React.ReactNode
  /** 英文标识名 */
  name: string
  /** 中文显示名 */
  displayName: string
  /** 是否选中 */
  selected?: boolean
  /** 是否允许双击编辑（默认 true） */
  editable?: boolean
  /** 英文名是否可编辑（默认 false，数据表英文名创建后不可改） */
  nameEditable?: boolean
  /** 选中回调 */
  onSelect?: () => void
  /** 重命名回调（返回 Promise，resolve 后退出编辑态） */
  onRename?: (name: string, displayName: string) => Promise<void>
  /** 删除回调（不传则不显示删除按钮） */
  onDelete?: () => void
  /** 删除确认文案 */
  deleteTitle?: string
  /** 删除确认描述 */
  deleteDescription?: string
  /** 自定义类名 */
  className?: string
}

const EditableListItem: React.FC<EditableListItemProps> = ({
  icon,
  name,
  displayName,
  selected = false,
  editable = true,
  nameEditable = false,
  onSelect,
  onRename,
  onDelete,
  deleteTitle = '确认删除？',
  deleteDescription = '此操作不可恢复。',
  className,
}) => {
  const [editing, setEditing] = useState(false)
  const [localName, setLocalName] = useState(name)
  const [localDisplayName, setLocalDisplayName] = useState(displayName)
  const [saving, setSaving] = useState(false)
  const displayNameRef = useRef<InputRef>(null)
  const savingRef = useRef(false)
  const editContainerRef = useRef<HTMLDivElement>(null)

  // 外部数据变化时同步本地状态
  useEffect(() => {
    if (!editing) {
      setLocalName(name)
      setLocalDisplayName(displayName)
    }
  }, [name, displayName, editing])

  const enterEdit = useCallback(() => {
    if (!editable || !onRename) return
    setEditing(true)
    setLocalName(name)
    setLocalDisplayName(displayName)
    setTimeout(() => displayNameRef.current?.focus?.(), 0)
  }, [editable, onRename, name, displayName])

  const cancelEdit = useCallback(() => {
    setEditing(false)
    setLocalName(name)
    setLocalDisplayName(displayName)
  }, [name, displayName])

  const confirmEdit = useCallback(async () => {
    if (savingRef.current) return
    const trimmedDisplay = localDisplayName.trim()
    const trimmedName = localName.trim()
    if (!trimmedDisplay) {
      cancelEdit()
      return
    }
    if (trimmedDisplay === displayName && trimmedName === name) {
      setEditing(false)
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      await onRename?.(trimmedName || name, trimmedDisplay)
      setEditing(false)
    } catch {
      // 保存失败保持编辑态
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [localDisplayName, localName, displayName, name, onRename, cancelEdit])

  // 点击外部自动保存
  useEffect(() => {
    if (!editing) return
    const handleMouseDown = (e: MouseEvent) => {
      if (editContainerRef.current && !editContainerRef.current.contains(e.target as Node)) {
        confirmEdit()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [editing, confirmEdit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }, [confirmEdit, cancelEdit])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    enterEdit()
  }, [enterEdit])

  const handleClick = useCallback(() => {
    if (!editing) {
      onSelect?.()
    }
  }, [editing, onSelect])

  if (editing) {
    return (
      <div ref={editContainerRef} className={`${styles.item} ${styles.itemEditing} ${className ?? ''}`}>
        <span className={styles.icon}>{icon}</span>
        <div className={styles.editInputs}>
          <Input
            ref={displayNameRef}
            size="small"
            value={localDisplayName}
            onChange={(e) => setLocalDisplayName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="显示名"
            disabled={saving}
            className={styles.editInput}
          />
          <Input
            size="small"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="英文名"
            disabled={saving || !nameEditable}
            className={`${styles.editInput} ${styles.editInputMono}`}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`${styles.item} ${selected ? styles.itemActive : ''} ${className ?? ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <span className={styles.icon}>{icon}</span>
      <div className={styles.info}>
        <span className={styles.displayName}>{displayName}</span>
        <span className={styles.name}>{name}</span>
      </div>
      {onDelete && (
        <Popconfirm
          title={deleteTitle}
          description={deleteDescription}
          onConfirm={(e) => { e?.stopPropagation(); onDelete() }}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <span
            className={styles.deleteBtn}
            onClick={(e) => e.stopPropagation()}
          >
            <DeleteOutlined />
          </span>
        </Popconfirm>
      )}
    </div>
  )
}

export default EditableListItem
