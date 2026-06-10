/**
 * ApplicationLayout
 *
 * 应用级嵌套路由容器，子页面通过 React Router Outlet 渲染：
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  ← 返回    [ ▶预览 | ✏编辑 ]  [ 数据库 ]  [ 云函数 ]    💾  🚀  │
 *   ├──────────────────────────────────────────────────────────────────┤
 *   │                                                                  │
 *   │   <Outlet />  （预览 / 画布 / 数据库 / 云函数 子页面内容）       │
 *   │                                                                  │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * 职责：
 *   - 加载并管理应用元数据（名称、描述），写入 applicationStore 供各处读取
 *   - 提供保存（handleSave）和生成应用（handleBuild）操作
 *   - Tab 导航通过 React Router navigate 切换子路由
 *   - 画布位置是 Segmented（预览 | 编辑），对应 /preview 和 /ui 两个子路由
 *   - 数据库和云函数是独立子路由（/database、/functions）
 *   - 管理 PreviewServer 生命周期（应用级）
 *
 * 重构后不再提供 AppLayoutCtx。所有共享状态走 useApplicationStore。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation, Outlet } from 'react-router-dom'
import { App, Badge, Dropdown, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import {
  DatabaseOutlined,
  FunctionOutlined,
  SearchOutlined,
  SaveOutlined,
  RocketOutlined,
  ArrowLeftOutlined,
  GlobalOutlined,
  DesktopOutlined,
  AppleOutlined,
  AndroidOutlined,
  PlayCircleOutlined,
  EditOutlined,
  LaptopOutlined,
  DownOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { version as canvasVersion } from '@banyuan/banvasgl'
import { applicationApi, buildApi } from '@/api'
import type { Platform, BuildTaskInfo, BuildStatus } from '@/api'
import { getErrorMessage } from '@/utils/error'
import { useApplicationStore } from '@/stores/applicationStore'
import BuildTaskModal from '@/components/BuildTaskModal'
import { PreviewServerCtx, usePreviewServer } from './PreviewServerCtx'
import { DEVICE_GROUPS, ALL_DEVICE_PRESETS } from './devicePresets'
import styles from './index.module.scss'


const ApplicationLayout: React.FC = () => {
  const { id: application_id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()

  // ── Preview Server 生命周期管理（应用级） ─────────────────────────────────
  const previewServer = usePreviewServer(application_id)

  // ── ApplicationStore ────────────────────────────────────────────────────────
  const {
    appName: applicationName,
    setAppName,
    designSize,
    changeDesignSize,
    getSerializedApp,
    requestFlush,
    reset: resetStore,
    load: loadStore,
  } = useApplicationStore()

  // ── 应用元数据（本地 description 状态，不进 store） ─────────────────────────
  const [applicationDescription, setApplicationDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef(applicationName)
  const descRef = useRef(applicationDescription)
  nameRef.current = applicationName
  descRef.current = applicationDescription

  // ── 构建相关 ──────────────────────────────────────────────────────────────
  const [buildModalOpen, setBuildModalOpen] = useState(false)
  const [buildTaskId, setBuildTaskId] = useState<string | null>(null)
  const [buildSubmitting, setBuildSubmitting] = useState(false)

  // 构建任务列表（本地会话内记录，含正在构建 + 已完成）
  const [buildTasks, setBuildTasks] = useState<BuildTaskInfo[]>([])
  // 已查看过的 taskId 集合（用于计算未查看数量）
  const [viewedTaskIds, setViewedTaskIds] = useState<Set<string>>(new Set())
  // 轮询定时器
  const buildPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 平台图标映射
  const platformIconMap: Record<Platform, React.ReactNode> = {
    web: <GlobalOutlined />,
    mac: <DesktopOutlined />,
    win: <DesktopOutlined />,
    linux: <DesktopOutlined />,
    ios: <AppleOutlined />,
    android: <AndroidOutlined />,
  }

  // 平台显示名映射
  const platformLabelMap: Record<Platform, string> = {
    web: '网页',
    mac: 'macOS',
    win: 'Windows',
    linux: 'Linux',
    ios: 'iOS',
    android: 'Android',
  }

  // 状态配置
  const buildStatusConfig: Record<BuildStatus, { label: string; icon: React.ReactNode; color: string }> = {
    pending: { label: '排队中', icon: <ClockCircleOutlined style={{ color: 'var(--color-text-tertiary)' }} />, color: 'var(--color-text-tertiary)' },
    running: { label: '构建中', icon: <LoadingOutlined style={{ color: 'var(--color-brand-text)' }} />, color: 'var(--color-brand-text)' },
    success: { label: '已完成', icon: <CheckCircleOutlined style={{ color: 'var(--color-success-text)' }} />, color: 'var(--color-success-text)' },
    failed: { label: '失败', icon: <CloseCircleOutlined style={{ color: 'var(--color-error-text)' }} />, color: 'var(--color-error-text)' },
  }

  // ── 加载应用元数据 + 业务数据 ─────────────────────────────────────────────
  useEffect(() => {
    if (!application_id) return
    // 切换应用时重置 store
    resetStore()

    // 加载应用元数据（名称/描述）
    applicationApi.fetchApplication(application_id).then((res) => {
      const app = res.data!
      setAppName(app.name)
      setApplicationDescription(app.description || '')
    }).catch(() => {})

    // 加载业务数据（appJSON/collections/cloudFunctions）到 store
    loadStore(application_id)
  }, [application_id, setAppName, resetStore, loadStore])

  // ── 当前路由推导激活状态 ─────────────────────────────────────────────────
  const getActiveTab = (): 'preview' | 'ui' | 'database' | 'data-browser' | 'functions' => {
    if (location.pathname.endsWith('/database')) return 'database'
    if (location.pathname.endsWith('/data-browser')) return 'data-browser'
    if (location.pathname.endsWith('/functions')) return 'functions'
    if (location.pathname.endsWith('/ui')) return 'ui'
    return 'preview'
  }
  const activeTab = getActiveTab()

  // 记住画布区域的上次子态（预览/编辑），从数据库/云函数切回时恢复
  const lastCanvasTabRef = useRef<'preview' | 'ui'>(activeTab === 'ui' ? 'ui' : 'preview')
  if (activeTab === 'preview' || activeTab === 'ui') {
    lastCanvasTabRef.current = activeTab
  }

  const handleTabChange = useCallback((key: string) => {
    if (!application_id) return
    if (key === 'canvas') {
      // 切回画布区域时恢复上次子态
      navigate(`/application/${application_id}/${lastCanvasTabRef.current}`)
    } else {
      navigate(`/application/${application_id}/${key}`)
    }
  }, [navigate, application_id])

  // ── 保存应用 ──────────────────────────────────────────────────────────────
  // 1. requestFlush() — 通知画布将最新 appJSON 刷回 store
  // 2. store.save() — 将 store 中 appJSON/collections/cloudFunctions 通过聚合端点持久化
  // 3. 同时保存元数据（名称/描述）
  const handleSave = useCallback(async () => {
    if (!applicationName.trim()) {
      message.warning('请输入应用名称')
      return
    }
    if (!application_id) return
    setSaving(true)
    try {
      // 先将画布最新状态刷回 store（必须 await 以确保 appJSON 已写入 store）
      await requestFlush()
      // 然后并行执行：持久化业务数据 + 保存元数据
      await Promise.all([
        useApplicationStore.getState().save(),
        applicationApi.updateApplication(application_id, {
          name: nameRef.current,
          description: descRef.current,
        }),
      ])
      message.success('已保存')
    } catch (error: unknown) {
      message.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }, [applicationName, application_id, requestFlush])

  // ── 构建任务轮询 ──────────────────────────────────────────────────────────
  // 对所有 pending/running 的任务轮询状态更新
  const pollBuildTasks = useCallback(async () => {
    setBuildTasks(prev => {
      const activeTasks = prev.filter(t => t.status === 'pending' || t.status === 'running')
      if (activeTasks.length === 0) return prev

      // 并发查询所有活跃任务
      Promise.all(activeTasks.map(t => buildApi.getBuildStatus(t.taskId).catch(() => null)))
        .then(results => {
          setBuildTasks(current => {
            const updated = [...current]
            results.forEach(res => {
              if (!res) return
              const idx = updated.findIndex(t => t.taskId === res.task.taskId)
              if (idx !== -1) updated[idx] = res.task
            })
            return updated
          })
        })
      return prev
    })
  }, [])

  // 有活跃任务时启动轮询，全部终态后停止
  useEffect(() => {
    const hasActive = buildTasks.some(t => t.status === 'pending' || t.status === 'running')
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
  const unviewedTasks = buildTasks.filter(t => !viewedTaskIds.has(t.taskId))
  const activeTasks = buildTasks.filter(t => t.status === 'pending' || t.status === 'running')
  const badgeCount = unviewedTasks.length
  const showProcessingDot = badgeCount === 1 && activeTasks.length === 1 && unviewedTasks[0]?.status !== 'success' && unviewedTasks[0]?.status !== 'failed'

  // ── 生成应用 ──────────────────────────────────────────────────────────────
  // 优先用 store 的 getSerializedApp（画布在线时），否则从后端拉最新 appJSON
  const handleBuild = useCallback(async (platform: Platform) => {
    if (!applicationName.trim()) {
      message.warning('请先输入应用名称')
      return
    }
    if (!application_id) return
    setBuildSubmitting(true)
    try {
      let appJson: string
      if (getSerializedApp) {
        // UIPage 在线，直接取最新画布态
        appJson = getSerializedApp()
      } else {
        // UIPage 不在线（用户在数据库/云函数页），从后端拉已保存的 appJSON
        const res = await applicationApi.fetchApplication(application_id)
        appJson = res.data!.appJSON || '{}'
      }
      const res = await buildApi.submitBuild({
        appJson,
        appName: applicationName,
        platform,
        width: designSize.width,
        height: designSize.height,
        canvasVersion: canvasVersion ?? 'unknown',
      })
      // 新任务加入列表（初始 pending 状态）
      const newTask: BuildTaskInfo = {
        taskId: res.taskId,
        appName: applicationName,
        platform,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      setBuildTasks(prev => [newTask, ...prev])
      setBuildTaskId(res.taskId)
      setBuildModalOpen(true)
      message.success('构建任务已提交')
    } catch (error: unknown) {
      message.error(getErrorMessage(error))
    } finally {
      setBuildSubmitting(false)
    }
  }, [applicationName, application_id, designSize, getSerializedApp])

  // ── 生成应用下拉菜单 ────────────────────────────────────────────────────────
  // 产物列表菜单项
  const artifactMenuItems: MenuProps['items'] = buildTasks.length > 0
    ? buildTasks.map(task => ({
        key: `artifact-${task.taskId}`,
        label: (
          <div className={styles.artifactItem}>
            <span className={styles.artifactIcon}>{platformIconMap[task.platform]}</span>
            <span className={styles.artifactPlatform}>{platformLabelMap[task.platform]}</span>
            <span className={styles.artifactStatus} style={{ color: buildStatusConfig[task.status].color }}>
              {buildStatusConfig[task.status].icon}
              <span className={styles.artifactStatusLabel}>{buildStatusConfig[task.status].label}</span>
            </span>
            {task.status === 'success' && (
              <span
                className={styles.artifactDownload}
                onClick={e => { e.stopPropagation(); buildApi.downloadBuildArtifact(task.taskId) }}
              >
                <DownloadOutlined />
              </span>
            )}
          </div>
        ),
        onClick: () => {
          // 标记为已查看
          setViewedTaskIds(prev => new Set([...prev, task.taskId]))
          setBuildTaskId(task.taskId)
          setBuildModalOpen(true)
        },
      }))
    : [{ key: 'no-artifacts', label: <span className={styles.artifactEmpty}>暂无构建记录</span>, disabled: true }]

  const buildMenuItems: MenuProps['items'] = [
    { key: 'group-target', type: 'group', label: '构建目标' },
    { key: 'web', icon: <GlobalOutlined />, label: '网页', onClick: () => handleBuild('web' as Platform) },
    { key: 'desktop', icon: <DesktopOutlined />, label: '桌面客户端', onClick: () => handleBuild(navigator.platform.toLowerCase().includes('mac') ? 'mac' : navigator.platform.toLowerCase().includes('linux') ? 'linux' : 'win') },
    { key: 'ios', icon: <AppleOutlined />, label: 'iOS', onClick: () => handleBuild('ios' as Platform) },
    { key: 'android', icon: <AndroidOutlined />, label: 'Android', onClick: () => handleBuild('android' as Platform) },
    { type: 'divider' },
    { key: 'group-artifacts', type: 'group', label: '产物列表' },
    ...artifactMenuItems,
  ]

  // ── 机型选择器 ────────────────────────────────────────────────────────────────
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false)

  const deviceMenuItems: MenuProps['items'] = DEVICE_GROUPS.flatMap((group) => [
    { key: `group-${group.group}`, type: 'group' as const, label: group.group },
    ...group.items.map((preset) => ({
      key: preset.key,
      icon: group.icon,
      label: `${preset.label}（${preset.width}×${preset.height}）`,
      onClick: () => changeDesignSize({ width: preset.width, height: preset.height }),
    })),
  ])

  // 当前选中的设备标签
  const currentDeviceLabel = ALL_DEVICE_PRESETS.find(
    (p) => p.width === designSize.width && p.height === designSize.height,
  )?.label ?? `${designSize.width}×${designSize.height}`

  // 判断当前是否在画布区域（预览或编辑）
  const isCanvasArea = activeTab === 'preview' || activeTab === 'ui'
  void isCanvasArea // 保留供后续使用

  return (
    <PreviewServerCtx.Provider value={previewServer}>
      <div className={styles.layout}>

        {/* ── AppHeader：应用级工具栏 ── */}
        <div className={styles.appHeader}>
          {/* 左侧：返回首页按钮 */}
          <Tooltip title="返回首页">
            <button
              className={styles.backBtn}
              onClick={() => navigate('/')}
              aria-label="返回首页"
            >
              <ArrowLeftOutlined />
            </button>
          </Tooltip>

          {/* 机型选择器 */}
          <Dropdown
            menu={{ items: deviceMenuItems }}
            trigger={['click']}
            placement="bottomLeft"
            open={deviceDropdownOpen}
            onOpenChange={setDeviceDropdownOpen}
          >
            <button className={styles.devicePicker}>
              <LaptopOutlined />
              <span className={styles.deviceLabel}>{currentDeviceLabel}</span>
              <DownOutlined className={`${styles.deviceArrow}${deviceDropdownOpen ? ` ${styles.deviceArrowOpen}` : ''}`} />
            </button>
          </Dropdown>

          {/* 左侧弹性占位 */}
          <div className={styles.headerSpacer} />

          {/* Tab 胶囊：[ ▶预览 | ✏编辑 ]  [ 数据库 ]  [ 云函数 ] */}
          <div className={styles.tabCapsule}>
            {/* 画布区域 Segmented：预览 | 编辑 */}
            <div className={styles.canvasSegmented}>
              <Tooltip title="预览应用">
                <button
                  className={`${styles.segBtn} ${activeTab === 'preview' ? styles.segBtnActive : ''}`}
                  onClick={() => {
                    if (!application_id) return
                    navigate(`/application/${application_id}/preview`)
                  }}
                >
                  <PlayCircleOutlined />
                </button>
              </Tooltip>
              <Tooltip title="编辑应用">
                <button
                  className={`${styles.segBtn} ${activeTab === 'ui' ? styles.segBtnActive : ''}`}
                  onClick={() => {
                    if (!application_id) return
                    navigate(`/application/${application_id}/ui`)
                  }}
                >
                  <EditOutlined />
                </button>
              </Tooltip>
            </div>

            {/* 分隔线 */}
            <div className={styles.tabDivider} />

            {/* 数据库 Tab */}
            <Tooltip title="数据库">
              <button
                className={`${styles.tabBtn} ${activeTab === 'database' ? styles.tabBtnActive : ''}`}
                onClick={() => handleTabChange('database')}
              >
                <span className={styles.tabIcon}><DatabaseOutlined /></span>
              </button>
            </Tooltip>

            {/* 数据浏览 Tab */}
            <Tooltip title="数据浏览">
              <button
                className={`${styles.tabBtn} ${activeTab === 'data-browser' ? styles.tabBtnActive : ''}`}
                onClick={() => handleTabChange('data-browser')}
              >
                <span className={styles.tabIcon}><SearchOutlined /></span>
              </button>
            </Tooltip>

            {/* 分隔线（数据组 vs 云函数组） */}
            <div className={styles.tabDivider} />

            {/* 云函数 Tab */}
            <Tooltip title="云函数">
              <button
                className={`${styles.tabBtn} ${activeTab === 'functions' ? styles.tabBtnActive : ''}`}
                onClick={() => handleTabChange('functions')}
              >
                <span className={styles.tabIcon}><FunctionOutlined /></span>
              </button>
            </Tooltip>
          </div>

          {/* 右侧弹性占位 */}
          <div className={styles.headerSpacer} />

          {/* 操作胶囊：保存 / 生成应用 */}
          <div className={styles.actionCapsule}>
            <Tooltip title="保存">
              <button
                className={styles.actionBtn}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <span className={styles.actionSpinner} /> : <SaveOutlined />}
              </button>
            </Tooltip>
            <div className={styles.capsuleDivider} />
            <Dropdown
              menu={{
                items: buildMenuItems,
                onClick: () => {
                  // 打开下拉时标记所有任务为已查看
                  setViewedTaskIds(prev => new Set([...prev, ...buildTasks.map(t => t.taskId)]))
                },
              }}
              trigger={['hover']}
              placement="bottomRight"
              overlayStyle={{ paddingTop: 6 }}
              overlayClassName={styles.buildDropdown}
              mouseEnterDelay={0}
              mouseLeaveDelay={0.15}
              onOpenChange={(open) => {
                if (open) {
                  // 展开时标记所有任务为已查看
                  setViewedTaskIds(prev => new Set([...prev, ...buildTasks.map(t => t.taskId)]))
                }
              }}
            >
              <button
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                disabled={buildSubmitting}
              >
                <Badge
                  count={showProcessingDot ? 0 : badgeCount}
                  dot={showProcessingDot}
                  status={showProcessingDot ? 'processing' : undefined}
                  size="small"
                  offset={[4, -4]}
                  styles={{ indicator: { fontSize: 10, minWidth: 14, height: 14, lineHeight: '14px', padding: '0 3px' } }}
                >
                  {buildSubmitting ? <span className={styles.actionSpinner} /> : <RocketOutlined />}
                </Badge>
              </button>
            </Dropdown>
          </div>
        </div>

        {/* ── 子页面内容（通过 Outlet 渲染当前路由对应的子页面） ── */}
        <div className={styles.content}>
          <Outlet />
        </div>

      </div>

      <BuildTaskModal
        open={buildModalOpen}
        onClose={() => setBuildModalOpen(false)}
        taskId={buildTaskId}
      />
    </PreviewServerCtx.Provider>
  )
}

export default ApplicationLayout
