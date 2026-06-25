import { Context } from 'koa'
import crypto from 'crypto'
import { Tenant } from '../models/Tenant.js'
import { Membership } from '../models/Membership.js'
import { User } from '../models/User.js'

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function getEnumValue<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/**
 * 租户 & 成员关系管理控制器
 */
export class TenantController {
  /**
   * POST /api/tenants
   * Body: { name, plan? }
   * 创建租户 + 创建 owner membership。创建者自动成为 owner。
   */
  async create(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { name, plan } = ctx.request.body as { name?: string; plan?: string }

    if (!name || !name.trim()) {
      ctx.status = 400
      ctx.body = { success: false, message: '请输入团队名称' }
      return
    }

    const tenantId = generateId('tenant')
    const effectivePlan = getEnumValue(plan ?? 'free', ['free', 'pro'] as const, 'free')
    const membershipId = generateId('ms')

    await Tenant.create({
      tenantId,
      name: name.trim(),
      plan: effectivePlan,
    })

    await Membership.create({
      membershipId,
      userId,
      tenantId,
      role: 'owner',
      status: 'active',
      joinedAt: new Date(),
    })

    ctx.status = 201
    ctx.body = {
      success: true,
      data: {
        tenantId,
        name: name.trim(),
        plan: effectivePlan,
        role: 'owner',
      },
    }
  }

  /**
   * GET /api/tenants/:tenantId
   * 获取租户详情（需要是该租户的成员）
   */
  async getById(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { tenantId } = ctx.params

    const membership = await Membership.findOne({ userId, tenantId, status: 'active' }).lean()
    if (!membership) {
      ctx.status = 403
      ctx.body = { success: false, message: '你不是该租户的成员' }
      return
    }

    const tenant = await Tenant.findOne({ tenantId }).lean()
    if (!tenant) {
      ctx.status = 404
      ctx.body = { success: false, message: '租户不存在' }
      return
    }

    ctx.body = {
      success: true,
      data: { ...tenant, role: membership.role },
    }
  }

  /**
   * PUT /api/tenants/:tenantId
   * Body: { name?, plan? }
   * 更新租户信息（需要 owner 或 admin 角色）
   */
  async update(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { tenantId } = ctx.params

    const membership = await Membership.findOne({ userId, tenantId, status: 'active' }).lean()
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      ctx.status = 403
      ctx.body = { success: false, message: '无权修改租户信息' }
      return
    }

    const updates: Record<string, unknown> = {}
    const body = ctx.request.body as Record<string, unknown>

    if (typeof body.name === 'string' && body.name.trim()) {
      updates.name = body.name.trim()
    }
    if (typeof body.plan === 'string') {
      updates.plan = getEnumValue(body.plan, ['free', 'pro'] as const, 'free')
    }

    if (Object.keys(updates).length === 0) {
      ctx.status = 400
      ctx.body = { success: false, message: '没有可更新的字段' }
      return
    }

    await Tenant.updateOne({ tenantId }, { $set: updates })
    const tenant = await Tenant.findOne({ tenantId }).lean()

    ctx.body = { success: true, data: tenant }
  }

  /**
   * DELETE /api/tenants/:tenantId
   * 删除租户（需要 owner 角色）
   */
  async remove(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { tenantId } = ctx.params

    const membership = await Membership.findOne({ userId, tenantId, status: 'active' }).lean()
    if (!membership || membership.role !== 'owner') {
      ctx.status = 403
      ctx.body = { success: false, message: '只有 owner 才能删除租户' }
      return
    }

    // 级联删除租户 + 所有成员关系
    await Tenant.deleteOne({ tenantId })
    await Membership.deleteMany({ tenantId })

    ctx.body = { success: true, message: '租户已删除' }
  }

  // ─── 成员管理 ─────────────────────────────────────────────────────────────

  /**
   * GET /api/tenants/:tenantId/members
   * 获取租户成员列表
   */
  async listMembers(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { tenantId } = ctx.params

    const myMembership = await Membership.findOne({ userId, tenantId, status: 'active' }).lean()
    if (!myMembership) {
      ctx.status = 403
      ctx.body = { success: false, message: '你不是该租户的成员' }
      return
    }

    const memberships = await Membership.find({ tenantId }).sort({ joinedAt: 1 }).lean()
    const userIds = memberships.map((m) => m.userId)
    const users = await User.find({ userId: { $in: userIds } }).lean()
    const userMap = new Map(users.map((u) => [u.userId, u]))

    const members = memberships.map((m) => ({
      userId: m.userId,
      username: userMap.get(m.userId)?.username ?? '未知用户',
      phone: userMap.get(m.userId)?.phone,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
      invitedBy: m.invitedBy,
    }))

    ctx.body = { success: true, data: members }
  }

  /**
   * POST /api/tenants/:tenantId/invite
   * Body: { userId, role? }
   * 邀请用户加入租户（需要 admin 或 owner 角色）
   */
  async inviteMember(ctx: Context): Promise<void> {
    const { userId: inviterId } = ctx.state.user!
    const { tenantId } = ctx.params
    const { userId: targetUserId, role } = ctx.request.body as { userId?: string; role?: string }

    const inviterMembership = await Membership.findOne({
      userId: inviterId,
      tenantId,
      status: 'active',
    }).lean()
    if (!inviterMembership || (inviterMembership.role !== 'owner' && inviterMembership.role !== 'admin')) {
      ctx.status = 403
      ctx.body = { success: false, message: '无权邀请成员' }
      return
    }

    if (!targetUserId) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少被邀请用户的 userId' }
      return
    }

    // 检查用户是否存在
    const targetUser = await User.findOne({ userId: targetUserId })
    if (!targetUser) {
      ctx.status = 404
      ctx.body = { success: false, message: '用户不存在' }
      return
    }

    // 检查是否已是成员
    const existing = await Membership.findOne({ userId: targetUserId, tenantId }).lean()
    if (existing) {
      ctx.status = 409
      ctx.body = { success: false, message: `该用户已是租户成员（状态: ${existing.status}）` }
      return
    }

    const membershipId = generateId('ms')
    const effectiveRole = getEnumValue(role ?? 'member', ['admin', 'member'] as const, 'member')

    await Membership.create({
      membershipId,
      userId: targetUserId,
      tenantId,
      role: effectiveRole,
      status: 'invited',
      joinedAt: new Date(),
      invitedBy: inviterId,
    })

    ctx.status = 201
    ctx.body = {
      success: true,
      data: { membershipId, userId: targetUserId, role: effectiveRole, status: 'invited' },
    }
  }

  /**
   * POST /api/tenants/:tenantId/accept-invite
   * 接受租户邀请（仅限受邀用户本人操作）
   */
  async acceptInvite(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { tenantId } = ctx.params

    const membership = await Membership.findOne({ userId, tenantId, status: 'invited' }).lean()
    if (!membership) {
      ctx.status = 404
      ctx.body = { success: false, message: '没有找到待接受的邀请' }
      return
    }

    await Membership.updateOne(
      { userId, tenantId },
      { $set: { status: 'active', joinedAt: new Date() } },
    )

    ctx.body = { success: true, message: '已接受邀请' }
  }

  /**
   * PUT /api/tenants/:tenantId/members/:targetUserId
   * Body: { role }
   * 修改成员角色（需要 owner 角色）
   */
  async updateMemberRole(ctx: Context): Promise<void> {
    const { userId: operatorId } = ctx.state.user!
    const { tenantId, targetUserId } = ctx.params
    const { role } = ctx.request.body as { role?: string }

    const operatorMembership = await Membership.findOne({
      userId: operatorId,
      tenantId,
      status: 'active',
    }).lean()
    if (!operatorMembership || operatorMembership.role !== 'owner') {
      ctx.status = 403
      ctx.body = { success: false, message: '只有 owner 才能修改成员角色' }
      return
    }

    if (!role) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 role' }
      return
    }

    const effectiveRole = getEnumValue(role, ['owner', 'admin', 'member'] as const, 'member')
    await Membership.updateOne(
      { userId: targetUserId, tenantId },
      { $set: { role: effectiveRole } },
    )

    ctx.body = { success: true, data: { userId: targetUserId, role: effectiveRole } }
  }

  /**
   * DELETE /api/tenants/:tenantId/members/:targetUserId
   * 移除成员（需要 owner 或 admin 角色，且不能移除 owner）
   */
  async removeMember(ctx: Context): Promise<void> {
    const { userId: operatorId } = ctx.state.user!
    const { tenantId, targetUserId } = ctx.params

    const operatorMembership = await Membership.findOne({
      userId: operatorId,
      tenantId,
      status: 'active',
    }).lean()
    if (!operatorMembership || (operatorMembership.role !== 'owner' && operatorMembership.role !== 'admin')) {
      ctx.status = 403
      ctx.body = { success: false, message: '无权移除成员' }
      return
    }

    const targetMembership = await Membership.findOne({ userId: targetUserId, tenantId }).lean()
    if (!targetMembership) {
      ctx.status = 404
      ctx.body = { success: false, message: '成员不存在' }
      return
    }

    if (targetMembership.role === 'owner') {
      ctx.status = 403
      ctx.body = { success: false, message: '不能移除 owner' }
      return
    }

    await Membership.deleteOne({ userId: targetUserId, tenantId })
    ctx.body = { success: true, message: '成员已移除' }
  }
}

export default new TenantController()
