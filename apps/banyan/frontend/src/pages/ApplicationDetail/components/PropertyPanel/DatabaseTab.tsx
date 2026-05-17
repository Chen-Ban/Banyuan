import React, { useCallback, useEffect, useState } from 'react'
import { Button, Input, Select, Checkbox, Spin, message, Popconfirm } from 'antd'
import { schemaApi } from '@/api'
import type { CollectionDef, FieldDef, FieldType } from '@/api'
import styles from './index.module.scss'

// ── 常量 ──────────────────────────────────────────────────────────────────────

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'string', label: 'string' },
  { value: 'number', label: 'number' },
  { value: 'boolean', label: 'boolean' },
  { value: 'date', label: 'date' },
  { value: 'enum', label: 'enum' },
  { value: 'ref', label: 'ref' },
  { value: 'array', label: 'array' },
  { value: 'object', label: 'object' },
]

// ── 字段行组件 ────────────────────────────────────────────────────────────────

interface FieldRowProps {
  field: FieldDef
  appId: string
  collectionName: string
  onDeleted: (fieldName: string) => void
  onUpdated: (field: FieldDef) => void
}

const FieldRow: React.FC<FieldRowProps> = ({ field, appId, collectionName, onDeleted, onUpdated }) => {
  const [saving, setSaving] = useState(false)

  const handleTypeChange = async (newType: FieldType) => {
    setSaving(true)
    try {
      const res = await schemaApi.updateField(appId, collectionName, field.name, { type: newType })
      const updated = res.data?.collections
        .find((c) => c.name === collectionName)
        ?.fields.find((f) => f.name === field.name)
      if (updated) onUpdated(updated)
    } catch {
      message.error('更新字段失败')
    } finally {
      setSaving(false)
    }
  }

  const handleRequiredChange = async (required: boolean) => {
    setSaving(true)
    try {
      const res = await schemaApi.updateField(appId, collectionName, field.name, { required })
      const updated = res.data?.collections
        .find((c) => c.name === collectionName)
        ?.fields.find((f) => f.name === field.name)
      if (updated) onUpdated(updated)
    } catch {
      message.error('更新字段失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await schemaApi.deleteField(appId, collectionName, field.name)
      onDeleted(field.name)
    } catch {
      message.error('删除字段失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={dbStyles.fieldRow}>
      <span className={dbStyles.fieldName} title={field.name}>{field.name}</span>
      <Select
        size="small"
        value={field.type}
        options={FIELD_TYPE_OPTIONS}
        onChange={handleTypeChange}
        disabled={saving}
        style={{ width: '100%' }}
      />
      <Checkbox
        checked={field.required}
        onChange={(e) => handleRequiredChange(e.target.checked)}
        disabled={saving}
        title="必填"
      />
      <Popconfirm
        title={`删除字段 "${field.name}"？`}
        onConfirm={handleDelete}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Button
          size="small"
          type="text"
          danger
          disabled={saving}
          style={{ padding: '0 4px', minWidth: 20 }}
        >×</Button>
      </Popconfirm>
    </div>
  )
}

// ── 新增字段行 ────────────────────────────────────────────────────────────────

interface AddFieldRowProps {
  appId: string
  collectionName: string
  onAdded: (field: FieldDef) => void
}

const AddFieldRow: React.FC<AddFieldRowProps> = ({ appId, collectionName, onAdded }) => {
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [type, setType] = useState<FieldType>('string')
  const [required, setRequired] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    setSaving(true)
    try {
      const field: FieldDef = {
        name: trimmedName,
        displayName: displayName.trim() || trimmedName,
        type,
        required,
      }
      const res = await schemaApi.addField(appId, collectionName, field)
      const added = res.data?.collections
        .find((c) => c.name === collectionName)
        ?.fields.find((f) => f.name === trimmedName)
      if (added) onAdded(added)
      setName('')
      setDisplayName('')
      setType('string')
      setRequired(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '添加字段失败'
      message.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={dbStyles.addFieldRow}>
      <Input
        size="small"
        value={name}
        placeholder="字段名（英文）"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
        disabled={saving}
      />
      <Input
        size="small"
        value={displayName}
        placeholder="显示名（可选）"
        onChange={(e) => setDisplayName(e.target.value)}
        disabled={saving}
      />
      <Select
        size="small"
        value={type}
        options={FIELD_TYPE_OPTIONS}
        onChange={(val) => setType(val)}
        disabled={saving}
        style={{ width: '100%' }}
      />
      <Checkbox
        checked={required}
        onChange={(e) => setRequired(e.target.checked)}
        disabled={saving}
        title="必填"
      />
      <Button
        size="small"
        type="primary"
        onClick={handleAdd}
        disabled={!name.trim() || saving}
        loading={saving}
        style={{ padding: '0 8px' }}
      >+</Button>
    </div>
  )
}

// ── Collection 面板 ───────────────────────────────────────────────────────────

interface CollectionPanelProps {
  collection: CollectionDef
  appId: string
  onDeleted: (name: string) => void
  onUpdated: (collection: CollectionDef) => void
}

const CollectionPanel: React.FC<CollectionPanelProps> = ({
  collection,
  appId,
  onDeleted,
  onUpdated,
}) => {
  const [expanded, setExpanded] = useState(true)
  const [fields, setFields] = useState<FieldDef[]>(collection.fields)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setFields(collection.fields)
  }, [collection.fields])

  const handleFieldAdded = (field: FieldDef) => {
    const next = [...fields, field]
    setFields(next)
    onUpdated({ ...collection, fields: next })
  }

  const handleFieldDeleted = (fieldName: string) => {
    const next = fields.filter((f) => f.name !== fieldName)
    setFields(next)
    onUpdated({ ...collection, fields: next })
  }

  const handleFieldUpdated = (updated: FieldDef) => {
    const next = fields.map((f) => (f.name === updated.name ? updated : f))
    setFields(next)
    onUpdated({ ...collection, fields: next })
  }

  const handleDeleteCollection = async () => {
    setDeleting(true)
    try {
      await schemaApi.deleteCollection(appId, collection.name)
      onDeleted(collection.name)
    } catch {
      message.error('删除 Collection 失败')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={dbStyles.collectionPanel}>
      <div className={dbStyles.collectionHeader} onClick={() => setExpanded((v) => !v)}>
        <span className={dbStyles.collectionArrow}>{expanded ? '▾' : '▸'}</span>
        <span className={dbStyles.collectionName}>{collection.displayName}</span>
        <span className={dbStyles.collectionNameEn}>({collection.name})</span>
        <Popconfirm
          title={`删除 Collection "${collection.name}"？此操作不可恢复。`}
          onConfirm={handleDeleteCollection}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button
            size="small"
            type="text"
            danger
            disabled={deleting}
            onClick={(e) => e.stopPropagation()}
            style={{ padding: '0 4px', minWidth: 20, marginLeft: 'auto' }}
          >×</Button>
        </Popconfirm>
      </div>

      {expanded && (
        <div className={dbStyles.collectionBody}>
          {/* 字段表头 */}
          <div className={dbStyles.fieldHeader}>
            <span>字段名</span>
            <span>类型</span>
            <span title="必填">必</span>
            <span />
          </div>

          {fields.length === 0 && (
            <div className={styles.emptyFields}>暂无字段</div>
          )}

          {fields.map((field) => (
            <FieldRow
              key={field.name}
              field={field}
              appId={appId}
              collectionName={collection.name}
              onDeleted={handleFieldDeleted}
              onUpdated={handleFieldUpdated}
            />
          ))}

          <AddFieldRow
            appId={appId}
            collectionName={collection.name}
            onAdded={handleFieldAdded}
          />
        </div>
      )}
    </div>
  )
}

// ── 新增 Collection 行 ────────────────────────────────────────────────────────

interface AddCollectionRowProps {
  appId: string
  onAdded: (collection: CollectionDef) => void
}

const AddCollectionRow: React.FC<AddCollectionRowProps> = ({ appId, onAdded }) => {
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    setSaving(true)
    try {
      const res = await schemaApi.addCollection(appId, {
        name: trimmedName,
        displayName: displayName.trim() || trimmedName,
      })
      const added = res.data?.collections.find((c) => c.name === trimmedName)
      if (added) onAdded(added)
      setName('')
      setDisplayName('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建 Collection 失败'
      message.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={dbStyles.addCollectionRow}>
      <Input
        size="small"
        value={name}
        placeholder="Collection 名（英文）"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
        disabled={saving}
      />
      <Input
        size="small"
        value={displayName}
        placeholder="显示名（可选）"
        onChange={(e) => setDisplayName(e.target.value)}
        disabled={saving}
      />
      <Button
        size="small"
        type="primary"
        onClick={handleAdd}
        disabled={!name.trim() || saving}
        loading={saving}
      >新建</Button>
    </div>
  )
}

// ── DatabaseTab 主组件 ────────────────────────────────────────────────────────

interface DatabaseTabProps {
  appId: string
}

const DatabaseTab: React.FC<DatabaseTabProps> = ({ appId }) => {
  const [collections, setCollections] = useState<CollectionDef[]>([])
  const [loading, setLoading] = useState(true)

  const loadSchema = useCallback(async () => {
    setLoading(true)
    try {
      const res = await schemaApi.fetchSchema(appId)
      setCollections(res.data?.collections ?? [])
    } catch {
      message.error('加载 Schema 失败')
    } finally {
      setLoading(false)
    }
  }, [appId])

  useEffect(() => {
    loadSchema()
  }, [loadSchema])

  const handleCollectionAdded = (collection: CollectionDef) => {
    setCollections((prev) => [...prev, collection])
  }

  const handleCollectionDeleted = (name: string) => {
    setCollections((prev) => prev.filter((c) => c.name !== name))
  }

  const handleCollectionUpdated = (updated: CollectionDef) => {
    setCollections((prev) => prev.map((c) => (c.name === updated.name ? updated : c)))
  }

  if (loading) {
    return (
      <div className={dbStyles.loadingWrapper}>
        <Spin size="small" />
      </div>
    )
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>数据模型</div>

        {collections.length === 0 && (
          <div className={styles.emptyFields}>暂无 Collection，新建一个开始吧</div>
        )}

        {collections.map((collection) => (
          <CollectionPanel
            key={collection.name}
            collection={collection}
            appId={appId}
            onDeleted={handleCollectionDeleted}
            onUpdated={handleCollectionUpdated}
          />
        ))}

        <AddCollectionRow appId={appId} onAdded={handleCollectionAdded} />
      </div>
    </div>
  )
}

export default DatabaseTab

// ── DatabaseTab 专属样式（CSS-in-JS 对象，避免新建 scss 文件） ─────────────────
// 使用内联样式对象，保持与现有 SCSS Modules 风格一致

const dbStyles = {
  loadingWrapper: {
    display: 'flex',
    justifyContent: 'center',
    padding: '24px 0',
  } as React.CSSProperties,

  collectionPanel: {
    marginBottom: '8px',
    border: '1px solid #ecf0f1',
    borderRadius: '4px',
    overflow: 'hidden',
  } as React.CSSProperties,

  collectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 8px',
    background: '#f5f6f7',
    cursor: 'pointer',
    userSelect: 'none' as const,
    fontSize: '11px',
  } as React.CSSProperties,

  collectionArrow: {
    fontSize: '10px',
    color: '#7f8c8d',
    flexShrink: 0,
  } as React.CSSProperties,

  collectionName: {
    fontWeight: 600,
    color: '#2c3e50',
  } as React.CSSProperties,

  collectionNameEn: {
    color: '#95a5a6',
    fontSize: '10px',
    fontFamily: "'SF Mono', 'Menlo', monospace",
  } as React.CSSProperties,

  collectionBody: {
    padding: '8px',
  } as React.CSSProperties,

  fieldHeader: {
    display: 'grid',
    gridTemplateColumns: '1fr 72px 20px 20px',
    gap: '4px',
    fontSize: '10px',
    color: '#95a5a6',
    marginBottom: '4px',
    paddingBottom: '4px',
    borderBottom: '1px solid #ecf0f1',
  } as React.CSSProperties,

  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 72px 20px 20px',
    gap: '4px',
    alignItems: 'center',
    marginBottom: '4px',
  } as React.CSSProperties,

  fieldName: {
    fontSize: '11px',
    fontFamily: "'SF Mono', 'Menlo', monospace",
    color: '#2c3e50',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as React.CSSProperties,

  addFieldRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 72px 20px 32px',
    gap: '4px',
    alignItems: 'center',
    marginTop: '6px',
    paddingTop: '6px',
    borderTop: '1px dashed #ecf0f1',
  } as React.CSSProperties,

  addCollectionRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr auto',
    gap: '4px',
    alignItems: 'center',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px dashed #ecf0f1',
  } as React.CSSProperties,
}
