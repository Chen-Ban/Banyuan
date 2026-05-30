/**
 * 相地 · SubAgent 上下文构建器
 *
 * 为每个 SubAgent 组装多层上下文（L1 系统知识 → L5 当前输入）。
 * 含 Token 预算裁剪逻辑。
 */

import type { AgentRole, FeatureList, TechPlan, VisualSpec } from '../../spec/planningTypes.js';
import type { CompletedArtifacts } from '../resume/types.js';

/** Token 预算配置 */
export interface TokenBudget {
  /** 记忆最大 token（默认 1024） */
  memoryMaxTokens: number;
  /** 对话历史最大 token（默认 2048） */
  conversationMaxTokens: number;
}

const DEFAULT_TOKEN_BUDGET: TokenBudget = {
  memoryMaxTokens: 1024,
  conversationMaxTokens: 2048,
};

/**
 * 粗略 token 估算（中文 ~1.5 字/token，英文 ~4 字符/token）
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * 按 token 预算裁剪文本（保留前段）
 */
function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (!text) return '';
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;

  // 按比例裁剪
  const ratio = maxTokens / estimated;
  const cutLength = Math.floor(text.length * ratio * 0.95);
  return text.slice(0, cutLength) + '\n\n...(内容因 token 预算截断)';
}

// ─── PM Context ──────────────────────────────────────────────────────────────

export function buildPMContext(
  userMessage: string,
  memory: string | null,
  conversationContext: string,
  budget: TokenBudget = DEFAULT_TOKEN_BUDGET,
): { agentMemory: string; conversationContext: string } {
  return {
    agentMemory: memory ? truncateToTokenBudget(memory, budget.memoryMaxTokens) : '',
    conversationContext: truncateToTokenBudget(conversationContext, budget.conversationMaxTokens),
  };
}

// ─── Arch Context ────────────────────────────────────────────────────────────

export function buildArchContext(
  featureList: FeatureList,
  memory: string | null,
  previousTechPlan?: TechPlan,
): { agentMemory: string; previousContext: string } {
  let previousContext = '';
  if (previousTechPlan) {
    previousContext = `## 上一版技术方案（供参考优化）\n\n\`\`\`json\n${JSON.stringify(previousTechPlan, null, 2)}\n\`\`\``;
  }
  return {
    agentMemory: memory ?? '',
    previousContext,
  };
}

// ─── Visual Context ──────────────────────────────────────────────────────────

export function buildVisualContext(
  featureList: FeatureList,
  techPlan: TechPlan,
  memory: string | null,
  previousVisualSpec?: VisualSpec,
): { agentMemory: string; previousContext: string } {
  let previousContext = '';
  if (previousVisualSpec) {
    previousContext = `## 上一版视觉规格（供参考优化）\n\n\`\`\`json\n${JSON.stringify(previousVisualSpec, null, 2)}\n\`\`\``;
  }
  return {
    agentMemory: memory ?? '',
    previousContext,
  };
}

// ─── Task Context ────────────────────────────────────────────────────────────

export function buildTaskContext(
  featureList: FeatureList,
  techPlan: TechPlan,
  visualSpec: VisualSpec,
  memory: string | null,
): { agentMemory: string } {
  return {
    agentMemory: memory ?? '',
  };
}

// ─── Context Summary（L3 上一轮 Artifact 注入）────────────────────────────────

/** 各 Agent 对 previousArtifact 的 token 预算 */
const ARTIFACT_TOKEN_BUDGETS: Record<AgentRole, number> = {
  pm: 800,
  arch: 1200,
  visual: 1000,
  task: 0, // TaskPlanner 不注入 previousArtifact
};

/**
 * 按 namespace（Agent 角色）裁剪注入上一轮 PlanningArtifact 的摘要。
 *
 * 裁剪策略是确定性的（字段选择 + token 截断），不依赖 LLM 压缩。
 * - PM: featureList 的 features title + priority
 * - Arch: techPlan 的 viewChanges + schemaChanges 摘要
 * - Visual: visualSpec 的 designTokens + 页面布局骨架
 * - Task: 不注入
 */
export function buildContextSummary(
  namespace: AgentRole,
  previousArtifact: CompletedArtifacts | null | undefined,
): string {
  if (!previousArtifact) return '';

  const budget = ARTIFACT_TOKEN_BUDGETS[namespace];
  if (budget === 0) return '';

  let summary = '';

  switch (namespace) {
    case 'pm': {
      const featureList = previousArtifact.pm?.output;
      if (!featureList) return '';
      const lines = featureList.features.map(
        (f) => `- [${f.priority}] ${f.title}`,
      );
      summary = `## 上一轮需求摘要\n\n${lines.join('\n')}`;
      break;
    }

    case 'arch': {
      const techPlan = previousArtifact.arch?.output;
      if (!techPlan) return '';
      const viewLines = techPlan.viewChanges.map(
        (v) => `- ${v.action} ${v.viewType}${v.viewId ? ` (${v.viewId})` : ''}: ${v.description}`,
      );
      const schemaLines = techPlan.schemaChanges.map(
        (s) => `- ${s.action} ${s.collectionName}${s.fieldName ? `.${s.fieldName}` : ''}: ${s.description}`,
      );
      summary = `## 上一轮技术方案摘要\n\n### 视图变更\n${viewLines.join('\n')}\n\n### Schema 变更\n${schemaLines.join('\n')}`;
      break;
    }

    case 'visual': {
      const visualSpec = previousArtifact.visual?.output;
      if (!visualSpec) return '';
      const pageLines = visualSpec.pages.map(
        (p) => `- ${p.name}: ${p.layoutDescription} (密度: ${p.informationDensity})`,
      );
      const tokenKeys = Object.keys(visualSpec.designTokens.colors).slice(0, 5);
      const colorPreview = tokenKeys.map(
        (k) => `${k}: ${visualSpec.designTokens.colors[k]}`,
      ).join(', ');
      summary = `## 上一轮视觉规格摘要\n\n### 页面布局\n${pageLines.join('\n')}\n\n### Design Tokens（颜色预览）\n${colorPreview}`;
      break;
    }

    case 'task':
      return '';
  }

  return truncateToTokenBudget(summary, budget);
}
