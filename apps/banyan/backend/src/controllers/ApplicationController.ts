import { Context } from 'koa'
import applicationService from '../services/ApplicationService'

// ADR-042：本端点只更新应用「元信息」（name/thumbnail/tags）。
// UI 定义 JSON 是版本化内容（UIDefinition 表），不在此更新——
// 它必须走 PUT /api/apps/:appId/app-content（经 runAutoConfirmedEdit 落库为新版本），
// 故这里刻意不再声明 uiJSON 字段，避免前端误以为能通过本接口保存画布。
interface UpdateApplicationRequest {
  name?: string
  thumbnail?: string
  tags?: string[]
  updatedBy?: string
  visibility?: 'private' | 'team'
}

class ApplicationController {
  async getApplicationList(ctx: Context) {
    try {
      const { name, application_id, tags, page = '1', pageSize = '12' } = ctx.query
      const user = ctx.state.user!

      if (!user.teamId) {
        ctx.status = 200
        ctx.body = { success: true, data: { applications: [], total: 0, page: 1, pageSize: 12 } }
        return
      }

      const baseQuery = {
        name: name as string | undefined,
        application_id: application_id as string | undefined,
        tags: tags as string | undefined,
      }

      let query: import('../services/ApplicationService').IApplicationQuery

      if (user.membershipRole === 'member') {
        // 成员：看同团队下自己的应用 + team 可见的应用
        query = { ...baseQuery, createdOrVisibleToTeam: { teamId: user.teamId, userId: user.userId } }
      } else {
        // admin / owner：看团队内所有应用
        query = { ...baseQuery, teamId: user.teamId }
      }

      // 去除 undefined 键
      Object.keys(query).forEach(
        (key) => query[key as keyof typeof query] === undefined && delete query[key as keyof typeof query],
      )

      const result = await applicationService.getApplicationList(
        query,
        parseInt(page as string, 10),
        parseInt(pageSize as string, 10),
      )

      ctx.status = 200
      ctx.body = { success: true, data: result }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to get application list' }
    }
  }

  async getApplicationById(ctx: Context) {
    try {
      const { id } = ctx.params
      const user = ctx.state.user!

      // ADR-042：聚合返回 application + uiJSON + collections + cloudFunctions
      const result = await applicationService.getFullApplicationById(id)

      if (!result) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Application not found' }
        return
      }

      // 团队归属校验
      if (result.application.teamId !== user.teamId) {
        ctx.status = 403
        ctx.body = { success: false, message: '无权访问该应用' }
        return
      }

      ctx.status = 200
      ctx.body = {
        success: true,
        data: {
          ...result.application,
          uiJSON: result.uiJSON,
          collections: result.collections,
          cloudFunctions: result.cloudFunctions,
        },
      }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to get application' }
    }
  }

  async createApplication(ctx: Context) {
    try {
      const user = ctx.state.user!
      if (!user.teamId) {
        ctx.status = 403
        ctx.body = { success: false, message: '请先创建或加入一个团队' }
        return
      }
      const application = await applicationService.createApplication(user.userId, user.teamId)

      ctx.status = 201
      ctx.body = { success: true, data: application, message: 'Application created successfully' }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to create application' }
    }
  }

  async updateApplication(ctx: Context) {
    try {
      const { id } = ctx.params
      const user = ctx.state.user!
      const updateData = ctx.request.body as UpdateApplicationRequest

      if ((updateData as any).application_id) {
        ctx.status = 400
        ctx.body = { success: false, message: 'application_id cannot be updated' }
        return
      }

      // 团队归属校验
      const existing = await applicationService.getApplicationById(id)
      if (!existing) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Application not found' }
        return
      }
      if (existing.teamId !== user.teamId) {
        ctx.status = 403
        ctx.body = { success: false, message: '无权修改该应用' }
        return
      }

      const application = await applicationService.updateApplication(id, updateData)

      ctx.status = 200
      ctx.body = { success: true, data: application, message: 'Application updated successfully' }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to update application' }
    }
  }

  async deleteApplication(ctx: Context) {
    try {
      const { id } = ctx.params
      const user = ctx.state.user!

      // 团队归属校验
      const existing = await applicationService.getApplicationById(id)
      if (!existing) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Application not found' }
        return
      }
      if (existing.teamId !== user.teamId) {
        ctx.status = 403
        ctx.body = { success: false, message: '无权删除该应用' }
        return
      }

      await applicationService.deleteApplication(id)

      ctx.status = 200
      ctx.body = { success: true, message: 'Application deleted successfully' }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to delete application' }
    }
  }
}

export default new ApplicationController()
