/**
 * ProvisionStatus — 环境开通状态与 Agent 在线指示器
 *
 * 展示租户 ECS 环境的开通状态和 deploy-agent 连接状态：
 *   - provisionStatus !== 'ready' → 灰色齿轮 ⚙️（开通中）
 *   - ready + agent 离线 → 红色圆点 🔴（代理离线）
 *   - ready + agent 在线 → 绿色圆点 🟢（就绪）
 *
 * 点击弹出 Modal 显示详细开通流水。
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Tooltip, Modal, Descriptions, Tag, Spin, Progress } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { deployApi } from '@/api'
import type { AgentStatus, ProvisionStatus as ProvisionStatusType } from '@/api/delivery/deploy'
import styles from '../../index.module.scss'

const POLL_INTERVAL = 10_000

/** provisionStatus 的中文描述映射 */
const PROVISION_LABEL: Record<ProvisionStatusType, string> = {
  none: '未开通',
  pending: '等待开通',
  creating_ecs: '创建 ECS 实例中',
  configuring_dns: '配置 DNS 解析中',
  initializing: '执行初始化脚本中',
  installing_agent: '安装部署代理中',
  ready: '已就绪',
  failed: '开通失败',
}

const ProvisionStatus: React.FC = () => {
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [creditUsage, setCreditUsage] = useState<{ used: number; total: number; remaining: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  // ── 轮询 agent 状态 ──────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const [statusRes, creditRes] = await Promise.all([
        deployApi.getAgentStatus(),
        deployApi.getCreditUsage().catch(() => null),
      ])
      if (mountedRef.current) {
        setStatus(statusRes.data ?? null)
        if (creditRes?.data) {
          setCreditUsage(creditRes.data)
        }
      }
    } catch {
      // 静默失败
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchStatus()
    timerRef.current = setInterval(fetchStatus, POLL_INTERVAL)
    return () => {
      mountedRef.current = false
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [fetchStatus])

  // ── 图标与 Tooltip ────────────────────────────────────────────────────────
  if (loading || !status) {
    return (
      <Tooltip title="正在检查环境状态…">
        <button className={styles.actionBtn} disabled>
          <Spin size="small" />
        </button>
      </Tooltip>
    )
  }

  const { provisionStatus, online } = status

  let icon: React.ReactNode
  let tooltip: string

  if (provisionStatus === 'ready') {
    if (online) {
      icon = <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 15 }} />
      tooltip = '环境就绪 · 部署代理在线'
    } else {
      icon = <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 15 }} />
      tooltip = '环境就绪 · 部署代理离线'
    }
  } else if (provisionStatus === 'failed') {
    icon = <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 15 }} />
    tooltip = '环境开通失败'
  } else {
    icon = <SettingOutlined style={{ color: '#d9d9d9', fontSize: 15 }} />
    tooltip = `环境开通中（${PROVISION_LABEL[provisionStatus]}）`
  }

  return (
    <>
      <Tooltip title={tooltip}>
        <button className={styles.actionBtn} onClick={() => setModalOpen(true)}>
          {icon}
        </button>
      </Tooltip>

      {/* ── 状态详情弹窗 ── */}
      <Modal
        title="环境状态"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={440}
      >
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="开通状态">
            <Tag color={provisionStatus === 'ready' ? 'success' : provisionStatus === 'failed' ? 'error' : 'processing'}>
              {PROVISION_LABEL[provisionStatus]}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="部署代理">
            {online ? (
              <Tag color="success">在线</Tag>
            ) : (
              <Tag color="error">离线</Tag>
            )}
          </Descriptions.Item>
          {status.domain && (
            <Descriptions.Item label="访问域名">{status.domain}</Descriptions.Item>
          )}
        </Descriptions>

        {/* ── Credit 用量 ── */}
        {creditUsage && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ marginBottom: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              AI Credit 用量（当月）
            </h4>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="已用">
                <span style={{ color: creditUsage.remaining === 0 ? 'var(--color-error-text)' : undefined }}>
                  {creditUsage.used.toLocaleString()}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="总额度">
                {creditUsage.total > 0 ? creditUsage.total.toLocaleString() : '无限制'}
              </Descriptions.Item>
              <Descriptions.Item label="剩余">
                {creditUsage.total > 0 ? (
                  <span style={{ color: creditUsage.remaining < creditUsage.total * 0.1 ? 'var(--color-error-text)' : undefined }}>
                    {creditUsage.remaining.toLocaleString()}
                  </span>
                ) : (
                  '-'
                )}
              </Descriptions.Item>
            </Descriptions>
            {creditUsage.total > 0 && (
              <Progress
                percent={Math.round((creditUsage.used / creditUsage.total) * 100)}
                size="small"
                style={{ marginTop: 8 }}
                status={creditUsage.remaining === 0 ? 'exception' : 'active'}
              />
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

export default ProvisionStatus
