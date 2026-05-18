import React, { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button,
  Input,
  Select,
  Checkbox,
  Spin,
  Popconfirm,
  message,
  Tooltip,
  Empty,
} from 'antd'
import {
  ArrowLeftOutlined,
  DatabaseOutlined,
  PlusOutlined,
  DeleteOutlined,
  TableOutlined,
} from '@ant-design/icons'
import { schemaApi } from '@/api'
import type { CollectionDef, FieldDef, FieldType } from '@/api'
import styles from './index.module.scss'

// ── 常量 ──────────────────────────────────────────────────────────────────────

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'string',  label: 'String'  },
  { value: 'number',  label: 'Number'  },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date',    label: 'Date'    },
  { value: 'enum',    label: 'Enum'    },
  { value: 'ref',     label: 'Ref'     },
  { value: 'array',   label: 'Array'   },
  { value: 'object',  label: 'Object'  },
]

const TYPE_COLOR: Record<FieldType, string> = {
  string:  '#1677ff',
  number:  '#52c41a',
  boolean: '#fa8c16',
  date:    '#722ed1',
  enum:    '#eb2f96',
  ref:     '#13c2c2',
  array:   '#faad14',
  object:  '#8c8c8c',
}

// ── 左侧：表列表 ──────────────────────────────────────────────────────────────

interface CollectionListProps {
  collections: CollectionDef[]
  selectedName: string | null
  onSelect: (name: string) => void
  onAdd: (name: string, displayName: string) => Promise<void>
  onDelete: (name: string) => Promise<void>
}

const CollectionList: React.FC<CollectionListProps> = ({
  collections,
  selectedName,
  onSelect,
  onAdd,
  onDelete,
}) => {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await onAdd(trimmed, newDisplayName.trim() || trimmed)
      setNewName('')
      setNewDisplayName('')
      setAdding(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setNewName('')
    setNewDisplayName('')
    setAdding(false)
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
            onClick={() => setAdding(true)}
            className={styles.addBtn}
          />
        </Tooltip>
      </div>

      <div className={styles.collectionItems}>
        {collections.map((col) => (
          <div
            key={col.name}
            className={`${styles.collectionItem} ${selectedName === col.name ? styles.collectionItemActive : ''}`}
            onClick={() => onSelect(col.name)}
          >
            <TableOutlined className={styles.collectionItemIcon} />
            <div className={styles.collectionItemInfo}>
              <span className={styles.collectionItemDisplay}>{col.displayName}</span>
              <span className={styles.collectionItemName}>{col.name}</span>
            </div>
            <Popconfirm
              title={`删除表 "${col.name}"？`}
              description="此操作不可恢复，表中所有数据将丢失。"
              onConfirm={(e) => { e?.stopPropagation(); onDelete(col.name) }}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <span
                className={styles.collectionDeleteBtn}
                onClick={(e) => e.stopPropagation()}
              >
                <DeleteOutlined />
              </span>
            </Popconfirm>
          </div>
        ))}

        {collections.length === 0 && !adding && (
          <div className={styles.collectionEmpty}>暂无数据表</div>
        )}
      </div>

      {/* 新建表表单 */}
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
    </div>
  )
}

// ── 右侧：字段编辑器 ──────────────────────────────────────────────────────────

interface FieldEditorProps {
  collection: CollectionDef
  appId: string
  onFieldAdded: (field: FieldDef) => void
  onFieldUpdated: (field: FieldDef) => void
  onFieldDeleted: (fieldName: string) => void
}

const FieldEditor: React.FC<FieldEditorProps> = ({
  collection,
  appId,
  onFieldAdded,
  onFieldUpdated,
  onFieldDeleted,
}) => {
  // 新增字段表单状态
  const [addingField, setAddingField] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldDisplay, setNewFieldDisplay] = useState('')
  const [newFieldType, setNewFieldType] = useState<FieldType>('string')
  const [newFieldRequired, setNewFieldRequired] = useState(false)
  const [addingSaving, setAddingSaving] = useState(false)

  // 行内编辑状态：key = fieldName, value = saving
  const [savingFields, setSavingFields] = useState<Record<string, boolean>>({})

  const handleAddField = async () => {
    const trimmed = newFieldName.trim()
    if (!trimmed) return
    setAddingSaving(true)
    try {
      const field: FieldDef = {
        name: trimmed,
        displayName: newFieldDisplay.trim() || trimmed,
        type: newFieldType,
        required: newFieldRequired,
      }
      const res = await schemaApi.addField(appId, collection.name, field)
      const added = res.data?.collections
        .find((c) => c.name === collection.name)
        ?.fields.find((f) => f.name === trimmed)
      if (added) onFieldAdded(added)
      setNewFieldName('')
      setNewFieldDisplay('')
      setNewFieldType('string')
      setNewFieldRequired(false)
      setAddingField(false)
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '添加字段失败')
    } finally {
      setAddingSaving(false)
    }
  }

  const handleTypeChange = async (fieldName: string, newType: FieldType) => {
    setSavingFields((p) => ({ ...p, [fieldName]: true }))
    try {
      const res = await schemaApi.updateField(appId, collection.name, fieldName, { type: newType })
      const updated = res.data?.collections
        .find((c) => c.name === collection.name)
        ?.fields.find((f) => f.name === fieldName)
      if (updated) onFieldUpdated(updated)
    } catch {
      message.error('更新字段失败')
    } finally {
      setSavingFields((p) => ({ ...p, [fieldName]: false }))
    }
  }

  const handleRequiredChange = async (fieldName: string, required: boolean) => {
    setSavingFields((p) => ({ ...p, [fieldName]: true }))
    try {
      const res = await schemaApi.updateField(appId, collection.name, fieldName, { required })
      const updated = res.data?.collections
        .find((c) => c.name === collection.name)
        ?.fields.find((f) => f.name === fieldName)
      if (updated) onFieldUpdated(updated)
    } catch {
      message.error('更新字段失败')
    } finally {
      setSavingFields((p) => ({ ...p, [fieldName]: false }))
    }
  }

  const handleDeleteField = async (fieldName: string) => {
    setSavingFields((p) => ({ ...p, [fieldName]: true }))
    try {
      await schemaApi.deleteField(appId, collection.name, fieldName)
      onFieldDeleted(fieldName)
    } catch {
      message.error('删除字段失败')
    } finally {
      setSavingFields((p) => ({ ...p, [fieldName]: false }))
    }
  }

  return (
    <div className={styles.fieldEditor}>
      {/* 表头信息 */}
      <div className={styles.fieldEditorHeader}>
        <div className={styles.fieldEditorTitle}>
          <TableOutlined className={styles.fieldEditorTitleIcon} />
          <span className={styles.fieldEditorTitleDisplay}>{collection.displayName}</span>
          <span className={styles.fieldEditorTitleName}>{collection.name}</span>
        </div>
        <Button
          type="primary"
          size="small"
          icon={<PlusOutlined />}
          onClick={() => setAddingField(true)}
        >
          添加字段
        </Button>
      </div>

      {/* 字段表格 */}
      <div className={styles.fieldTable}>
        {/* 表头行 */}
        <div className={styles.fieldTableHead}>
          <span className={styles.colFieldName}>字段名</span>
          <span className={styles.colDisplayName}>显示名</span>
          <span className={styles.colType}>类型</span>
          <span className={styles.colRequired}>必填</span>
          <span className={styles.colActions} />
        </div>

        {/* 内置 _id 行（只读提示） */}
        <div className={`${styles.fieldRow} ${styles.fieldRowBuiltin}`}>
          <span className={styles.colFieldName}>
            <span className={styles.fieldNameText}>_id</span>
          </span>
          <span className={styles.colDisplayName}>
            <span className={styles.fieldDisplayText}>ID</span>
          </span>
          <span className={styles.colType}>
            <span className={styles.typeTag} style={{ background: '#f0f0f0', color: '#8c8c8c' }}>
              ObjectId
            </span>
          </span>
          <span className={styles.colRequired}>
            <span className={styles.builtinBadge}>内置</span>
          </span>
          <span className={styles.colActions} />
        </div>

        {/* 用户字段 */}
        {collection.fields.map((field) => {
          const saving = savingFields[field.name] ?? false
          return (
            <div key={field.name} className={styles.fieldRow}>
              <span className={styles.colFieldName}>
                <span className={styles.fieldNameText}>{field.name}</span>
              </span>
              <span className={styles.colDisplayName}>
                <span className={styles.fieldDisplayText}>{field.displayName}</span>
              </span>
              <span className={styles.colType}>
                <Select
                  size="small"
                  value={field.type}
                  options={FIELD_TYPE_OPTIONS}
                  onChange={(val) => handleTypeChange(field.name, val)}
                  disabled={saving}
                  className={styles.typeSelect}
                  labelRender={({ value }) => (
                    <span style={{ color: TYPE_COLOR[value as FieldType] ?? '#595959', fontWeight: 500, fontSize: 12 }}>
                      {value as string}
                    </span>
                  )}
                />
              </span>
              <span className={styles.colRequired}>
                <Checkbox
                  checked={field.required}
                  onChange={(e) => handleRequiredChange(field.name, e.target.checked)}
                  disabled={saving}
                />
              </span>
              <span className={styles.colActions}>
                <Popconfirm
                  title={`删除字段 "${field.name}"？`}
                  onConfirm={() => handleDeleteField(field.name)}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={saving}
                    className={styles.deleteFieldBtn}
                  />
                </Popconfirm>
              </span>
            </div>
          )
        })}

        {collection.fields.length === 0 && !addingField && (
          <div className={styles.fieldEmpty}>
            <Empty description="暂无字段，点击「添加字段」开始定义" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        )}

        {/* 新增字段行 */}
        {addingField && (
          <div className={styles.addFieldRow}>
            <Input
              size="small"
              placeholder="字段名（英文）"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddField(); if (e.key === 'Escape') setAddingField(false) }}
              autoFocus
              disabled={addingSaving}
              className={styles.colFieldName}
            />
            <Input
              size="small"
              placeholder="显示名（可选）"
              value={newFieldDisplay}
              onChange={(e) => setNewFieldDisplay(e.target.value)}
              disabled={addingSaving}
              className={styles.colDisplayName}
            />
            <Select
              size="small"
              value={newFieldType}
              options={FIELD_TYPE_OPTIONS}
              onChange={(val) => setNewFieldType(val)}
              disabled={addingSaving}
              className={`${styles.colType} ${styles.typeSelect}`}
            />
            <span className={styles.colRequired}>
              <Checkbox
                checked={newFieldRequired}
                onChange={(e) => setNewFieldRequired(e.target.checked)}
                disabled={addingSaving}
              />
            </span>
            <span className={styles.colActions}>
              <Button size="small" onClick={() => setAddingField(false)} disabled={addingSaving}>取消</Button>
              <Button
                size="small"
                type="primary"
                onClick={handleAddField}
                loading={addingSaving}
                disabled={!newFieldName.trim()}
              >确认</Button>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── DatabasePage 主组件 ───────────────────────────────────────────────────────

const DatabasePage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [collections, setCollections] = useState<CollectionDef[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const loadSchema = useCallback(async () => {
    if (!id || id === 'new') return
    setLoading(true)
    try {
      const res = await schemaApi.fetchSchema(id)
      const cols = res.data?.collections ?? []
      setCollections(cols)
      // 默认选中第一张表
      if (cols.length > 0 && !selectedName) {
        setSelectedName(cols[0].name)
      }
    } catch {
      message.error('加载 Schema 失败')
    } finally {
      setLoading(false)
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadSchema()
  }, [loadSchema])

  const handleAddCollection = async (name: string, displayName: string) => {
    const res = await schemaApi.addCollection(id!, { name, displayName })
    const added = res.data?.collections.find((c) => c.name === name)
    if (added) {
      setCollections((prev) => [...prev, added])
      setSelectedName(added.name)
    }
  }

  const handleDeleteCollection = async (name: string) => {
    await schemaApi.deleteCollection(id!, name)
    setCollections((prev) => prev.filter((c) => c.name !== name))
    setSelectedName((prev) => {
      if (prev !== name) return prev
      const remaining = collections.filter((c) => c.name !== name)
      return remaining.length > 0 ? remaining[0].name : null
    })
  }

  const selectedCollection = collections.find((c) => c.name === selectedName) ?? null

  const handleFieldAdded = (field: FieldDef) => {
    setCollections((prev) =>
      prev.map((c) =>
        c.name === selectedName ? { ...c, fields: [...c.fields, field] } : c,
      ),
    )
  }

  const handleFieldUpdated = (field: FieldDef) => {
    setCollections((prev) =>
      prev.map((c) =>
        c.name === selectedName
          ? { ...c, fields: c.fields.map((f) => (f.name === field.name ? field : f)) }
          : c,
      ),
    )
  }

  const handleFieldDeleted = (fieldName: string) => {
    setCollections((prev) =>
      prev.map((c) =>
        c.name === selectedName
          ? { ...c, fields: c.fields.filter((f) => f.name !== fieldName) }
          : c,
      ),
    )
  }

  if (!id || id === 'new') {
    return (
      <div className={styles.emptyPage}>
        <p>请先保存应用后再管理数据库 Schema。</p>
        <Button onClick={() => navigate(-1)}>返回</Button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* 顶部 Header */}
      <div className={styles.header}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/application/${id}`)}
          className={styles.backBtn}
        />
        <DatabaseOutlined className={styles.headerIcon} />
        <span className={styles.headerTitle}>数据库 Schema</span>
      </div>

      {/* 主体：左右布局 */}
      {loading ? (
        <div className={styles.loadingWrapper}>
          <Spin size="large" />
        </div>
      ) : (
        <div className={styles.body}>
          {/* 左侧：表列表 */}
          <CollectionList
            collections={collections}
            selectedName={selectedName}
            onSelect={setSelectedName}
            onAdd={handleAddCollection}
            onDelete={handleDeleteCollection}
          />

          {/* 右侧：字段编辑器 */}
          <div className={styles.fieldEditorWrapper}>
            {selectedCollection ? (
              <FieldEditor
                key={selectedCollection.name}
                collection={selectedCollection}
                appId={id}
                onFieldAdded={handleFieldAdded}
                onFieldUpdated={handleFieldUpdated}
                onFieldDeleted={handleFieldDeleted}
              />
            ) : (
              <div className={styles.noSelection}>
                <Empty description="请在左侧选择或新建一张数据表" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default DatabasePage
