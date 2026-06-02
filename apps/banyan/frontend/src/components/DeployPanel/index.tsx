/**
 * DeployPanel — 应用部署面板（ADR-028）
 *
 * 显示 agent 状态、发布按钮、部署进度、历史记录。
 * 嵌入到应用设置页或作为独立弹窗使用。
 */

import { useState, useEffect, useCallback } from 'react'
import { Button, Progress, Tag, message, Select } from 'antd'
import { RocketOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, CloudServerOutlined } from '@ant-design/icons'
import { deployApi } from '../../api'
import type { DeploymentRecord, AgentStatus, DeployType } from '../../api/deploy'
import styles from './index.module.scss'

interface DeployPanelProps {
  applicationId: string
  /** 当前应用已发布的 URL（如有） */
  webUrl?: string
}

export default function DeployPanel({ applicationId, webUrl }: DeployPanelProps) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [deployType, setDeployType] = useState<DeployType>('static')
  const [currentDeploy, setCurrentDeploy] = useState<DeploymentRecord | null>(null)
  const [history, setHistory] = useState<DeploymentRecord[]>([])
  const [publishing, setPublishing] = useState(false)

  // 加载 agent 状态
  const loadAgentStatus = useCallback(async () => {
    try {
      const res = await deployApi.getAgentStatus()
      if (res.data) setAgentStatus(res.data)
    } catch {
      // 静默处理
    }
  }, [])

  // 加载部署历史
  const loadHistory = useCallback(async () => {
    try {
      const res = await deployApi.getDeployHistory(applicationId, 10)
      if (res.data) {
        setHistory(res.data)
        // 找到最近一个进行中的部署
        const active = res.data.find((d: DeploymentRecord) => d.status === 'pending' || d.status === 'building' || d.status === 'deploying')
        if (active) setCurrentDeploy(active)
      }
    } catch {
      // 静默处理
    }
  }, [applicationId])

  useEffect(() => {
    loadAgentStatus()
    loadHistory()
  }, [loadAgentStatus, loadHistory])

  // 轮询进行中的部署状态
  useEffect(() => {
    if (!currentDeploy || currentDeploy.status === 'success' || currentDeploy.status === 'failed') {
      return
    }
    const timer = setInterval(async () => {
      try {
        const res = await deployApi.getDeployStatus(currentDeploy.deploymentId)
        if (res.data) {
          setCurrentDeploy(res.data)
          if (res.data.status === 'success') {
            message.success(`部署成功！访问地址：${res.data.url}`)
            loadHistory()
          } else if (res.data.status === 'failed') {
            message.error(`部署失败：${res.data.error}`)
            loadHistory()
          }
        }
      } catch {
        // 静默
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [currentDeploy, loadHistory])

  // 发布
  const handlePublish = async () => {
    setPublishing(true)
    try {
      const res = await deployApi.publishApp(applicationId, deployType)
      if (res.data) {
        message.info('部署任务已创建，正在构建中...')
        // 立即查询状态
        const statusRes = await deployApi.getDeployStatus(res.data.deploymentId)
        if (statusRes.data) setCurrentDeploy(statusRes.data)
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '发布失败')
    } finally {
      setPublishing(false)
    }
  }

  // 渲染 agent 状态指示器
  const renderAgentStatus = () => {
    if (!agentStatus) return null

    const { online, provisionStatus } = agentStatus
    let dotClass = styles.offline
    let text = '部署代理离线'

    if (online) {
      dotClass = styles.online
      text = '部署代理在线'
    } else if (provisionStatus !== 'none' && provisionStatus !== 'ready' && provisionStatus !== 'failed') {
      dotClass = styles.provisioning
      text = `环境准备中（${provisionStatus}）`
    } else if (provisionStatus === 'failed') {
      text = '环境开通失败'
    }

    return (
      <div className={styles.statusCard}>
        <div className={`${styles.statusDot} ${dotClass}`} />
        <span className={styles.statusText}>
          <CloudServerOutlined style={{ marginRight: 4 }} />
          {text}
          {agentStatus.domain && <span style={{ marginLeft: 8, opacity: 0.6 }}>{agentStatus.domain}</span>}
        </span>
      </div>
    )
  }

  // 渲染部署状态标签
  const renderStatusTag = (status: string) => {
    switch (status) {
      case 'success':
        return <Tag color="success" icon={<CheckCircleOutlined />}>成功</Tag>
      case 'failed':
        return <Tag color="error" icon={<CloseCircleOutlined />}>失败</Tag>
      case 'building':
      case 'deploying':
        return <Tag color="processing" icon={<LoadingOutlined />}>进行中</Tag>
      default:
        return <Tag>等待中</Tag>
    }
  }

  const isDeploying = currentDeploy && (currentDeploy.status === 'pending' || currentDeploy.status === 'building' || currentDeploy.status === 'deploying')

  return (
    <div className={styles.deployPanel}>
      {renderAgentStatus()}

      {/* 发布区域 */}
      <div className={styles.publishSection}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select
            value={deployType}
            onChange={setDeployType}
            size="small"
            style={{ width: 120 }}
            options={[
              { label: '静态部署', value: 'static' },
              { label: '全栈部署', value: 'fullstack' },
            ]}
          />
          <Button
            type="primary"
            icon={<RocketOutlined />}
            loading={publishing}
            disabled={!agentStatus?.online || !!isDeploying}
            onClick={handlePublish}
          >
            发布到 Web
          </Button>
        </div>

        {/* 当前部署进度 */}
        {isDeploying && currentDeploy && (
          <div>
            <Progress
              percent={currentDeploy.progress}
              size="small"
              status="active"
              format={() => currentDeploy.currentStep || '等待中...'}
            />
          </div>
        )}

        {/* 已发布 URL */}
        {webUrl && (
          <div className={styles.urlPreview}>
            🌐 <a href={webUrl} target="_blank" rel="noopener noreferrer">{webUrl}</a>
          </div>
        )}
      </div>

      {/* 部署历史 */}
      {history.length > 0 && (
        <div className={styles.historySection}>
          <div className={styles.historyTitle}>部署历史</div>
          {history.slice(0, 5).map(record => (
            <div key={record.deploymentId} className={styles.historyItem}>
              <span className={styles.historyStatus}>
                {renderStatusTag(record.status)}
                v{record.version}
              </span>
              <span style={{ color: '#999', fontSize: 11 }}>
                {new Date(record.createdAt).toLocaleString('zh-CN')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
