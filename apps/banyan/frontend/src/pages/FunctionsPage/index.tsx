import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import {
  Button,
  Input,
  Spin,
  Popconfirm,
  message,
  Tooltip,
  Empty,
  Modal,
} from 'antd'
import {
  ArrowLeftOutlined,
  FunctionOutlined,
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { FlowSchema } from 'banvasgl'
import { cloudFunctionApi } from '@/api'
import type { CloudFunctionDef } from '@/api'
import FlowCanvas from '@/pages/ApplicationDetail/components/PropertyPanel/FlowCanvas'
import FlowNodePalette from '@/pages/ApplicationDetail/components/PropertyPanel/FlowNodePalette'
import styles from './index.module.scss'

// ── 左侧：云函数列表 ─────────────────────────────────────────────────────────

interface FunctionListProps {
  functions: CloudFunctionDef[]
  selectedId: string | null
  onSelect: (functionId: string) => void
  onAdd: (name: string, displayName: string) => Promise<void>
  onDelete: (functionId: string) => Promise<void>
}

const FunctionList: React.FC<FunctionListProps> = ({
  functions,
  selectedId,
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
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '创建失败')
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
    <div className={styles.functionList}>
      <div className={styles.functionListHeader}>
        <span className={styles.functionListTitle}>云函数</span>
        <Tooltip title="新建云函数">
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setAdding(true)}
            className={styles.addBtn}
          />
        </Tooltip>
      </div>

      <div className={styles.functionItems}>
        {functions.map((fn) => (
          <div
            key={fn.functionId}
            className={`${styles.functionItem} ${selectedId === fn.functionId ? styles.functionItemActive : ''}`}
            onClick={() => onSelect(fn.functionId)}
          >
            <ThunderboltOutlined className={styles.functionItemIcon} />
            <div className={styles.functionItemInfo}>
              <span className={styles.functionItemDisplay}>{fn.displayName}</span>
              <span className={styles.functionItemName}>{fn.name}</span>
            </div>
            <Popconfirm
              title={`删除云函数 "${fn.displayName}"？`}
              description="此操作不可恢复。"
              onConfirm={(e) => { e?.stopPropagation(); onDelete(fn.functionId) }}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <span
                className={styles.functionDeleteBtn}
                onClick={(e) => e.stopPropagation()}
              >
                <DeleteOutlined />
              </span>
            </Popconfirm>
          </div>
        ))}

        {functions.length === 0 && !adding && (
          <div className={styles.functionEmpty}>暂无云函数</div>
        )}
      </div>

      {/* 新建表单 */}
      {adding && (
        <div className={styles.addFunctionForm}>
          <Input
            size="small"
            placeholder="函数名（英文，如 submitOrder）"
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
          <div className={styles.addFunctionActions}>
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

// ── 右侧：Flow 编辑器 ────────────────────────────────────────────────────────

interface FlowEditorProps {
  fn: CloudFunctionDef
  appId: string
  onSaved: (updated: CloudFunctionDef) => void
  dirty: boolean
  onDirtyChange: (dirty: boolean) => void
}

const FlowEditor: React.FC<FlowEditorProps> = ({
  fn,
  appId,
  onSaved,
  dirty,
  onDirtyChange,
}) => {
  const [localSchema, setLocalSchema] = useState<FlowSchema>(
    fn.schema as FlowSchema ?? { nodes: [], edges: [] },
  )
  const [localName, setLocalName] = useState(fn.name)
  const [localDisplayName, setLocalDisplayName] = useState(fn.displayName)
  const [localDescription, setLocalDescription] = useState(fn.description)
  const [saving, setSaving] = useState(false)

  // 同步外部 fn 变化
  useEffect(() => {
    setLocalSchema(fn.schema as FlowSchema ?? { nodes: [], edges: [] })
    setLocalName(fn.name)
    setLocalDisplayName(fn.displayName)
    setLocalDescription(fn.description)
  }, [fn])

  // dirty 检测
  useEffect(() => {
    const isDirty =
      JSON.stringify(localSchema) !== JSON.stringify(fn.schema) ||
      localName !== fn.name ||
      localDisplayName !== fn.displayName ||
      localDescription !== fn.description
    onDirtyChange(isDirty)
  }, [localSchema, localName, localDisplayName, localDescription, fn, onDirtyChange])

  const handleSchemaChange = useCallback((schema: FlowSchema) => {
    setLocalSchema(schema)
  }, [])

  const handleSave = async () => {
    if (!localName.trim()) {
      message.error('函数名不能为空')
      return
    }

    setSaving(true)
    try {
      const res = await cloudFunctionApi.updateFunction(appId, fn.functionId, {
        name: localName.trim(),
        displayName: localDisplayName.trim() || localName.trim(),
        description: localDescription.trim(),
        schema: localSchema as { nodes: unknown[]; edges: unknown[] },
      })
      if (res.data) {
        onSaved(res.data)
        message.success('保存成功')
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.flowEditor}>
      {/* 头部：函数信息 + 保存按钮 */}
      <div className={styles.flowEditorHeader}>
        <div className={styles.flowEditorMeta}>
          <Input
            size="small"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            placeholder="函数名（英文）"
            className={styles.metaNameInput}
            addonBefore="name"
          />
          <Input
            size="small"
            value={localDisplayName}
            onChange={(e) => setLocalDisplayName(e.target.value)}
            placeholder="显示名"
            className={styles.metaDisplayInput}
            addonBefore="显示名"
          />
          <Input
            size="small"
            value={localDescription}
            onChange={(e) => setLocalDescription(e.target.value)}
            placeholder="描述（可选）"
            className={styles.metaDescInput}
            addonBefore="描述"
          />
        </div>
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

      {/* 节点物料面板 */}
      <div className={styles.paletteArea}>
        <FlowNodePalette layout="horizontal" />
      </div>

      {/* 流程画布 */}
      <div className={styles.canvasArea}>
        <FlowCanvas
          schema={localSchema}
          onChange={handleSchemaChange}
        />
      </div>
    </div>
  )
}

// ── FunctionsPage 主组件 ──────────────────────────────────────────────────────

const FunctionsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [functions, setFunctions] = useState<CloudFunctionDef[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const handleDirtyChange = useCallback((d: boolean) => setDirty(d), [])

  // ── 路由离开拦截 ─────────────────────────────────────────────────────────

  const blocker = useBlocker(dirty)

  useEffect(() => {
    if (blocker.state === 'blocked') {
      Modal.confirm({
        title: '有未保存的更改',
        content: '当前云函数修改尚未保存，确定要离开吗？未保存的更改将丢失。',
        okText: '离开',
        cancelText: '留在此页',
        okButtonProps: { danger: true },
        onOk: () => blocker.proceed(),
        onCancel: () => blocker.reset(),
      })
    }
  }, [blocker])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // ── 加载云函数列表 ───────────────────────────────────────────────────────

  const loadFunctions = useCallback(async () => {
    if (!id || id === 'new') return
    setLoading(true)
    try {
      const res = await cloudFunctionApi.listFunctions(id)
      const fns = res.data ?? []
      setFunctions(fns)
      if (fns.length > 0 && !selectedId) {
        setSelectedId(fns[0].functionId)
      }
    } catch {
      message.error('加载云函数失败')
    } finally {
      setLoading(false)
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadFunctions()
  }, [loadFunctions])

  // ── CRUD 操作 ────────────────────────────────────────────────────────────

  const handleAddFunction = async (name: string, displayName: string) => {
    const res = await cloudFunctionApi.createFunction(id!, { name, displayName })
    if (res.data) {
      setFunctions((prev) => [res.data!, ...prev])
      setSelectedId(res.data.functionId)
    }
  }

  const handleDeleteFunction = async (functionId: string) => {
    await cloudFunctionApi.deleteFunction(id!, functionId)
    setFunctions((prev) => prev.filter((f) => f.functionId !== functionId))
    setSelectedId((prev) => {
      if (prev !== functionId) return prev
      const remaining = functions.filter((f) => f.functionId !== functionId)
      return remaining.length > 0 ? remaining[0].functionId : null
    })
  }

  // ── 切换函数时检查 dirty ─────────────────────────────────────────────────

  const pendingSwitchRef = useRef<string | null>(null)

  const handleSelectFunction = (functionId: string) => {
    if (functionId === selectedId) return
    if (dirty) {
      pendingSwitchRef.current = functionId
      Modal.confirm({
        title: '有未保存的更改',
        content: '切换云函数前请先保存，否则当前修改将丢失。',
        okText: '放弃更改并切换',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => {
          setDirty(false)
          setSelectedId(pendingSwitchRef.current)
          pendingSwitchRef.current = null
        },
        onCancel: () => { pendingSwitchRef.current = null },
      })
    } else {
      setSelectedId(functionId)
    }
  }

  const handleSaved = useCallback((updated: CloudFunctionDef) => {
    setFunctions((prev) =>
      prev.map((f) => (f.functionId === updated.functionId ? updated : f)),
    )
  }, [])

  const selectedFunction = useMemo(
    () => functions.find((f) => f.functionId === selectedId) ?? null,
    [functions, selectedId],
  )

  if (!id || id === 'new') {
    return (
      <div className={styles.emptyPage}>
        <p>请先保存应用后再管理云函数。</p>
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
        <FunctionOutlined className={styles.headerIcon} />
        <span className={styles.headerTitle}>云函数</span>
        {dirty && <span className={styles.dirtyBadge}>未保存</span>}
      </div>

      {/* 主体 */}
      {loading ? (
        <div className={styles.loadingWrapper}>
          <Spin size="large" />
        </div>
      ) : (
        <div className={styles.body}>
          <FunctionList
            functions={functions}
            selectedId={selectedId}
            onSelect={handleSelectFunction}
            onAdd={handleAddFunction}
            onDelete={handleDeleteFunction}
          />

          <div className={styles.flowEditorWrapper}>
            {selectedFunction ? (
              <FlowEditor
                key={selectedFunction.functionId}
                fn={selectedFunction}
                appId={id}
                onSaved={handleSaved}
                dirty={dirty}
                onDirtyChange={handleDirtyChange}
              />
            ) : (
              <div className={styles.noSelection}>
                <Empty description="请在左侧选择或新建一个云函数" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default FunctionsPage
