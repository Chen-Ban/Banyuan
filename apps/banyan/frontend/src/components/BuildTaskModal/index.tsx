/**
 * BuildTaskModal — 构建任务状态弹窗
 *
 * 功能：
 *   - 展示当前构建任务的实时状态（pending → running → success/failed）
 *   - 自动轮询状态更新
 *   - 构建成功后展示下载按钮
 *   - 不阻塞用户操作（Modal 可最小化，或用户关闭后任务继续）
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, Button, Progress, Typography, Space, Tag } from 'antd'
import {
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { buildApi } from '@/api'
import type { BuildTaskInfo, BuildStatus } from '@/api'

const { Text } = Typography

/** 状态轮询间隔（毫秒） */
const POLL_INTERVAL = 2000

interface BuildTaskModalProps {
  /** 是否显示弹窗 */
  open: boolean
  /** 关闭弹窗回调 */
  onClose: () => void
  /** 当前任务 ID（由父组件提交构建后传入） */
  taskId: string | null
}

const statusConfig: Record<BuildStatus, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'default', icon: <ClockCircleOutlined />, label: '排队中' },
  running: { color: 'processing', icon: <LoadingOutlined />, label: '构建中' },
  success: { color: 'success', icon: <CheckCircleOutlined />, label: '构建成功' },
  failed: { color: 'error', icon: <CloseCircleOutlined />, label: '构建失败' },
}

export default function BuildTaskModal({ open, onClose, taskId }: BuildTaskModalProps) {
  const [task, setTask] = useState<BuildTaskInfo | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const pollStatus = useCallback(
    async (id: string) => {
      try {
        const res = await buildApi.getBuildStatus(id)
        setTask(res.task)
        // 终态停止轮询
        if (res.task.status === 'success' || res.task.status === 'failed') {
          stopPolling()
        }
      } catch {
        // 网络错误不中断轮询，静默重试
      }
    },
    [stopPolling],
  )

  // taskId 变化时开始轮询
  useEffect(() => {
    stopPolling()
    setTask(null)

    if (!taskId) return

    // 立即查一次
    pollStatus(taskId)

    // 定时轮询
    timerRef.current = setInterval(() => pollStatus(taskId), POLL_INTERVAL)

    return stopPolling
  }, [taskId, pollStatus, stopPolling])

  // 弹窗关闭时停止轮询
  useEffect(() => {
    if (!open) stopPolling()
  }, [open, stopPolling])

  const handleDownload = () => {
    if (taskId) {
      buildApi.downloadBuildArtifact(taskId)
    }
  }

  const status = task?.status ?? 'pending'
  const config = statusConfig[status]

  // 进度条：pending=10, running=50, success=100, failed=100
  const progressPercent = status === 'pending' ? 10 : status === 'running' ? 50 : 100
  const progressStatus = status === 'failed' ? 'exception' : status === 'success' ? 'success' : 'active'

  return (
    <Modal title="生成应用" open={open} onCancel={onClose} footer={null} destroyOnHidden width={420}>
      <div style={{ padding: '16px 0' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* 状态标签 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text>状态：</Text>
            <Tag icon={config.icon} color={config.color}>
              {config.label}
            </Tag>
          </div>

          {/* 进度条 */}
          <Progress percent={progressPercent} status={progressStatus} />

          {/* 应用信息 */}
          {task && (
            <div style={{ color: '#666', fontSize: 13 }}>
              <div>应用名称：{task.appName}</div>
              <div>目标平台：{task.platform}</div>
            </div>
          )}

          {/* 错误信息 */}
          {status === 'failed' && task?.error && (
            <Text type="danger" style={{ fontSize: 13 }}>
              错误：{task.error}
            </Text>
          )}

          {/* 下载按钮 */}
          {status === 'success' && (
            <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload} block size="large">
              下载安装包
            </Button>
          )}
        </Space>
      </div>
    </Modal>
  )
}
