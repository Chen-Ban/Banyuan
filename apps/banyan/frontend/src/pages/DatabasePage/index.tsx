import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
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
  Modal,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  TableOutlined,
  SaveOutlined,
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
  adding: boolean
  onStartAdd: () => void
  onCancelAdd: () => void
  onConfirmAdd: (name: string, displayName: string) => Promise<void>
  onSelect: (name: string) => void
  onDelete: (name: string) => Promise<void>
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
}) => {
  const [newName, setNewName] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleAdd = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
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
    </div>
  )
}

// ── 右侧：字段编辑器（本地编辑 + 整体保存）─────────────────────────────────────

interface FieldEditorProps {
  collection: CollectionDef
  appId: string
  onSaved: (updatedCollection: CollectionDef) => void
  dirty: boolean
  onDirtyChange: (dirty: boolean) => void
}

const FieldEditor: React.FC<FieldEditorProps> = ({
  collection,
  appId,
  onSaved,
  dirty,
  onDirtyChange,
}) => {
  // 本地字段列表（编辑态）
  const [localFields, setLocalFields] = useState<FieldDef[]>(collection.fields)
  const [saving, setSaving] = useState(false)

  // 当外部 collection 变化时同步（例如切换表）
  useEffect(() => {
    setLocalFields(collection.fields)
  }, [collection.fields])

  // 检测 dirty 状态
  useEffect(() => {
    const isDirty = JSON.stringify(localFields) !== JSON.stringify(collection.fields)
    onDirtyChange(isDirty)
  }, [localFields, collection.fields, onDirtyChange])

  // ── 本地操作（不调 API）────────────────────────────────────────────────────

  const handleAddField = () => {
    const newField: FieldDef = {
      name: '',
      displayName: '',
      type: 'string',
      required: false,
    }
    setLocalFields((prev) => [...prev, newField])
  }

  const handleFieldChange = (index: number, patch: Partial<FieldDef>) => {
    setLocalFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    )
  }

  const handleDeleteField = (index: number) => {
    setLocalFields((prev) => prev.filter((_, i) => i !== index))
  }

  // ── 保存（整体提交 API）───────────────────────────────────────────────────

  const handleSave = async () => {
    // 校验：所有字段名必须非空且唯一
    const errors: string[] = []
    const nameSet = new Set<string>()
    localFields.forEach((f, i) => {
      const name = f.name.trim()
      if (!name) {
        errors.push(`第 ${i + 1} 行：字段名不能为空`)
      } else if (nameSet.has(name)) {
        errors.push(`第 ${i + 1} 行：字段名 "${name}" 重复`)
      }
      nameSet.add(name)
    })
    if (errors.length > 0) {
      message.error(errors[0])
      return
    }

    // 规范化字段：trim name/displayName
    const normalizedFields = localFields.map((f) => ({
      ...f,
      name: f.name.trim(),
      displayName: f.displayName.trim() || f.name.trim(),
    }))

    setSaving(true)
    try {
      const res = await schemaApi.updateCollection(appId, collection.name, {
        fields: normalizedFields,
      })
      const updated = res.data?.collections.find((c) => c.name === collection.name)
      if (updated) {
        onSaved(updated)
        setLocalFields(updated.fields)
        message.success('保存成功')
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
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
        <div className={styles.fieldEditorActions}>
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={handleAddField}
          >
            添加字段
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
            disabled={!dirty}
          >
            保存
          </Button>
        </div>
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

        {/* 用户字段（行内可编辑） */}
        {localFields.map((field, index) => (
          <div key={index} className={styles.fieldRow}>
            <span className={styles.colFieldName}>
              <Input
                size="small"
                value={field.name}
                placeholder="字段名（英文）"
                onChange={(e) => handleFieldChange(index, { name: e.target.value })}
                className={styles.fieldInput}
                status={!field.name.trim() ? 'error' : undefined}
              />
            </span>
            <span className={styles.colDisplayName}>
              <Input
                size="small"
                value={field.displayName}
                placeholder="显示名（可选）"
                onChange={(e) => handleFieldChange(index, { displayName: e.target.value })}
                className={styles.fieldInput}
              />
            </span>
            <span className={styles.colType}>
              <Select
                size="small"
                value={field.type}
                options={FIELD_TYPE_OPTIONS}
                onChange={(val) => handleFieldChange(index, { type: val })}
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
                onChange={(e) => handleFieldChange(index, { required: e.target.checked })}
              />
            </span>
            <span className={styles.colActions}>
              <Popconfirm
                title={`删除字段 "${field.name || '(未命名)'}"？`}
                onConfirm={() => handleDeleteField(index)}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  className={styles.deleteFieldBtn}
                />
              </Popconfirm>
            </span>
          </div>
        ))}

        {localFields.length === 0 && (
          <div className={styles.fieldEmpty}>
            <Empty description="暂无字段，点击「添加字段」开始定义" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
  void navigate // layout 负责导航，此处保留以备不时之需

  const [collections, setCollections] = useState<CollectionDef[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [adding, setAdding] = useState(false)

  // 稳定回调引用，避免 FieldEditor 无限渲染
  const handleDirtyChange = useCallback((d: boolean) => setDirty(d), [])

  // ── 路由离开拦截 ─────────────────────────────────────────────────────────

  const blocker = useBlocker(dirty)

  useEffect(() => {
    if (blocker.state === 'blocked') {
      Modal.confirm({
        title: '有未保存的更改',
        content: '当前字段修改尚未保存，确定要离开吗？未保存的更改将丢失。',
        okText: '离开',
        cancelText: '留在此页',
        okButtonProps: { danger: true },
        onOk: () => blocker.proceed(),
        onCancel: () => blocker.reset(),
      })
    }
  }, [blocker])

  // ── 浏览器关闭/刷新拦截 ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // ── 加载 Schema ──────────────────────────────────────────────────────────

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

  // ── 表操作（仍直接调 API）────────────────────────────────────────────────

  const handleStartAdd = () => {
    setAdding(true)
    setSelectedName(null) // 取消当前选中，右侧显示新建态编辑器
  }

  const handleCancelAdd = () => {
    setAdding(false)
    // 恢复选中第一张表
    if (collections.length > 0) setSelectedName(collections[0].name)
  }

  const handleConfirmAdd = async (name: string, displayName: string) => {
    const res = await schemaApi.addCollection(id!, { name, displayName })
    const added = res.data?.collections.find((c) => c.name === name)
    if (added) {
      setCollections((prev) => [...prev, added])
      setSelectedName(added.name)
      setAdding(false)
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

  // ── 切换表时检查 dirty ───────────────────────────────────────────────────

  const pendingSwitchRef = useRef<string | null>(null)

  const handleSelectCollection = (name: string) => {
    if (name === selectedName) return
    if (dirty) {
      pendingSwitchRef.current = name
      Modal.confirm({
        title: '有未保存的更改',
        content: '切换数据表前请先保存，否则当前修改将丢失。',
        okText: '放弃更改并切换',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => {
          setDirty(false)
          setSelectedName(pendingSwitchRef.current)
          pendingSwitchRef.current = null
        },
        onCancel: () => { pendingSwitchRef.current = null },
      })
    } else {
      setSelectedName(name)
    }
  }

  // ── 字段保存回调 ─────────────────────────────────────────────────────────

  const handleSaved = useCallback((updated: CollectionDef) => {
    setCollections((prev) =>
      prev.map((c) => (c.name === updated.name ? updated : c)),
    )
  }, [])

  const selectedCollection = useMemo(
    () => collections.find((c) => c.name === selectedName) ?? null,
    [collections, selectedName],
  )

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
      {/* dirty 提示条 */}
      {dirty && (
        <div className={styles.dirtyBar}>
          <span className={styles.dirtyBadge}>未保存</span>
        </div>
      )}

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
            adding={adding}
            onStartAdd={handleStartAdd}
            onCancelAdd={handleCancelAdd}
            onConfirmAdd={handleConfirmAdd}
            onSelect={handleSelectCollection}
            onDelete={handleDeleteCollection}
          />

          {/* 右侧：字段编辑器 */}
          <div className={styles.fieldEditorWrapper}>
            {selectedCollection ? (
              <FieldEditor
                key={selectedCollection.name}
                collection={selectedCollection}
                appId={id}
                onSaved={handleSaved}
                dirty={dirty}
                onDirtyChange={handleDirtyChange}
              />
            ) : adding ? (
              <div className={styles.fieldEditor}>
                <div className={styles.fieldEditorHeader}>
                  <div className={styles.fieldEditorTitle}>
                    <TableOutlined className={styles.fieldEditorTitleIcon} />
                    <span className={styles.fieldEditorTitleDisplay}>新建数据表</span>
                  </div>
                </div>
                <div className={styles.newCollectionHint}>
                  <Empty description="请在左侧输入表名并创建，即可在此编辑字段" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              </div>
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

