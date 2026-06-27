/**
 * TeamSettings — 团队管理设置页
 *
 * 支持：
 *   - 查看/切换团队（用户:团队 N:N）
 *   - 当前方案与用量
 *   - 团队成员管理
 */

import { useState, useEffect, useCallback } from 'react'
import { Typography, Select, Button, message, Spin, Empty, Table, Tag, Modal, Input, Space, App } from 'antd'
import { PlusOutlined, UserAddOutlined } from '@ant-design/icons'
import { teamApi, authApi } from '@/api'
import { useAuthStore } from '@/stores/authStore'
import type { TeamInfo, MemberInfo, CreditUsage } from '@/api/teams'
import styles from './TeamSettings.module.scss'

const { Title, Text } = Typography

// ─── 主组件 ───────────────────────────────────────────────────────────────────

const TeamSettings: React.FC = () => {
  const { message: msg } = App.useApp()
  const user = useAuthStore((s) => s.user)
  const setTokens = useAuthStore((s) => s.setTokens)
  const login = useAuthStore((s) => s.login)

  const [teams, setTeams] = useState<TeamInfo[]>([])
  const [loadingTeams, setLoadingTeams] = useState(true)
  const [switching, setSwitching] = useState(false)

  const [members, setMembers] = useState<MemberInfo[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  const [usage, setUsage] = useState<CreditUsage | null>(null)
  const [loadingUsage, setLoadingUsage] = useState(false)

  // 创建团队弹窗
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)

  // 邀请弹窗
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviting, setInviting] = useState(false)

  const currentTeamId = user?.teamId

  // ── 加载团队列表 ──────────────────────────────────────────────────────────

  const loadTeams = useCallback(() => {
    setLoadingTeams(true)
    teamApi
      .listMyTeams()
      .then((res) => {
        if (res.data) setTeams(res.data)
      })
      .catch(() => msg.warning('加载团队列表失败'))
      .finally(() => setLoadingTeams(false))
  }, [msg])

  useEffect(() => {
    loadTeams()
  }, [loadTeams])

  // ── 加载成员 & 用量 ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentTeamId) return

    setLoadingMembers(true)
    teamApi
      .listMembers(currentTeamId)
      .then((res) => {
        if (res.data) setMembers(res.data)
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoadingMembers(false))

    setLoadingUsage(true)
    teamApi
      .getMonthlyUsage()
      .then((res) => {
        if (res.data) setUsage(res.data)
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoadingUsage(false))
  }, [currentTeamId])

  // ── 切换团队 ──────────────────────────────────────────────────────────────

  const handleSwitchTeam = useCallback(
    async (teamId: string) => {
      if (teamId === currentTeamId) return
      setSwitching(true)
      try {
        const res = await teamApi.switchTeam(teamId)
        if (res.data) {
          setTokens(res.data)
          const meRes = await authApi.me()
          if (meRes.data) {
            login(meRes.data, res.data)
          }
        }
      } catch {
        msg.error('切换团队失败')
      } finally {
        setSwitching(false)
      }
    },
    [currentTeamId, setTokens, login, msg],
  )

  // 手动切换：带 toast
  const handleSwitchTeamWithToast = useCallback(
    async (teamId: string) => {
      await handleSwitchTeam(teamId)
      if (teamId !== currentTeamId) {
        msg.success('已切换团队')
      }
    },
    [handleSwitchTeam, currentTeamId, msg],
  )

  // ── 如果没有选中团队但有关联团队，自动切到第一个 ────────────────────────────

  useEffect(() => {
    if (!currentTeamId && teams.length > 0 && !switching) {
      handleSwitchTeam(teams[0].teamId)
    }
  }, [currentTeamId, teams, switching, handleSwitchTeam])

  // ── 创建团队 ──────────────────────────────────────────────────────────────

  const handleCreateTeam = useCallback(async () => {
    if (!createName.trim()) {
      msg.warning('请输入团队名称')
      return
    }
    setCreating(true)
    try {
      const res = await teamApi.createTeam(createName.trim())
      if (res.data) {
        setTeams((prev) => [...prev, res.data!])
        msg.success('团队创建成功')
        setCreateOpen(false)
        setCreateName('')
      }
    } catch {
      msg.error('创建团队失败')
    } finally {
      setCreating(false)
    }
  }, [createName, msg])

  // ── 邀请成员 ──────────────────────────────────────────────────────────────

  const handleInvite = useCallback(async () => {
    if (!inviteUsername.trim() || !currentTeamId) return
    setInviting(true)
    try {
      await teamApi.inviteMember(currentTeamId, inviteUsername.trim())
      msg.success('邀请已发送')
      setInviteOpen(false)
      setInviteUsername('')
    } catch {
      msg.error('邀请失败')
    } finally {
      setInviting(false)
    }
  }, [inviteUsername, currentTeamId, msg])

  const handleRemoveMember = useCallback(
    async (targetUserId: string) => {
      if (!currentTeamId) return
      Modal.confirm({
        title: '移除成员',
        content: '确定要移除该成员吗？',
        okText: '移除',
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await teamApi.removeMember(currentTeamId, targetUserId)
            setMembers((prev) => prev.filter((m) => m.userId !== targetUserId))
            msg.success('成员已移除')
          } catch {
            msg.error('移除失败')
          }
        },
      })
    },
    [currentTeamId, msg],
  )

  // ── 成员表格列 ────────────────────────────────────────────────────────────

  const memberColumns = [
    {
      title: '用户名',
      dataIndex: ['user', 'username'],
      key: 'username',
      render: (_: unknown, record: MemberInfo) => record.user?.username ?? record.userId,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'owner' ? 'gold' : role === 'admin' ? 'blue' : 'default'}>
          {role === 'owner' ? '拥有者' : role === 'admin' ? '管理员' : '成员'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : status === 'invited' ? 'orange' : 'red'}>
          {status === 'active' ? '已加入' : status === 'invited' ? '待接受' : '已禁用'}
        </Tag>
      ),
    },
    {
      title: '加入时间',
      dataIndex: 'joinedAt',
      key: 'joinedAt',
      render: (d: string) => (d ? new Date(d).toLocaleDateString('zh-CN') : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: MemberInfo) => {
        const isSelf = record.userId === user?.userId
        if (isSelf) return null
        return (
          <Button type="link" danger size="small" onClick={() => handleRemoveMember(record.userId)}>
            移除
          </Button>
        )
      },
    },
  ]

  // ── 无团队状态 ────────────────────────────────────────────────────────────

  if (!loadingTeams && teams.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          <Title level={3} className={styles.title}>设置</Title>
          <section className={styles.section}>
            <Title level={5} className={styles.sectionTitle}>团队管理</Title>
            <Empty
              description="你还没有加入任何团队。创建一个新团队开始使用。"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                创建团队
              </Button>
            </Empty>
          </section>
        </div>

        <Modal
          title="创建新团队"
          open={createOpen}
          onOk={handleCreateTeam}
          onCancel={() => { setCreateOpen(false); setCreateName('') }}
          confirmLoading={creating}
          okText="创建"
          cancelText="取消"
        >
          <Input
            placeholder="输入团队名称"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onPressEnter={handleCreateTeam}
          />
        </Modal>
      </div>
    )
  }

  // ── 正常渲染 ──────────────────────────────────────────────────────────────

  const currentTeam = teams.find((t) => t.teamId === currentTeamId)
  const usagePercent = usage && usage.total > 0 ? Math.round((usage.used / usage.total) * 100) : 0

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <Title level={3} className={styles.title}>设置</Title>

        {/* ── 团队切换 ──────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <Title level={5} className={styles.sectionTitle}>当前团队</Title>
          <Text type="secondary" className={styles.sectionDesc}>
            你属于 {teams.length} 个团队，切换团队后应用和用量数据会相应变化。
          </Text>
          <div className={styles.teamRow}>
            {loadingTeams ? (
              <Spin size="small" />
            ) : (
              <Select
                value={currentTeamId}
                onChange={handleSwitchTeamWithToast}
                loading={switching}
                className={styles.teamSelect}
                options={teams.map((t) => ({
                  value: t.teamId,
                  label: `${t.name}${t.plan === 'pro' ? ' (Pro)' : ''}`,
                }))}
              />
            )}
            <Button icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建
            </Button>
          </div>
        </section>

        {/* ── 方案与用量 ────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <Title level={5} className={styles.sectionTitle}>方案与用量</Title>
          {loadingUsage ? (
            <Spin size="small" />
          ) : usage ? (
            <div className={styles.usageCard}>
              <div className={styles.usageRow}>
                <span className={styles.usageLabel}>当前方案</span>
                <Tag color={currentTeam?.plan === 'pro' ? 'blue' : 'default'}>
                  {currentTeam?.plan === 'pro' ? 'Pro' : 'Free'}
                </Tag>
              </div>
              <div className={styles.usageRow}>
                <span className={styles.usageLabel}>本月用量</span>
                <span className={styles.usageValue}>
                  {usage.used.toLocaleString()} / {usage.total.toLocaleString()} credits
                </span>
              </div>
              <div className={styles.usageBar}>
                <div
                  className={styles.usageBarFill}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              <Text type="secondary" className={styles.usagePercent}>
                已使用 {usagePercent}%
              </Text>
            </div>
          ) : (
            <Text type="secondary">暂无用量数据</Text>
          )}
        </section>

        {/* ── 团队成员 ──────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Title level={5} className={styles.sectionTitle}>团队成员</Title>
            <Button
              type="primary"
              size="small"
              icon={<UserAddOutlined />}
              onClick={() => setInviteOpen(true)}
            >
              邀请成员
            </Button>
          </div>
          {loadingMembers ? (
            <Spin size="small" />
          ) : members.length > 0 ? (
            <Table
              dataSource={members}
              columns={memberColumns}
              rowKey="userId"
              size="small"
              pagination={false}
              className={styles.memberTable}
            />
          ) : (
            <Text type="secondary">暂无成员数据</Text>
          )}
        </section>
      </div>

      {/* ── 创建团队弹窗 ────────────────────────────────────────────────── */}
      <Modal
        title="创建新团队"
        open={createOpen}
        onOk={handleCreateTeam}
        onCancel={() => { setCreateOpen(false); setCreateName('') }}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="输入团队名称"
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          onPressEnter={handleCreateTeam}
        />
      </Modal>

      {/* ── 邀请弹窗 ──────────────────────────────────────────────────── */}
      <Modal
        title="邀请成员"
        open={inviteOpen}
        onOk={handleInvite}
        onCancel={() => setInviteOpen(false)}
        confirmLoading={inviting}
        okText="发送邀请"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">输入要邀请的用户名（Username）</Text>
          <Input
            placeholder="用户名"
            value={inviteUsername}
            onChange={(e) => setInviteUsername(e.target.value)}
            onPressEnter={handleInvite}
          />
        </Space>
      </Modal>
    </div>
  )
}

export default TeamSettings
