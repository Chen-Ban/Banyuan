/**
 * TenantSettings — 租户管理设置页
 *
 * 支持：
 *   - 查看/切换租户（用户:租户 N:N）
 *   - 当前方案与用量
 *   - 团队成员管理
 */

import { useState, useEffect, useCallback } from 'react'
import { Typography, Select, Button, message, Spin, Empty, Table, Tag, Modal, Input, Space, App } from 'antd'
import { PlusOutlined, UserAddOutlined } from '@ant-design/icons'
import { tenantApi, authApi } from '@/api'
import { useAuthStore } from '@/stores/authStore'
import type { TenantInfo, MemberInfo, CreditUsage } from '@/api/tenants'
import styles from './TenantSettings.module.scss'

const { Title, Text } = Typography

// ─── 主组件 ───────────────────────────────────────────────────────────────────

const TenantSettings: React.FC = () => {
  const { message: msg } = App.useApp()
  const user = useAuthStore((s) => s.user)
  const setTokens = useAuthStore((s) => s.setTokens)
  const login = useAuthStore((s) => s.login)

  const [tenants, setTenants] = useState<TenantInfo[]>([])
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [switching, setSwitching] = useState(false)

  const [members, setMembers] = useState<MemberInfo[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  const [usage, setUsage] = useState<CreditUsage | null>(null)
  const [loadingUsage, setLoadingUsage] = useState(false)

  // 创建租户弹窗
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)

  // 邀请弹窗
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviting, setInviting] = useState(false)

  const currentTenantId = user?.tenantId

  // ── 加载租户列表 ──────────────────────────────────────────────────────────

  const loadTenants = useCallback(() => {
    setLoadingTenants(true)
    tenantApi
      .listMyTenants()
      .then((res) => {
        if (res.data) setTenants(res.data)
      })
      .catch(() => msg.warning('加载租户列表失败'))
      .finally(() => setLoadingTenants(false))
  }, [msg])

  useEffect(() => {
    loadTenants()
  }, [loadTenants])

  // ── 加载成员 & 用量 ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentTenantId) return

    setLoadingMembers(true)
    tenantApi
      .listMembers(currentTenantId)
      .then((res) => {
        if (res.data) setMembers(res.data)
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoadingMembers(false))

    setLoadingUsage(true)
    tenantApi
      .getMonthlyUsage()
      .then((res) => {
        if (res.data) setUsage(res.data)
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoadingUsage(false))
  }, [currentTenantId])

  // ── 切换租户 ──────────────────────────────────────────────────────────────

  const handleSwitchTenant = useCallback(
    async (tenantId: string) => {
      if (tenantId === currentTenantId) return
      setSwitching(true)
      try {
        const res = await tenantApi.switchTenant(tenantId)
        if (res.data) {
          setTokens(res.data)
          const meRes = await authApi.me()
          if (meRes.data) {
            login(meRes.data, res.data)
          }
          msg.success('已切换租户')
        }
      } catch {
        msg.error('切换租户失败')
      } finally {
        setSwitching(false)
      }
    },
    [currentTenantId, setTokens, login, msg],
  )

  // ── 创建租户 ──────────────────────────────────────────────────────────────

  const handleCreateTenant = useCallback(async () => {
    if (!createName.trim()) {
      msg.warning('请输入租户名称')
      return
    }
    setCreating(true)
    try {
      const res = await tenantApi.createTenant(createName.trim())
      if (res.data) {
        setTenants((prev) => [...prev, res.data!])
        msg.success('租户创建成功')
        setCreateOpen(false)
        setCreateName('')
      }
    } catch {
      msg.error('创建租户失败')
    } finally {
      setCreating(false)
    }
  }, [createName, msg])

  // ── 邀请成员 ──────────────────────────────────────────────────────────────

  const handleInvite = useCallback(async () => {
    if (!inviteUsername.trim() || !currentTenantId) return
    setInviting(true)
    try {
      await tenantApi.inviteMember(currentTenantId, inviteUsername.trim())
      msg.success('邀请已发送')
      setInviteOpen(false)
      setInviteUsername('')
    } catch {
      msg.error('邀请失败')
    } finally {
      setInviting(false)
    }
  }, [inviteUsername, currentTenantId, msg])

  const handleRemoveMember = useCallback(
    async (targetUserId: string) => {
      if (!currentTenantId) return
      Modal.confirm({
        title: '移除成员',
        content: '确定要移除该成员吗？',
        okText: '移除',
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await tenantApi.removeMember(currentTenantId, targetUserId)
            setMembers((prev) => prev.filter((m) => m.userId !== targetUserId))
            msg.success('成员已移除')
          } catch {
            msg.error('移除失败')
          }
        },
      })
    },
    [currentTenantId, msg],
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

  // ── 无租户状态 ────────────────────────────────────────────────────────────

  if (!loadingTenants && tenants.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.content}>
          <Title level={3} className={styles.title}>设置</Title>
          <section className={styles.section}>
            <Title level={5} className={styles.sectionTitle}>租户管理</Title>
            <Empty
              description="你还没有加入任何租户。创建一个新租户开始使用。"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                创建租户
              </Button>
            </Empty>
          </section>
        </div>

        <Modal
          title="创建新租户"
          open={createOpen}
          onOk={handleCreateTenant}
          onCancel={() => { setCreateOpen(false); setCreateName('') }}
          confirmLoading={creating}
          okText="创建"
          cancelText="取消"
        >
          <Input
            placeholder="输入租户名称"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onPressEnter={handleCreateTenant}
          />
        </Modal>
      </div>
    )
  }

  // ── 正常渲染 ──────────────────────────────────────────────────────────────

  const currentTenant = tenants.find((t) => t.tenantId === currentTenantId)
  const usagePercent = usage && usage.limit > 0 ? Math.round((usage.used / usage.limit) * 100) : 0

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <Title level={3} className={styles.title}>设置</Title>

        {/* ── 租户切换 ──────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <Title level={5} className={styles.sectionTitle}>当前租户</Title>
          <Text type="secondary" className={styles.sectionDesc}>
            你属于 {tenants.length} 个租户，切换租户后应用和用量数据会相应变化。
          </Text>
          <div className={styles.tenantRow}>
            {loadingTenants ? (
              <Spin size="small" />
            ) : (
              <Select
                value={currentTenantId}
                onChange={handleSwitchTenant}
                loading={switching}
                className={styles.tenantSelect}
                options={tenants.map((t) => ({
                  value: t.tenantId,
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
                <Tag color={currentTenant?.plan === 'pro' ? 'blue' : 'default'}>
                  {currentTenant?.plan === 'pro' ? 'Pro' : 'Free'}
                </Tag>
              </div>
              <div className={styles.usageRow}>
                <span className={styles.usageLabel}>本月用量</span>
                <span className={styles.usageValue}>
                  {usage.used.toLocaleString()} / {usage.limit.toLocaleString()} credits
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

      {/* ── 创建租户弹窗 ────────────────────────────────────────────────── */}
      <Modal
        title="创建新租户"
        open={createOpen}
        onOk={handleCreateTenant}
        onCancel={() => { setCreateOpen(false); setCreateName('') }}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="输入租户名称"
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          onPressEnter={handleCreateTenant}
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

export default TenantSettings
