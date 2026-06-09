import React, { useState } from 'react'
import { App, Button, Input, Tooltip } from 'antd'
import { PlusOutlined, TableOutlined } from '@ant-design/icons'
import type { CollectionDef } from '@/api'
import EditableListItem from '@/components/EditableListItem'
import styles from '../index.module.scss'

export interface CollectionListProps {
  collections: CollectionDef[]
  selectedName: string | null
  adding: boolean
  onStartAdd: () => void
  onCancelAdd: () => void
  onConfirmAdd: (name: string, displayName: string) => Promise<void>
  onSelect: (name: string) => void
  onDelete: (name: string) => Promise<void>
  onRename: (name: string, displayName: string) => Promise<void>
}

const CollectionList: React.FC<CollectionListProps> = ({
  collections,
  selectedName,
  adding,
  onStartAdd,
  onCancelAdd,
  onConfirmAdd,
  onSelect,
  onDelete,
  onRename,
}) => {
  const { message } = App.useApp()
  const [newName, setNewName] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(trimmed)) {
      message.error('表名只允许英文字母、数字、下划线，且必须以字母开头')
      return
    }
    setSaving(true)
    try {
      await onConfirmAdd(trimmed, newDisplayName.trim() || trimmed)
      setNewName('')
      setNewDisplayName('')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setNewName('')
    setNewDisplayName('')
    onCancelAdd()
  }

  return (
    <div className={styles.collectionList}>
      <div className={styles.collectionListHeader}>
        <span className={styles.collectionListTitle}>数据表</span>
        <Tooltip title="新建数据表">
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={onStartAdd}
            className={styles.addBtn}
          />
        </Tooltip>
      </div>

      {/* 新建表表单（顶部） */}
      {adding && (
        <div className={styles.addCollectionForm}>
          <Input
            size="small"
            placeholder="表名（英文，如 users）"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') handleCancel() }}
            autoFocus
            disabled={saving}
          />
          <Input
            size="small"
            placeholder="显示名（可选）"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') handleCancel() }}
            disabled={saving}
          />
          <div className={styles.addCollectionActions}>
            <Button size="small" onClick={handleCancel} disabled={saving}>取消</Button>
            <Button
              size="small"
              type="primary"
              onClick={handleAdd}
              loading={saving}
              disabled={!newName.trim()}
            >创建</Button>
          </div>
        </div>
      )}

      <div className={styles.collectionItems}>
        {collections.map((col) => (
          <EditableListItem
            key={col.name}
            icon={<TableOutlined />}
            name={col.name}
            displayName={col.displayName}
            selected={selectedName === col.name}
            editable
            nameEditable={false}
            onSelect={() => onSelect(col.name)}
            onRename={(_name, newDisplayName) => onRename(col.name, newDisplayName)}
            onDelete={() => onDelete(col.name)}
            deleteTitle={`删除表 "${col.name}"？`}
            deleteDescription="此操作不可恢复，表中所有数据将丢失。"
            className={styles.collectionItemOverride}
          />
        ))}

        {collections.length === 0 && !adding && (
          <div className={styles.collectionEmpty}>暂无数据表</div>
        )}
      </div>
    </div>
  )
}

export default CollectionList
