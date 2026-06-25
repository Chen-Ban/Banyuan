/**
 * BuildActions — 顶部栏右侧「生成应用」操作
 *
 * 内聚构建相关的全部逻辑：
 *   - 构建任务列表 + 轮询状态更新
 *   - 提交构建（handleBuild，按平台）
 *   - 未查看角标计算
 *   - 生成应用下拉（构建目标 + 产物列表）
 *   - 构建任务详情弹窗（BuildTaskModal）
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { App, Badge, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import {
  RocketOutlined,
  GlobalOutlined,
  DesktopOutlined,
  AppleOutlined,
  AndroidOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import { version as canvasVersion } from '@banyuan/banvasgl'
import { buildApi } from '@/api'
import type { Platform, BuildTaskInfo } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { useApplicationStore } from '@/stores/applicationStore'
import BuildTaskModal from '@/components/BuildTaskModal'
import { PLATFORM_ICON_MAP, PLATFORM_LABEL_MAP, BUILD_STATUS_CONFIG } from '../../constants'
import styles from '../../index.module.scss'

const BuildActions: React.FC = () => {
  const { id: applicationId } = useParams<{ id: string }>()
  const { message } = App.useApp()
  const { appName, designSize, getSerializedUI } = useApplicationStore()

  // ── 构建相关状态 ────────────────────────────────────────────────────────────
  const [buildModalOpen, setBuildModalOpen] = useState(false)
  const [buildTaskId, setBuildTaskId] = useState<string | null>(null)
  const [buildSubmitting, setBuildSubmitting] = useState(false)

  // 构建任务列表（本地会话内记录，含正在构建 + 已完成）
  const [buildTasks, setBuildTasks] = useState<BuildTaskInfo[]>([])
  // 已查看过的 taskId 集合（用于计算未查看数量）
  const [viewedTaskIds, setViewedTaskIds] = useState<Set<string>>(new Set())
  // 轮询定时器
  const buildPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── 构建任务轮询 ──────────────────────────────────────────────────────────
  // 对所有 pending/running 的任务轮询状态更新
  const pollBuildTasks = useCallback(async () => {
    setBuildTasks((prev) => {
      const activeTasks = prev.filter((t) => t.status === 'pending' || t.status === 'running')
      if (activeTasks.length === 0) return prev

      // 并发查询所有活跃任务
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

  // 有活跃任务时启动轮询，全部终态后停止
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

  // 计算角标状态
  const unviewedTasks = buildTasks.filter((t) => !viewedTaskIds.has(t.taskId))
  const activeTasks = buildTasks.filter((t) => t.status === 'pending' || t.status === 'running')
  const badgeCount = unviewedTasks.length
  const showProcessingDot =
    badgeCount === 1 &&
    activeTasks.length === 1 &&
    unviewedTasks[0]?.status !== 'success' &&
    unviewedTasks[0]?.status !== 'failed'

  // ── 生成应用 ──────────────────────────────────────────────────────────────
  // getSerializedUI 画布在线时取实时态，离线时自动回退到 store.uiJSON
  const handleBuild = useCallback(
    async (platform: Platform) => {
      if (!appName.trim()) {
        message.warning('请先输入应用名称')
        return
      }
      if (!applicationId) return
      setBuildSubmitting(true)
      try {
        const uiJSON = getSerializedUI() || '{}'
        const res = await buildApi.submitBuild({
          uiJSON,
          appName,
          platform,
          width: designSize.width,
          height: designSize.height,
          canvasVersion: canvasVersion ?? 'unknown',
        })
        // 新任务加入列表（初始 pending 状态）
        const newTask: BuildTaskInfo = {
          taskId: res.taskId,
          appName,
          platform,
          status: 'pending',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
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

  // ── 生成应用下拉菜单 ────────────────────────────────────────────────────────
  // 产物列表菜单项
  const artifactMenuItems: MenuProps['items'] =
    buildTasks.length > 0
      ? buildTasks.map((task) => ({
          key: `artifact-${task.taskId}`,
          label: (
            <div className={styles.artifactItem}>
              <span className={styles.artifactIcon}>
                {(() => {
                  const Icon = PLATFORM_ICON_MAP[task.platform]
                  return <Icon />
                })()}
              </span>
              <span className={styles.artifactPlatform}>{PLATFORM_LABEL_MAP[task.platform]}</span>
              <span
                className={styles.artifactStatus}
                style={{ color: BUILD_STATUS_CONFIG[task.status].color }}
              >
                {(() => {
                  const StatusIcon = BUILD_STATUS_CONFIG[task.status].icon
                  return <StatusIcon />
                })()}
                <span className={styles.artifactStatusLabel}>{BUILD_STATUS_CONFIG[task.status].label}</span>
              </span>
              {task.status === 'success' && (
                <span
                  className={styles.artifactDownload}
                  onClick={(e) => {
                    e.stopPropagation()
                    buildApi.downloadBuildArtifact(task.taskId)
                  }}
                >
                  <DownloadOutlined />
                </span>
              )}
            </div>
          ),
          onClick: () => {
            // 标记为已查看
            setViewedTaskIds((prev) => new Set([...prev, task.taskId]))
            setBuildTaskId(task.taskId)
            setBuildModalOpen(true)
          },
        }))
      : [
          {
            key: 'no-artifacts',
            label: <span className={styles.artifactEmpty}>暂无构建记录</span>,
            disabled: true,
          },
        ]

  const buildMenuItems: MenuProps['items'] = [
    { key: 'group-target', type: 'group', label: '构建目标' },
    { key: 'web', icon: <GlobalOutlined />, label: '网页', onClick: () => handleBuild('web' as Platform) },
    {
      key: 'desktop',
      icon: <DesktopOutlined />,
      label: '桌面客户端',
      onClick: () =>
        handleBuild(
          navigator.platform.toLowerCase().includes('mac')
            ? 'mac'
            : navigator.platform.toLowerCase().includes('linux')
              ? 'linux'
              : 'win',
        ),
    },
    { key: 'ios', icon: <AppleOutlined />, label: 'iOS', onClick: () => handleBuild('ios' as Platform) },
    {
      key: 'android',
      icon: <AndroidOutlined />,
      label: 'Android',
      onClick: () => handleBuild('android' as Platform),
    },
    { type: 'divider' },
    { key: 'group-artifacts', type: 'group', label: '产物列表' },
    ...artifactMenuItems,
  ]

  return (
    <>
      <Dropdown
        menu={{
          items: buildMenuItems,
          onClick: () => {
            // 打开下拉时标记所有任务为已查看
            setViewedTaskIds((prev) => new Set([...prev, ...buildTasks.map((t) => t.taskId)]))
          },
        }}
        trigger={['hover']}
        placement="bottomRight"
        styles={{ root: { paddingTop: 6 } }}
        classNames={{ root: styles.buildDropdown }}
        mouseEnterDelay={0}
        mouseLeaveDelay={0.15}
        onOpenChange={(open) => {
          if (open) {
            // 展开时标记所有任务为已查看
            setViewedTaskIds((prev) => new Set([...prev, ...buildTasks.map((t) => t.taskId)]))
          }
        }}
      >
        <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} disabled={buildSubmitting}>
          <Badge
            count={showProcessingDot ? 0 : badgeCount}
            dot={showProcessingDot}
            status={showProcessingDot ? 'processing' : undefined}
            size="small"
            offset={[4, -4]}
            styles={{
              indicator: { fontSize: 10, minWidth: 14, height: 14, lineHeight: '14px', padding: '0 3px' },
            }}
          >
            {buildSubmitting ? <span className={styles.actionSpinner} /> : <RocketOutlined />}
          </Badge>
        </button>
      </Dropdown>

      <BuildTaskModal open={buildModalOpen} onClose={() => setBuildModalOpen(false)} taskId={buildTaskId} />
    </>
  )
}

export default BuildActions
