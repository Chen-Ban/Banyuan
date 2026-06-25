/**
 * BuildActions — 顶部栏右侧「部署应用」操作
 *
 * 内聚构建 + 部署相关的全部逻辑：
 *   - 桌面构建任务列表 + 轮询状态更新
 *   - 提交构建（handleBuild，按平台）
 *   - 未查看角标计算
 *   - 部署历史 + 回滚
 *   - 生成应用下拉（部署目标 + 最近部署 + 部署列表）
 *   - 构建任务详情弹窗（BuildTaskModal）
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { App, Badge, Dropdown, Popconfirm, Modal, Descriptions, Tag, Progress, Button, Space } from 'antd'
import type { MenuProps } from 'antd'
import {
  RocketOutlined,
  GlobalOutlined,
  DesktopOutlined,
  AppleOutlined,
  AndroidOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  RollbackOutlined,
} from '@ant-design/icons'
import { version as canvasVersion } from '@banyuan/banvasgl'
import { buildApi, deployApi } from '@/api'
import type { Platform, BuildTaskInfo, DeploymentRecord } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { useApplicationStore } from '@/stores/applicationStore'
import BuildTaskModal from '@/components/BuildTaskModal'
import { PLATFORM_ICON_MAP, PLATFORM_LABEL_MAP, BUILD_STATUS_CONFIG } from '../../constants'
import styles from '../../index.module.scss'

// ─── 部署状态常量 ─────────────────────────────────────────────────────────────

const DEPLOY_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '排队中', color: 'var(--color-text-tertiary)' },
  building: { label: '构建中', color: 'var(--color-brand-text)' },
  deploying: { label: '部署中', color: 'var(--color-brand-text)' },
  success: { label: '已上线', color: 'var(--color-success-text)' },
  failed: { label: '失败', color: 'var(--color-error-text)' },
}

const DEPLOY_STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <ClockCircleOutlined />,
  building: <LoadingOutlined />,
  deploying: <LoadingOutlined />,
  success: <CheckCircleOutlined />,
  failed: <CloseCircleOutlined />,
}

// ─── BuildActions 组件 ──────────────────────────────────────────────────────

const BuildActions: React.FC = () => {
  const { id: applicationId } = useParams<{ id: string }>()
  const { message } = App.useApp()
  const { appName, designSize, getSerializedUI } = useApplicationStore()

  // ── 构建任务状态 ──────────────────────────────────────────────────────────
  const [buildModalOpen, setBuildModalOpen] = useState(false)
  const [buildTaskId, setBuildTaskId] = useState<string | null>(null)
  const [buildSubmitting, setBuildSubmitting] = useState(false)
  const [buildTasks, setBuildTasks] = useState<BuildTaskInfo[]>([])
  const [viewedTaskIds, setViewedTaskIds] = useState<Set<string>>(new Set())
  const buildPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── 部署历史状态 ─────────────────────────────────────────────────────────
  const [deployHistory, setDeployHistory] = useState<DeploymentRecord[]>([])
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const mountedRef = useRef(true)

  // ── 构建任务轮询 ─────────────────────────────────────────────────────────
  const pollBuildTasks = useCallback(async () => {
    setBuildTasks((prev) => {
      const activeTasks = prev.filter((t) => t.status === 'pending' || t.status === 'running')
      if (activeTasks.length === 0) return prev
      Promise.all(activeTasks.map((t) => buildApi.getBuildStatus(t.taskId).catch(() => null))).then(
        (results) => {
          setBuildTasks((current) => {
            const updated = [...current]
            results.forEach((res) => {
              if (!res) return
              const idx = updated.findIndex((t) => t.taskId === res.task.taskId)
              if (idx !== -1) updated[idx] = res.task
            })
            return updated
          })
        },
      )
      return prev
    })
  }, [])

  useEffect(() => {
    const hasActive = buildTasks.some((t) => t.status === 'pending' || t.status === 'running')
    if (hasActive) {
      if (!buildPollTimerRef.current) {
        buildPollTimerRef.current = setInterval(pollBuildTasks, 2000)
      }
    } else {
      if (buildPollTimerRef.current) {
        clearInterval(buildPollTimerRef.current)
        buildPollTimerRef.current = null
      }
    }
    return () => {
      if (buildPollTimerRef.current) {
        clearInterval(buildPollTimerRef.current)
        buildPollTimerRef.current = null
      }
    }
  }, [buildTasks, pollBuildTasks])

  // ── 加载部署历史 ─────────────────────────────────────────────────────────
  const fetchDeployHistory = useCallback(async () => {
    if (!applicationId) return
    try {
      const res = await deployApi.getDeployHistory(applicationId, 10)
      if (mountedRef.current) {
        setDeployHistory(res.data ?? [])
      }
    } catch { /* 静默 */ }
  }, [applicationId])

  useEffect(() => {
    mountedRef.current = true
    fetchDeployHistory()
    return () => { mountedRef.current = false }
  }, [fetchDeployHistory])

  // ── 计算角标状态 ────────────────────────────────────────────────────────
  const unviewedTasks = buildTasks.filter((t) => !viewedTaskIds.has(t.taskId))
  const activeTasks = buildTasks.filter((t) => t.status === 'pending' || t.status === 'running')
  const badgeCount = unviewedTasks.length
  const showProcessingDot =
    badgeCount === 1 &&
    activeTasks.length === 1 &&
    unviewedTasks[0]?.status !== 'success' &&
    unviewedTasks[0]?.status !== 'failed'

  // ── 构建动作 ─────────────────────────────────────────────────────────────
  const handleBuild = useCallback(
    async (platform: Platform) => {
      if (!appName.trim()) { message.warning('请先输入应用名称'); return }
      if (!applicationId) return
      setBuildSubmitting(true)
      try {
        const uiJSON = getSerializedUI() || '{}'
        const res = await buildApi.submitBuild({ uiJSON, appName, platform, width: designSize.width, height: designSize.height, canvasVersion: canvasVersion ?? 'unknown' })
        const newTask: BuildTaskInfo = { taskId: res.taskId, appName, platform, status: 'pending', createdAt: Date.now(), updatedAt: Date.now() }
        setBuildTasks((prev) => [newTask, ...prev])
        setBuildTaskId(res.taskId)
        setBuildModalOpen(true)
        message.success('构建任务已提交')
      } catch (error: unknown) {
        message.error(getErrorMessage(error))
      } finally {
        setBuildSubmitting(false)
      }
    },
    [appName, applicationId, designSize, getSerializedUI, message],
  )

  // ── 回滚 ─────────────────────────────────────────────────────────────────
  const handleRollback = useCallback(async (deploymentId: string) => {
    if (!applicationId) return
    try {
      const res = await deployApi.rollback(deploymentId)
      if (!mountedRef.current || !res.data) return
      const { deploymentId: newId, status, message: msg } = res.data
      message.success(msg || '回滚任务已创建')
    } catch (err: unknown) {
      if (mountedRef.current) message.error(getErrorMessage(err))
    }
  }, [applicationId, message])

  // ── 构建产物菜单项 ───────────────────────────────────────────────────────
  const artifactMenuItems: MenuProps['items'] =
    buildTasks.length > 0
      ? buildTasks.map((task) => ({
          key: `artifact-${task.taskId}`,
          label: (
            <div className={styles.artifactItem}>
              <span className={styles.artifactIcon}>{(() => { const Icon = PLATFORM_ICON_MAP[task.platform]; return <Icon /> })()}</span>
              <span className={styles.artifactPlatform}>{PLATFORM_LABEL_MAP[task.platform]}</span>
              <span className={styles.artifactStatus} style={{ color: BUILD_STATUS_CONFIG[task.status].color }}>
                {(() => { const StatusIcon = BUILD_STATUS_CONFIG[task.status].icon; return <StatusIcon /> })()}
                <span className={styles.artifactStatusLabel}>{BUILD_STATUS_CONFIG[task.status].label}</span>
              </span>
              {task.status === 'success' && (
                <span className={styles.artifactDownload} onClick={(e) => { e.stopPropagation(); buildApi.downloadBuildArtifact(task.taskId) }}>
                  <DownloadOutlined />
                </span>
              )}
            </div>
          ),
          onClick: () => { setViewedTaskIds((prev) => new Set([...prev, task.taskId])); setBuildTaskId(task.taskId); setBuildModalOpen(true) },
        }))
      : [{ key: 'no-artifacts', label: <span className={styles.artifactEmpty}>暂无构建记录</span>, disabled: true }]

  // ── 部署历史菜单项 ───────────────────────────────────────────────────────
  const deployHistoryItems: MenuProps['items'] = deployHistory.length > 0
    ? deployHistory.slice(0, 5).map((dep) => ({
        key: `deploy-${dep.deploymentId}`,
        label: (
          <div className={styles.artifactItem}>
            <span className={styles.artifactStatus} style={{ color: DEPLOY_STATUS_CONFIG[dep.status]?.color }}>
              {DEPLOY_STATUS_ICON[dep.status]}
              <span className={styles.artifactStatusLabel}>{DEPLOY_STATUS_CONFIG[dep.status]?.label || dep.status}</span>
            </span>
            {dep.status === 'success' && (
              <Popconfirm title="确认回滚到此版本？" onConfirm={(e) => { e?.stopPropagation(); handleRollback(dep.deploymentId) }} onCancel={(e) => e?.stopPropagation()} okText="确认" cancelText="取消">
                <span className={styles.artifactDownload} onClick={(e) => e.stopPropagation()}><RollbackOutlined /></span>
              </Popconfirm>
            )}
          </div>
        ),
      }))
    : [{ key: 'no-deploy', label: <span className={styles.artifactEmpty}>暂无部署记录</span>, disabled: true }]

  // ── 下拉菜单结构 ─────────────────────────────────────────────────────────
  const buildMenuItems: MenuProps['items'] = [
    // ── 部署目标 ──
    { key: 'group-target', type: 'group', label: '部署目标' },
    { key: 'web', icon: <GlobalOutlined />, label: '网页', onClick: () => handleBuild('web' as Platform) },
    { key: 'desktop', icon: <DesktopOutlined />, label: '桌面客户端', onClick: () => handleBuild(navigator.platform.toLowerCase().includes('mac') ? 'mac' : navigator.platform.toLowerCase().includes('linux') ? 'linux' : 'win') },
    { key: 'ios', icon: <AppleOutlined />, label: 'iOS', onClick: () => handleBuild('ios' as Platform) },
    { key: 'android', icon: <AndroidOutlined />, label: 'Android', onClick: () => handleBuild('android' as Platform) },

    // ── 最近部署 ──
    { type: 'divider' },
    { key: 'group-history', type: 'group', label: '最近部署' },
    ...deployHistoryItems,
    ...(deployHistory.length > 0 ? [{ key: 'view-all-history', label: <span style={{ fontSize: 12, color: 'var(--color-info-text)' }}>查看全部部署历史</span>, onClick: () => setHistoryModalOpen(true) }] : []),

    // ── 部署列表 ──
    { type: 'divider' },
    { key: 'group-artifacts', type: 'group', label: '部署列表' },
    ...artifactMenuItems,
  ]

  const onDropdownOpen = useCallback(() => {
    setViewedTaskIds((prev) => new Set([...prev, ...buildTasks.map((t) => t.taskId)]))
  }, [buildTasks])

  return (
    <>
      <Dropdown menu={{ items: buildMenuItems, onClick: onDropdownOpen }} trigger={['hover']} placement="bottomRight"
        styles={{ root: { paddingTop: 6 } }} classNames={{ root: styles.buildDropdown }}
        mouseEnterDelay={0} mouseLeaveDelay={0.15}
        onOpenChange={(open) => { if (open) onDropdownOpen() }}
      >
        <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} disabled={buildSubmitting}>
          <Badge count={showProcessingDot ? 0 : badgeCount} dot={showProcessingDot}
            status={showProcessingDot ? 'processing' : undefined} size="small" offset={[4, -4]}
            styles={{ indicator: { fontSize: 10, minWidth: 14, height: 14, lineHeight: '14px', padding: '0 3px' } }}
          >
            {buildSubmitting ? <span className={styles.actionSpinner} /> : <RocketOutlined />}
          </Badge>
        </button>
      </Dropdown>

      <BuildTaskModal open={buildModalOpen} onClose={() => setBuildModalOpen(false)} taskId={buildTaskId} />

      {/* ── 部署历史全览弹窗 ── */}
      <Modal title="部署历史" open={historyModalOpen} onCancel={() => setHistoryModalOpen(false)} footer={null} width={600}>
        {deployHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-disabled)' }}>暂无部署记录</div>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {deployHistory.map((dep) => (
              <div key={dep.deploymentId} style={{ padding: '12px 16px', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="状态">
                    <Tag color={dep.status === 'success' ? 'success' : dep.status === 'failed' ? 'error' : 'processing'}>
                      {DEPLOY_STATUS_CONFIG[dep.status]?.label || dep.status}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="类型">{dep.deployType === 'fullstack' ? '全栈' : '静态'}</Descriptions.Item>
                  <Descriptions.Item label="版本">v{dep.version}</Descriptions.Item>
                  <Descriptions.Item label="时间">{dep.createdAt ? new Date(dep.createdAt).toLocaleString() : '-'}</Descriptions.Item>
                  {dep.url && <Descriptions.Item label="访问地址"><a href={dep.url} target="_blank" rel="noopener noreferrer">{dep.url}</a></Descriptions.Item>}
                  <Descriptions.Item label="进度"><Progress percent={dep.progress} size="small" style={{ width: 120 }} /></Descriptions.Item>
                </Descriptions>
                {dep.error && <div style={{ color: 'var(--color-error-text)', fontSize: 12, marginTop: 4 }}>错误: {dep.error}</div>}
                {dep.status === 'success' && (
                  <Popconfirm title="确认回滚到此版本？" onConfirm={() => handleRollback(dep.deploymentId)} okText="确认" cancelText="取消">
                    <Button size="small" icon={<RollbackOutlined />} style={{ marginTop: 8 }}>回滚到此版本</Button>
                  </Popconfirm>
                )}
              </div>
            ))}
          </Space>
        )}
      </Modal>
    </>
  )
}

export default BuildActions
