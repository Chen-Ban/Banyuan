/**
 * Agent Prompt 服务（AgentPromptService）
 *
 * 管理应用级别的 AI Agent 角色提示词 CRUD。
 * 每个应用可以为五个角色（master/pm/arch/visual/task）各自定义 system prompt。
 */

import { AgentPrompt } from '../models/index.js'
import type { IAgentPrompt, FullAgentRole } from '../models/index.js'

class AgentPromptService {
  /**
   * 获取应用的全部角色配置（如果未配置则返回空数组）
   */
  async listByApp(appId: string): Promise<IAgentPrompt[]> {
    return AgentPrompt.find({ appId }).lean() as unknown as IAgentPrompt[]
  }

  /**
   * 获取应用某个角色的 prompt 配置
   */
  async getByRole(appId: string, agent: FullAgentRole): Promise<IAgentPrompt | null> {
    return AgentPrompt.findOne({ appId, agent }).lean() as unknown as IAgentPrompt | null
  }

  /**
   * 创建或更新应用某个角色的 prompt 配置（upsert）
   */
  async upsert(
    appId: string,
    agent: FullAgentRole,
    promptText: string
  ): Promise<IAgentPrompt> {
    const result = await AgentPrompt.findOneAndUpdate(
      { appId, agent },
      {
        $set: {
          promptText,
          isCustomized: true,
        },
        $setOnInsert: {
          appId,
          agent,
          systemVersion: 1,
        },
      },
      { upsert: true, new: true, lean: true }
    )
    return result as unknown as IAgentPrompt
  }

  /**
   * 重置某个角色的配置为系统默认
   */
  async resetToDefault(appId: string, agent: FullAgentRole): Promise<void> {
    await AgentPrompt.findOneAndUpdate(
      { appId, agent },
      {
        $set: {
          promptText: '',
          isCustomized: false,
        },
      }
    )
  }

  /**
   * 批量更新应用的所有角色配置
   */
  async batchUpsert(
    appId: string,
    prompts: Array<{ agent: FullAgentRole; promptText: string }>
  ): Promise<IAgentPrompt[]> {
    const results: IAgentPrompt[] = []
    for (const { agent, promptText } of prompts) {
      const result = await this.upsert(appId, agent, promptText)
      results.push(result)
    }
    return results
  }

  /**
   * 删除应用某个角色的配置
   */
  async deleteByRole(appId: string, agent: FullAgentRole): Promise<void> {
    await AgentPrompt.deleteOne({ appId, agent })
  }

  /**
   * 删除应用的全部角色配置（应用删除时级联清理）
   */
  async deleteByApp(appId: string): Promise<void> {
    await AgentPrompt.deleteMany({ appId })
  }
}

export default new AgentPromptService()
