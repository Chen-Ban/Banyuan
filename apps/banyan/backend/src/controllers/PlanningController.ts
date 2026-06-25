/**
 * Planning Controller
 *
 * 处理 Agent Prompt 配置 CRUD。
 *
 * 路由：
 *   GET  /api/applications/:appId/prompts                       — 获取应用全部角色配置
 *   GET  /api/applications/:appId/prompts/:agent                — 获取某角色配置
 *   PUT  /api/applications/:appId/prompts/:agent                — 更新某角色配置
 *   PUT  /api/applications/:appId/prompts                       — 批量更新角色配置
 *   DELETE /api/applications/:appId/prompts/:agent              — 重置某角色配置
 */

import type { Context } from 'koa'
import agentPromptService from '../services/AgentPromptService.js'
import type { FullAgentRole } from '../models/types/index.js'

const VALID_ROLES: FullAgentRole[] = ['master', 'pm', 'arch', 'visual', 'task']

class PlanningController {
  // ─── Agent Prompt 配置 ───────────────────────────────────────────────────────

  /**
   * GET /api/applications/:appId/prompts
   * 获取应用全部角色的 prompt 配置
   */
  async listPrompts(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }

    const prompts = await agentPromptService.listByApp(appId)
    ctx.body = { success: true, data: prompts }
  }

  /**
   * GET /api/applications/:appId/prompts/:agent
   * 获取某角色的 prompt 配置
   */
  async getPrompt(ctx: Context): Promise<void> {
    const { appId, agent } = ctx.params as { appId: string; agent: string }

    if (!VALID_ROLES.includes(agent as FullAgentRole)) {
      ctx.status = 400
      ctx.body = {
        success: false,
        message: `无效的 agent 参数，可选值：${VALID_ROLES.join(', ')}`,
      }
      return
    }

    const prompt = await agentPromptService.getByRole(appId, agent as FullAgentRole)
    ctx.body = { success: true, data: prompt ?? null }
  }

  /**
   * PUT /api/applications/:appId/prompts/:agent
   * 更新某角色的 prompt 配置
   */
  async upsertPrompt(ctx: Context): Promise<void> {
    const { appId, agent } = ctx.params as { appId: string; agent: string }
    const body = ctx.request.body as { promptText?: string }

    if (!VALID_ROLES.includes(agent as FullAgentRole)) {
      ctx.status = 400
      ctx.body = {
        success: false,
        message: `无效的 agent 参数，可选值：${VALID_ROLES.join(', ')}`,
      }
      return
    }

    if (typeof body?.promptText !== 'string') {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 promptText 参数' }
      return
    }

    const result = await agentPromptService.upsert(appId, agent as FullAgentRole, body.promptText)
    ctx.body = { success: true, data: result }
  }

  /**
   * PUT /api/applications/:appId/prompts
   * 批量更新角色配置
   */
  async batchUpsertPrompts(ctx: Context): Promise<void> {
    const { appId } = ctx.params as { appId: string }
    const body = ctx.request.body as {
      prompts?: Array<{ agent: string; promptText: string }>
    }

    if (!Array.isArray(body?.prompts) || body.prompts.length === 0) {
      ctx.status = 400
      ctx.body = { success: false, message: '缺少 prompts 数组参数' }
      return
    }

    // 验证每个条目
    for (const item of body.prompts) {
      if (!VALID_ROLES.includes(item.agent as FullAgentRole)) {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: `无效的 agent "${item.agent}"，可选值：${VALID_ROLES.join(', ')}`,
        }
        return
      }
      if (typeof item.promptText !== 'string') {
        ctx.status = 400
        ctx.body = {
          success: false,
          message: `角色 "${item.agent}" 缺少 promptText`,
        }
        return
      }
    }

    const results = await agentPromptService.batchUpsert(
      appId,
      body.prompts as Array<{ agent: FullAgentRole; promptText: string }>,
    )
    ctx.body = { success: true, data: results }
  }

  /**
   * DELETE /api/applications/:appId/prompts/:agent
   * 重置某角色配置为系统默认（删除自定义配置）
   */
  async resetPrompt(ctx: Context): Promise<void> {
    const { appId, agent } = ctx.params as { appId: string; agent: string }

    if (!VALID_ROLES.includes(agent as FullAgentRole)) {
      ctx.status = 400
      ctx.body = {
        success: false,
        message: `无效的 agent 参数，可选值：${VALID_ROLES.join(', ')}`,
      }
      return
    }

    await agentPromptService.resetToDefault(appId, agent as FullAgentRole)
    ctx.body = { success: true, message: '已重置为系统默认' }
  }
}

export default new PlanningController()
