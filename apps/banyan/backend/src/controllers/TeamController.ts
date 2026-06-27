import { Context } from 'koa'
import crypto from 'crypto'
import { Team } from '../models/auth/Team.js'
import { Membership } from '../models/auth/Membership.js'
import { User } from '../models/auth/User.js'

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function getEnumValue<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

/**
 * 团队 & 成员关系管理控制器
 */
export class TeamController {
  /**
   * POST /api/teams
   * Body: { name, plan? }
   * 创建团队 + 创建 owner membership。创建者自动成为 owner。
   */
  async create(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { name, plan } = ctx.request.body as { name?: string; plan?: string }

    if (!name || !name.trim()) {
      ctx.status = 400
      ctx.body = { success: false, message: '请输入团队名称' }
      return
    }

    const teamId = generateId('team')
    const effectivePlan = getEnumValue(plan ?? 'free', ['free', 'pro'] as const, 'free')
    const membershipId = generateId('ms')

    await Team.create({
      teamId,
      name: name.trim(),
      plan: effectivePlan,
    })

    await Membership.create({
      membershipId,
      userId,
      teamId,
      role: 'owner',
      status: 'active',
      joinedAt: new Date(),
    })

    ctx.status = 201
    ctx.body = {
      success: true,
      data: {
        teamId,
        name: name.trim(),
        plan: effectivePlan,
        role: 'owner',
      },
    }
  }

  /**
   * GET /api/teams/:teamId
   * 获取团队详情（需要是该团队的成员）
   */
  async getById(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { teamId } = ctx.params

    const membership = await Membership.findOne({ userId, teamId, status: 'active' }).lean()
    if (!membership) {
      ctx.status = 403
      ctx.body = { success: false, message: '你不是该团队的成员' }
      return
    }

    const team = await Team.findOne({ teamId }).lean()
    if (!team) {
      ctx.status = 404
      ctx.body = { success: false, message: '团队不存在' }
      return
    }

    ctx.body = {
      success: true,
      data: { ...team, role: membership.role },
    }
  }

  /**
   * PUT /api/teams/:teamId
   * Body: { name?, plan? }
   * 更新团队信息（需要 owner 或 admin 角色）
   */
  async update(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { teamId } = ctx.params

    const membership = await Membership.findOne({ userId, teamId, status: 'active' }).lean()
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      ctx.status = 403
      ctx.body = { success: false, message: '无权修改团队信息' }
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

    await Team.updateOne({ teamId }, { $set: updates })
    const team = await Team.findOne({ teamId }).lean()

    ctx.body = { success: true, data: team }
  }

  /**
   * DELETE /api/teams/:teamId
   * 删除团队（需要 owner 角色）
   */
  async remove(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { teamId } = ctx.params

    const membership = await Membership.findOne({ userId, teamId, status: 'active' }).lean()
    if (!membership || membership.role !== 'owner') {
      ctx.status = 403
      ctx.body = { success: false, message: '只有 owner 才能删除团队' }
      return
    }

    // 级联删除团队 + 所有成员关系
    await Team.deleteOne({ teamId })
    await Membership.deleteMany({ teamId })

    ctx.body = { success: true, message: '团队已删除' }
  }

  // ─── 成员管理 ─────────────────────────────────────────────────────────────

  /**
   * GET /api/teams/:teamId/members
   * 获取团队成员列表
   */
  async listMembers(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { teamId } = ctx.params

    const myMembership = await Membership.findOne({ userId, teamId, status: 'active' }).lean()
    if (!myMembership) {
      ctx.status = 403
      ctx.body = { success: false, message: '你不是该团队的成员' }
      return
    }

    const memberships = await Membership.find({ teamId }).sort({ joinedAt: 1 }).lean()
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
   * POST /api/teams/:teamId/invite
   * Body: { userId, role? }
   * 邀请用户加入团队（需要 admin 或 owner 角色）
   */
  async inviteMember(ctx: Context): Promise<void> {
    const { userId: inviterId } = ctx.state.user!
    const { teamId } = ctx.params
    const { userId: targetUserId, role } = ctx.request.body as { userId?: string; role?: string }

    const inviterMembership = await Membership.findOne({
      userId: inviterId,
      teamId,
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
    const existing = await Membership.findOne({ userId: targetUserId, teamId }).lean()
    if (existing) {
      ctx.status = 409
      ctx.body = { success: false, message: `该用户已是团队成员（状态: ${existing.status}）` }
      return
    }

    const membershipId = generateId('ms')
    const effectiveRole = getEnumValue(role ?? 'member', ['admin', 'member'] as const, 'member')

    await Membership.create({
      membershipId,
      userId: targetUserId,
      teamId,
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
   * POST /api/teams/:teamId/accept-invite
   * 接受团队邀请（仅限受邀用户本人操作）
   */
  async acceptInvite(ctx: Context): Promise<void> {
    const { userId } = ctx.state.user!
    const { teamId } = ctx.params

    const membership = await Membership.findOne({ userId, teamId, status: 'invited' }).lean()
    if (!membership) {
      ctx.status = 404
      ctx.body = { success: false, message: '没有找到待接受的邀请' }
      return
    }

    await Membership.updateOne(
      { userId, teamId },
      { $set: { status: 'active', joinedAt: new Date() } },
    )

    ctx.body = { success: true, message: '已接受邀请' }
  }

  /**
   * PUT /api/teams/:teamId/members/:targetUserId
   * Body: { role }
   * 修改成员角色（需要 owner 角色）
   */
  async updateMemberRole(ctx: Context): Promise<void> {
    const { userId: operatorId } = ctx.state.user!
    const { teamId, targetUserId } = ctx.params
    const { role } = ctx.request.body as { role?: string }

    const operatorMembership = await Membership.findOne({
      userId: operatorId,
      teamId,
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
      { userId: targetUserId, teamId },
      { $set: { role: effectiveRole } },
    )

    ctx.body = { success: true, data: { userId: targetUserId, role: effectiveRole } }
  }

  /**
   * DELETE /api/teams/:teamId/members/:targetUserId
   * 移除成员（需要 owner 或 admin 角色，且不能移除 owner）
   */
  async removeMember(ctx: Context): Promise<void> {
    const { userId: operatorId } = ctx.state.user!
    const { teamId, targetUserId } = ctx.params

    const operatorMembership = await Membership.findOne({
      userId: operatorId,
      teamId,
      status: 'active',
    }).lean()
    if (!operatorMembership || (operatorMembership.role !== 'owner' && operatorMembership.role !== 'admin')) {
      ctx.status = 403
      ctx.body = { success: false, message: '无权移除成员' }
      return
    }

    const targetMembership = await Membership.findOne({ userId: targetUserId, teamId }).lean()
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

    await Membership.deleteOne({ userId: targetUserId, teamId })
    ctx.body = { success: true, message: '成员已移除' }
  }
}

export default new TeamController()
