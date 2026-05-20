import { Context } from 'koa'
import applicationService from '../services/ApplicationService'

interface CreateApplicationRequest {
  application_id: string
  name: string
  description?: string
  pages: string[]
  thumbnail?: string
  tags?: string[]
  createdBy?: string
}

interface UpdateApplicationRequest {
  name?: string
  description?: string
  pages?: string[]
  thumbnail?: string
  tags?: string[]
  updatedBy?: string
}

class ApplicationController {
  async getApplicationList(ctx: Context) {
    try {
      const { name, application_id, tags, createdBy, page = '1', pageSize = '12' } = ctx.query

      const query = {
        name: name as string | undefined,
        application_id: application_id as string | undefined,
        tags: tags as string | undefined,
        createdBy: createdBy as string | undefined,
      }

      Object.keys(query).forEach(
        (key) => query[key as keyof typeof query] === undefined && delete query[key as keyof typeof query]
      )

      const result = await applicationService.getApplicationList(
        query,
        parseInt(page as string, 10),
        parseInt(pageSize as string, 10)
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
      const application = await applicationService.getApplicationById(id)

      if (!application) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Application not found' }
        return
      }

      ctx.status = 200
      ctx.body = { success: true, data: application }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to get application' }
    }
  }

  async createApplication(ctx: Context) {
    try {
      const data = ctx.request.body as CreateApplicationRequest

      if (!data.application_id || !data.name || !data.pages) {
        ctx.status = 400
        ctx.body = { success: false, message: 'application_id, name and pages are required' }
        return
      }

      if (!Array.isArray(data.pages)) {
        ctx.status = 400
        ctx.body = { success: false, message: 'pages must be an array of strings' }
        return
      }

      const application = await applicationService.createApplication(data)

      ctx.status = 201
      ctx.body = { success: true, data: application, message: 'Application created successfully' }
    } catch (error: any) {
      ctx.status = error.message.includes('already exists') ? 409 : 500
      ctx.body = { success: false, message: error.message || 'Failed to create application' }
    }
  }

  async updateApplication(ctx: Context) {
    try {
      const { id } = ctx.params
      const updateData = ctx.request.body as UpdateApplicationRequest

      if ((updateData as any).application_id) {
        ctx.status = 400
        ctx.body = { success: false, message: 'application_id cannot be updated' }
        return
      }

      const application = await applicationService.updateApplication(id, updateData)

      if (!application) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Application not found' }
        return
      }

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
      const deleted = await applicationService.deleteApplication(id)

      if (!deleted) {
        ctx.status = 404
        ctx.body = { success: false, message: 'Application not found' }
        return
      }

      ctx.status = 200
      ctx.body = { success: true, message: 'Application deleted successfully' }
    } catch (error: any) {
      ctx.status = 500
      ctx.body = { success: false, message: error.message || 'Failed to delete application' }
    }
  }
}

export default new ApplicationController()
