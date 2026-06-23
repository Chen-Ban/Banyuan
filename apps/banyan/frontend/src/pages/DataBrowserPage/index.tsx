/**
 * DataBrowserPage — 数据浏览页面
 *
 * 布局：
 *   ┌────────────────────────────────────────────────────┐
 *   │  ┌─ 左侧列表 ─┐  ┌─ 右侧数据表 ─────────────────┐ │
 *   │  │ collection1 │  │ Table (分页 + 列自适应)       │ │
 *   │  │ collection2 │  │                               │ │
 *   │  │ ...         │  │                               │ │
 *   │  └─────────────┘  └───────────────────────────────┘ │
 *   └────────────────────────────────────────────────────┘
 *
 * 职责：
 *   - 加载应用 Schema 获取集合列表及字段定义
 *   - 左侧列表使用 EditableListItem（editable={false}，只读浏览）
 *   - 右侧使用 Ant Design Table 展示数据，支持分页
 *   - 数据查询通过本地 Preview Server（从 previewServerStore 获取地址）
 *   - 非 Electron 环境显示降级提示
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { App, Empty, Spin, Table } from 'antd'
import { TableOutlined, DesktopOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { schemaApi } from '@/api'
import { listDocuments } from '@/api/runtime/data'
import type { CollectionDef, FieldDef } from '@/api'
import EditableListItem from '@/components/EditableListItem'
import { usePreviewServerStore } from '@/stores/previewServerStore'
import styles from './index.module.scss'

const PAGE_SIZE = 20

const DataBrowserPage: React.FC = () => {
  const { message } = App.useApp()
  const { id: appId } = useParams<{ id: string }>()
  const serverInfo = usePreviewServerStore((s) => s.serverInfo)
  const serverStatus = usePreviewServerStore((s) => s.status)

  const [collections, setCollections] = useState<CollectionDef[]>([])
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(true)

  const [data, setData] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [dataLoading, setDataLoading] = useState(false)

  // ── 加载 Schema ──
  useEffect(() => {
    if (!appId) return
    setSchemaLoading(true)
    schemaApi.fetchDataSchema(appId)
      .then((res) => {
        const cols = res.data?.collections ?? []
        setCollections(cols)
        if (cols.length > 0 && !selectedName) {
          setSelectedName(cols[0].name)
        }
      })
      .catch(() => message.error('加载数据表结构失败'))
      .finally(() => setSchemaLoading(false))
  }, [appId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 加载数据（从 Preview Server） ──
  const loadData = useCallback(async (collectionName: string, pageNum: number) => {
    if (!serverInfo?.url) return
    setDataLoading(true)
    try {
      const res = await listDocuments(serverInfo.url, collectionName, {
        limit: PAGE_SIZE,
        skip: (pageNum - 1) * PAGE_SIZE,
        sort: { _id: -1 },
      })
      setData(res.data ?? [])
      setTotal(res.pagination?.total ?? 0)
    } catch {
      message.error('加载数据失败')
    } finally {
      setDataLoading(false)
    }
  }, [serverInfo?.url, message])

  useEffect(() => {
    if (selectedName && serverInfo?.url && serverStatus === 'running') {
      setPage(1)
      loadData(selectedName, 1)
    }
  }, [selectedName, serverInfo?.url, serverStatus, loadData])

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    if (selectedName) loadData(selectedName, newPage)
  }

  // ── 表格列定义（基于 schema fields） ──
  const selectedCollection = useMemo(
    () => collections.find((c) => c.name === selectedName) ?? null,
    [collections, selectedName],
  )

  const columns: ColumnsType<Record<string, unknown>> = useMemo(() => {
    if (!selectedCollection) return []

    const cols: ColumnsType<Record<string, unknown>> = [
      {
        title: '_id',
        dataIndex: '_id',
        key: '_id',
        width: 220,
        ellipsis: true,
      },
    ]

    selectedCollection.fields.forEach((field: FieldDef) => {
      cols.push({
        title: field.displayName || field.name,
        dataIndex: field.name,
        key: field.name,
        ellipsis: true,
        render: (value: unknown) => {
          if (value === null || value === undefined) return <span style={{ color: 'var(--color-text-quaternary)' }}>null</span>
          if (typeof value === 'object') return JSON.stringify(value)
          return String(value)
        },
      })
    })

    cols.push(
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 180,
        ellipsis: true,
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 180,
        ellipsis: true,
      },
    )

    return cols
  }, [selectedCollection])

  if (!appId) return null

  // ── 非 Electron / Preview Server 未就绪 → 降级提示 ──
  if (!serverInfo || serverStatus === 'error') {
    return (
      <div className={styles.emptyContent}>
        <Empty
          image={<DesktopOutlined style={{ fontSize: 48, color: 'var(--color-text-quaternary)' }} />}
          description={
            serverStatus === 'error'
              ? 'Preview Server 启动失败，无法浏览数据'
              : '数据浏览需要在桌面客户端中使用'
          }
        />
      </div>
    )
  }

  if (serverStatus === 'starting') {
    return (
      <div className={styles.loadingWrapper}>
        <Spin size="large" tip="Preview Server 启动中..." />
      </div>
    )
  }

  if (schemaLoading) {
    return (
      <div className={styles.loadingWrapper}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* 左侧集合列表 */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>数据表</span>
        </div>
        <div className={styles.sidebarList}>
          {collections.map((col) => (
            <EditableListItem
              key={col.name}
              icon={<TableOutlined />}
              name={col.name}
              displayName={col.displayName}
              selected={selectedName === col.name}
              editable={false}
              onSelect={() => setSelectedName(col.name)}
            />
          ))}
          {collections.length === 0 && (
            <div className={styles.emptyHint}>暂无数据表</div>
          )}
        </div>
      </div>

      {/* 右侧数据表格 */}
      <div className={styles.content}>
        {selectedCollection ? (
          <>
            <div className={styles.tableHeader}>
              <span className={styles.tableTitle}>
                {selectedCollection.displayName || selectedCollection.name}
              </span>
              <span className={styles.tableCount}>{total} 条记录</span>
            </div>
            <div className={styles.tableWrapper}>
              <Table
                columns={columns}
                dataSource={data}
                rowKey="_id"
                size="small"
                loading={dataLoading}
                pagination={{
                  current: page,
                  pageSize: PAGE_SIZE,
                  total,
                  onChange: handlePageChange,
                  showSizeChanger: false,
                  showTotal: (t) => `共 ${t} 条`,
                }}
                scroll={{ x: 'max-content' }}
              />
            </div>
          </>
        ) : (
          <div className={styles.emptyContent}>
            <Empty
              description="请在左侧选择一个数据表"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default DataBrowserPage
