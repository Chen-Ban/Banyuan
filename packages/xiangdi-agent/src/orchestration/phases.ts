/**
 * Dialogue Phase 状态机
 *
 * ADR-041: 对话阶段驱动 SSE 事件和前端进度展示。
 * 状态机定义了合法转移路径，Orchestrator 在节点切换时推进 phase。
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 枚举
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 对话阶段
 *
 * 线性主路径：start → requirements → ui_design → contract → building → awaiting_confirm → committing → done
 * 回退路径：awaiting_confirm 可回退到任意规划阶段（requirements/ui_design/contract）或 building
 */
export type DialoguePhase =
  | 'start'
  | 'requirements'
  | 'ui_design'
  | 'contract'
  | 'building'
  | 'awaiting_confirm'
  | 'committing'
  | 'done'

/**
 * 全部阶段值（有序数组，按主路径顺序排列）
 */
export const DIALOGUE_PHASES: readonly DialoguePhase[] = [
  'start',
  'requirements',
  'ui_design',
  'contract',
  'building',
  'awaiting_confirm',
  'committing',
  'done',
] as const

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 转移表
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 合法转移表
 *
 * key = 当前 phase，value = 可转移到的 phase 集合。
 * awaiting_confirm 可回退到规划/构建阶段（用户不满意时 rollback）。
 */
export const PHASE_TRANSITIONS: Record<DialoguePhase, readonly DialoguePhase[]> = {
  start: ['requirements'],
  requirements: ['ui_design'],
  ui_design: ['contract'],
  contract: ['building'],
  building: ['awaiting_confirm'],
  awaiting_confirm: ['committing', 'requirements', 'ui_design', 'contract', 'building'],
  committing: ['done'],
  done: [],
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phase 元数据
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PhaseMetadata {
  /** 中文显示名 */
  displayName: string
  /** 阶段描述（供前端 tooltip 使用） */
  description: string
  /** 是否需要用户确认才能推进到下一阶段 */
  requiresConfirmation: boolean
}

export const PHASE_METADATA: Record<DialoguePhase, PhaseMetadata> = {
  start: {
    displayName: '开始',
    description: '解析用户意图，判断入口节点',
    requiresConfirmation: false,
  },
  requirements: {
    displayName: '需求解析',
    description: '解析用户需求为结构化功能列表',
    requiresConfirmation: false,
  },
  ui_design: {
    displayName: 'UI 设计',
    description: '生成页面布局、组件规格和交互描述',
    requiresConfirmation: false,
  },
  contract: {
    displayName: '契约定义',
    description: '定义数据表、云函数签名和前后端绑定',
    requiresConfirmation: false,
  },
  building: {
    displayName: '构建中',
    description: '前端视图构建 + 后端流程生成（并行执行）',
    requiresConfirmation: false,
  },
  awaiting_confirm: {
    displayName: '等待确认',
    description: '构建产出已通过审计，等待用户验收',
    requiresConfirmation: true,
  },
  committing: {
    displayName: '提交中',
    description: '将确认的产出写入应用状态',
    requiresConfirmation: false,
  },
  done: {
    displayName: '完成',
    description: '本轮对话任务完成',
    requiresConfirmation: false,
  },
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 辅助函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 判断 phase 转移是否合法
 */
export function canTransition(from: DialoguePhase, to: DialoguePhase): boolean {
  return PHASE_TRANSITIONS[from].includes(to)
}

/**
 * 获取 phase 在主路径中的索引（0-based）
 *
 * 用于前端进度条百分比计算：progress = index / (total - 1)
 */
export function getPhaseIndex(phase: DialoguePhase): number {
  return DIALOGUE_PHASES.indexOf(phase)
}

/**
 * 判断是否为终态
 */
export function isTerminal(phase: DialoguePhase): boolean {
  return PHASE_TRANSITIONS[phase].length === 0
}

/**
 * 判断是否为回退转移（从 awaiting_confirm 退回到更早阶段）
 */
export function isRollback(from: DialoguePhase, to: DialoguePhase): boolean {
  return from === 'awaiting_confirm' && getPhaseIndex(to) < getPhaseIndex(from)
}
