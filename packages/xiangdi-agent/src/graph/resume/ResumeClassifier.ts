/**
 * 相地 · ResumeClassifier
 *
 * 对用户中断后的新消息进行意图分类：
 * - continue: 继续之前中断的规划（无修改）
 * - refine: 对某个 Agent 的产出进行修正
 * - restart: 放弃当前规划，重新开始
 * - clarify: 分类器不确定，需要请求用户确认
 */

import type { LLMClient, LLMResponse } from '../../core/llmTypes.js';
import type { StreamCallback, TypedStreamEvent } from '../../core/types.js';
import type { AgentRole } from '../../spec/planningTypes.js';
import type { PlanningSnapshot, ResumeClassification, ResumeIntent } from './types.js';

// ─── 分类 Prompt ──────────────────────────────────────────────────────────────

const RESUME_CLASSIFIER_PROMPT = `你是一个意图分类器。用户之前的规划流程被中断了，现在用户发送了新消息。

你的任务是判断用户此次消息的意图属于以下四类之一：
1. **continue** — 用户希望继续之前中断的规划，不做修改（如"继续"、"接着来"、"go on"）
2. **refine** — 用户希望修正某个特定环节的产出（如"需求里加一个功能"、"布局改一下"、"技术方案换个方式"）
3. **restart** — 用户希望完全放弃当前规划，重新开始（如"算了重来"、"换个思路从头开始"、"这个方案不行"）
4. **clarify** — 你无法确定用户意图，需要进一步确认

## 输入信息
- 用户新消息
- 中断时的方案概述（如果有）
- 中断位置（哪个 Agent 正在执行）
- 已完成的节点列表

## 判断规则
- 如果用户消息明确表达继续意图 → continue
- 如果用户消息包含对某个阶段（需求/技术/视觉/任务）的具体修改意见 → refine
  - 同时判断受影响的 Agent：功能/需求相关→pm，技术/实现相关→arch，布局/视觉相关→visual，任务/执行相关→task
- 如果用户消息明确表达放弃/重做意图 → restart
- 如果无法确定 → clarify

## 输出格式

严格输出以下 JSON（用 \`\`\`json ... \`\`\` 包裹）：

\`\`\`json
{
  "intent": "continue | refine | restart | clarify",
  "affectedAgent": "pm | arch | visual | task | null",
  "reasoning": "一句话判断依据"
}
\`\`\``;

// ─── 分类器配置 ───────────────────────────────────────────────────────────────

export interface ResumeClassifierConfig {
  llmClient: LLMClient;
  streamCallback?: StreamCallback;
  model?: string;
  /** 置信度阈值，低于此值触发 clarify（0-1，默认 0.7） */
  confidenceThreshold?: number;
}

export interface ResumeClassifierInput {
  userMessage: string;
  snapshot: PlanningSnapshot;
}

// ─── 分类器实现 ───────────────────────────────────────────────────────────────

/**
 * 对用户中断后的新消息进行意图分类
 */
export async function classifyResumeIntent(
  config: ResumeClassifierConfig,
  input: ResumeClassifierInput,
): Promise<ResumeClassification> {
  const { llmClient, streamCallback, model = 'deepseek-chat' } = config;
  const { userMessage, snapshot } = input;

  // 构建上下文
  const completedAgents = Object.keys(snapshot.completedArtifacts) as AgentRole[];
  const contextMessage = [
    `## 用户新消息\n\n${userMessage}`,
    `## 中断信息`,
    `- 中断位置：${snapshot.interruptedAt}`,
    `- 已完成节点：${completedAgents.join('、') || '无'}`,
    snapshot.planDescription ? `- 方案概述：${snapshot.planDescription}` : '',
  ].filter(Boolean).join('\n\n');

  const response: LLMResponse = await llmClient.createMessage({
    model,
    max_tokens: 512,
    temperature: 0.1,
    system: RESUME_CLASSIFIER_PROMPT,
    messages: [{ role: 'user', content: contextMessage }],
  });

  // 解析响应
  const textContent = response.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map(block => block.text)
    .join('');

  const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || textContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { intent: 'clarify', affectedAgent: null, reasoning: '无法解析分类结果' };
  }

  const jsonStr = jsonMatch[1] ?? jsonMatch[0];

  try {
    const parsed = JSON.parse(jsonStr) as { intent: string; affectedAgent: string | null; reasoning: string };

    const intent = validateIntent(parsed.intent);
    const affectedAgent = validateAgent(parsed.affectedAgent);
    const reasoning = parsed.reasoning ?? '';

    const classification: ResumeClassification = {
      intent,
      affectedAgent: intent === 'refine' || intent === 'clarify' ? affectedAgent : null,
      reasoning,
    };

    // 检测不确定信号
    if (hasUncertaintySignals(reasoning) && intent !== 'clarify') {
      // 低置信度，触发 clarify
      if (streamCallback) {
        emitClarificationEvent(streamCallback, classification);
      }
      return { ...classification, intent: 'clarify' };
    }

    return classification;
  } catch {
    return { intent: 'clarify', affectedAgent: null, reasoning: '分类响应解析失败' };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateIntent(raw: string): ResumeIntent {
  const valid: ResumeIntent[] = ['continue', 'refine', 'restart', 'clarify'];
  return valid.includes(raw as ResumeIntent) ? (raw as ResumeIntent) : 'clarify';
}

function validateAgent(raw: string | null | undefined): AgentRole | null {
  if (!raw || raw === 'null') return null;
  const valid: AgentRole[] = ['pm', 'arch', 'visual', 'task'];
  return valid.includes(raw as AgentRole) ? (raw as AgentRole) : null;
}

/**
 * 检测推理中的不确定信号
 */
function hasUncertaintySignals(reasoning: string): boolean {
  const signals = ['不确定', '可能', '也许', '不太清楚', '需要确认', 'uncertain', 'maybe', 'not sure'];
  return signals.some(s => reasoning.includes(s));
}

/**
 * 发送 resume_clarification SSE 事件
 */
function emitClarificationEvent(
  callback: StreamCallback,
  classification: ResumeClassification,
): void {
  const event: TypedStreamEvent = {
    type: 'resume_clarification',
    data: {
      classification,
      options: [
        { intent: 'continue', label: '继续执行', description: '从中断处继续，不做修改' },
        { intent: 'refine', label: '修正方案', description: '对某个环节进行调整' },
        { intent: 'restart', label: '重新开始', description: '放弃当前方案，从头规划' },
      ],
    },
  };
  callback(event);
}
