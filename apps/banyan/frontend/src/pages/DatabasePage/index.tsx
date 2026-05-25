import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Spin, message, Empty, Modal } from 'antd'
import { TableOutlined } from '@ant-design/icons'
import { schemaApi } from '@/api'
import type { CollectionDef } from '@/api'
import AiBar from '@/components/AiBar'
import CollectionList from './components/CollectionList'
import FieldEditor from './components/FieldEditor'
import styles from './index.module.scss'

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

          {/* 右侧：字段编辑器 + AiBar 竖直排列 */}
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

            {/* AI 对话栏 */}
            <AiBar
              appId={id!}
              getPages={() => []}
              getSchema={() => collections}
              onPagesUpdate={() => {}}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default DatabasePage
