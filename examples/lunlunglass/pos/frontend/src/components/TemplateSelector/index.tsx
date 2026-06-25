import { useState, useEffect, useCallback } from 'react'
import { Modal, Button, List, Tag, Space, Spin, message } from 'antd'
import { PrinterOutlined, SyncOutlined } from '@ant-design/icons'
import { printApi } from '@/api'
import type { TemplateSnapshotSummary } from '@/api/print'
import { getErrorMessage } from '@/utils/error'
import styles from './index.module.scss'

interface TemplateSelectorProps {
  /** 弹窗是否可见 */
  open: boolean
  /** 是否正在打印（选择后的 loading 状态） */
  printing?: boolean
  /** 选择模板后的回调 */
  onSelect: (snapshotId: string) => void
  /** 取消/关闭弹窗的回调 */
  onCancel: () => void
}

/**
 * TemplateSelector 模板选择器弹窗组件
 *
 * 从 GET /api/templates/snapshots 获取已同步模板列表。
 * 展示缩略图网格 + 模板名称，支持选择和确认。
 */
const TemplateSelector = ({ open, printing = false, onSelect, onCancel }: TemplateSelectorProps) => {
  const [snapshots, setSnapshots] = useState<TemplateSnapshotSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const loadSnapshots = useCallback(async () => {
    setLoading(true)
    try {
      const res = await printApi.fetchSnapshots()
      setSnapshots(res.data ?? [])
    } catch {
      message.error('加载模板列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 弹窗打开时加载模板列表
  useEffect(() => {
    if (open) {
      loadSnapshots()
    }
  }, [open, loadSnapshots])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await printApi.syncTemplates()
      message.success(`同步完成，共同步 ${res.data?.synced ?? 0} 个模板`)
      await loadSnapshots()
    } catch (error: unknown) {
      message.error(getErrorMessage(error))
    } finally {
      setSyncing(false)
    }
  }, [loadSnapshots])

  return (
    <Modal open={open} title="选择打印模板" footer={null} onCancel={onCancel} width={520} destroyOnClose>
      <div className={styles.header}>
        <span className={styles.hint}>选择已同步的模板，打印当前订单标签</span>
        <Button size="small" icon={<SyncOutlined spin={syncing} />} loading={syncing} onClick={handleSync}>
          同步最新模板
        </Button>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <Spin tip="加载模板列表..." />
        </div>
      ) : snapshots.length === 0 ? (
        <div className={styles.empty}>暂无已同步的模板，请先点击「同步最新模板」从 Studio 拉取。</div>
      ) : (
        <List
          dataSource={snapshots}
          renderItem={(snapshot) => (
            <List.Item
              key={snapshot.snapshotId}
              actions={[
                <Button
                  key="print"
                  type="primary"
                  size="small"
                  icon={<PrinterOutlined />}
                  loading={printing}
                  onClick={() => onSelect(snapshot.snapshotId)}
                >
                  打印
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={
                  snapshot.thumbnail ? (
                    <img src={snapshot.thumbnail} alt={snapshot.templateName} className={styles.thumbnail} />
                  ) : (
                    <div className={styles.thumbnailPlaceholder}>
                      <PrinterOutlined />
                    </div>
                  )
                }
                title={snapshot.templateName}
                description={
                  <Space size={4}>
                    <Tag color="blue">{snapshot.paperWidth}mm</Tag>
                    <Tag>v{snapshot.version}</Tag>
                    <span className={styles.date}>{new Date(snapshot.publishedAt).toLocaleDateString()}</span>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Modal>
  )
}

export default TemplateSelector
