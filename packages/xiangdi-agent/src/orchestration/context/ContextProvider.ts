import type { OrchestratorState } from '../orchestratorGraph.js'
import type { ContextDeclaration, ContextPackage, ContextSlice } from './types.js'
import { ContextDimension } from './types.js'

/**
 * ContextProvider —— SubAgent 上下文按需拉取统一入口。
 *
 * SubAgent 声明需要哪些上下文维度，Provider 只组装声明的部分。
 * AppSystemPrompt（全局约束）固定前缀保证 Prompt Cache 命中。
 */
export class ContextProvider {
  /**
   * 根据 SubAgent 的上下文声明，从 OrchestratorState 中按需拉取上下文。
   */
  static resolve(
    declaration: ContextDeclaration,
    state: OrchestratorState,
  ): ContextPackage {
    const slices: ContextSlice[] = []

    for (const dim of declaration.dimensions) {
      const content = ContextProvider._extract(dim, state)
      if (content) {
        slices.push({ dimension: dim, content })
      }
    }

    // 组装系统提示词：AppSystemPrompt + AgentRolePrompt + 上下文切片
    const systemParts: string[] = []
    if (declaration.rolePrompt) {
      systemParts.push(declaration.rolePrompt)
    }
    for (const slice of slices) {
      systemParts.push(`\n---\n${slice.dimension}:\n${slice.content}`)
    }

    return {
      systemPrompt: systemParts.join('\n'),
      userMessage: state.userMessage || '',
      slices,
    }
  }

  /** 从 state 中提取指定维度的原始内容 */
  private static _extract(dim: ContextDimension, state: OrchestratorState): string | undefined {
    switch (dim) {
      case ContextDimension.SYSTEM_PROMPT:
        return state.systemPrompt
      case ContextDimension.AGENT_MEMORY:
        return state.agentMemory
      case ContextDimension.CONTEXT_SUMMARY:
        return state.contextSummary
      case ContextDimension.REQUIREMENTS:
        return state.artifacts?.requirements ? JSON.stringify(state.artifacts.requirements, null, 2) : undefined
      case ContextDimension.UI_DESIGN:
        return state.artifacts?.uiDesign ? JSON.stringify(state.artifacts.uiDesign, null, 2) : undefined
      case ContextDimension.CONTRACT:
        return state.artifacts?.contract ? JSON.stringify(state.artifacts.contract, null, 2) : undefined
      case ContextDimension.USER_MESSAGE:
        return state.userMessage
      default:
        return undefined
    }
  }
}
