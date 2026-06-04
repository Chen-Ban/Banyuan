/**
 * 相地 · Intent 节点（Phase 2: ADR-039 统一 Graph）
 *
 * 管线入口节点，负责将用户输入分类为：
 * - respond: 纯对话/信息查询 → 路由到 respond 节点
 * - task: 画布操作/数据修改 → 路由到 plan 节点
 *
 * 分类策略：
 * 1. 零 token 规则优先（关键词/模式匹配），命中即返回，不消耗 LLM token
 * 2. 规则未命中时，LLM fallback 分类（轻量模型，短 prompt）
 *
 * 设计原则：
 * - 极低延迟：规则匹配 < 1ms，LLM fallback < 500ms
 * - 高准确率：规则覆盖 ~70% 场景，LLM 处理模糊意图
 * - 容错：LLM 失败时默认 task（保守策略）
 */
import type { BaseMessage } from "@langchain/core/messages";
import type { LLMClient } from "../../core/llmTypes.js";
import type { StreamCallback } from "../../core/types.js";
import type { IntentResult, IntentType } from "../state.js";

// ─── Config ──────────────────────────────────────────────────────────────────

export interface IntentNodeConfig {
  llmClient: LLMClient;
  streamCallback?: StreamCallback;
  /** LLM 分类使用的模型（默认 deepseek-v4-pro） */
  intentModel?: string;
}

// ─── 零 Token 规则引擎 ──────────────────────────────────────────────────────

/**
 * Task 强信号关键词（命中即为 task）。
 * 这些词明确表达了画布操作/数据修改/页面创建等动作意图。
 */
const TASK_STRONG_SIGNALS: RegExp[] = [
  // 创建/生成类
  /创建|新建|生成|添加|加[一个]|加个|插入|建一个/,
  /create|generate|add|insert|make\s+(a|an|the)/i,
  // 修改/调整类
  /修改|改[一下成为]|调整|调[一下]|变[成为大小]|换[成个]|替换|更新|设置|设为|改为/,
  /modify|change|update|set|adjust|replace|resize|move/i,
  // 删除类
  /删除|删掉|移除|去掉|干掉/,
  /delete|remove|drop/i,
  // 样式类
  /颜色|背景|字体|字号|间距|圆角|边框|阴影|透明/,
  /改[一下]*样式|设置样式|修改样式/,
  // 布局类
  /布局|排列|对齐|居中|左对齐|右对齐|上对齐|下对齐/,
  /水平|垂直|横向|纵向|栅格|网格/,
  // 页面操作
  /[新建创建].*页面|页面.*[新建创建]/,
  /新增.*页面|加.*页面/,
  // 数据操作
  /绑定数据|数据绑定|创建集合|添加字段|数据模型/,
  /云函数|设置事件|绑定事件|点击事件/,
  // 流程/事件
  /流程|事件绑定|导航到|跳转到|页面跳转/,
];

/**
 * Respond 强信号关键词（命中即为 respond）。
 * 纯对话/信息查询/闲聊/方案讨论。
 */
const RESPOND_STRONG_SIGNALS: RegExp[] = [
  // 问答/查询类
  /^(什么是|是什么|怎么理解|如何理解|解释一下|介绍一下)/,
  /^(为什么|为啥|why|what\s+is|how\s+does)/i,
  // 确认/反馈类
  /^(好的?|可以|行|没问题|OK|ok|明白|了解|知道了)/,
  /^(谢谢|感谢|thanks|thank\s+you)/i,
  // 闲聊类
  /^(你好|嗨|hello|hi|hey)\s*[!！。.]?$/i,
  /^(再见|拜拜|bye)/i,
  // 讨论类
  /你觉得|你认为|你建议|有什么建议|什么方案比较好/,
  /对比一下|区别是什么|优缺点/,
  // 帮助类
  /^(帮助|help|怎么用|如何使用)/i,
  // 方案确认/选择
  /^(第[一二三四五六七八九十\d]+[个种]|选[第]?[一二三四五六七八九十\d])/,
];

/**
 * 零 token 规则分类：通过关键词/模式匹配判断意图。
 * 返回 IntentResult 或 null（未命中规则时返回 null，需要 LLM fallback）
 */
function classifyByRules(userText: string): IntentResult | null {
  const text = userText.trim();

  // 空消息默认为 respond
  if (!text) {
    return { type: "respond", source: "rule", confidence: 1.0, reason: "empty_input" };
  }

  // 极短消息（≤ 5 字符）且不包含动作词 → respond
  if (text.length <= 5 && !TASK_STRONG_SIGNALS.some((r) => r.test(text))) {
    return { type: "respond", source: "rule", confidence: 0.9, reason: "very_short_respond" };
  }

  // Respond 强信号匹配
  for (const pattern of RESPOND_STRONG_SIGNALS) {
    if (pattern.test(text)) {
      return { type: "respond", source: "rule", confidence: 1.0, reason: `respond_rule: ${pattern.source}` };
    }
  }

  // Task 强信号匹配
  for (const pattern of TASK_STRONG_SIGNALS) {
    if (pattern.test(text)) {
      return { type: "task", source: "rule", confidence: 1.0, reason: `task_rule: ${pattern.source}` };
    }
  }

  // 未命中任何规则
  return null;
}

// ─── LLM Fallback 分类 ────────────────────────────────────────────────────

const INTENT_CLASSIFICATION_PROMPT = `你是一个意图分类器。判断用户消息属于哪种类型：

- respond: 纯对话、信息查询、闲聊、方案讨论、确认/反馈、提问
- task: 需要操作画布（创建/修改/删除页面、视图、组件、样式、布局、数据绑定、事件绑定等）

只返回 JSON，不要其他文字：
{"type": "respond" 或 "task", "confidence": 0.0-1.0, "reason": "简短原因"}`;

/**
 * LLM Fallback：当规则未命中时，调用轻量 LLM 分类。
 */
async function classifyByLLM(
  llmClient: LLMClient,
  userText: string,
  model: string
): Promise<IntentResult> {
  try {
    const response = await llmClient.createMessage({
      model,
      max_tokens: 128,
      system: INTENT_CLASSIFICATION_PROMPT,
      messages: [{ role: "user", content: userText.slice(0, 500) }],
      temperature: 0.0,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (textBlock && textBlock.type === "text") {
      const cleaned = textBlock.text
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      const parsed = JSON.parse(cleaned) as { type?: string; confidence?: number; reason?: string };
      const intentType: IntentType = parsed.type === "respond" ? "respond" : "task";
      return {
        type: intentType,
        source: "llm",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
        reason: parsed.reason,
      };
    }
  } catch {
    // LLM 失败时保守策略：默认 task
  }

  return { type: "task", source: "llm", confidence: 0.5, reason: "llm_fallback_default" };
}

// ─── Intent Node Factory ──────────────────────────────────────────────────────

/**
 * 提取用户最后一条消息的文本内容
 */
function extractLastUserText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg._getType() === "human") {
      if (typeof msg.content === "string") return msg.content;
      if (Array.isArray(msg.content)) {
        return msg.content
          .map((c) => (typeof c === "string" ? c : "text" in c ? (c as { text: string }).text : ""))
          .filter(Boolean)
          .join(" ");
      }
    }
  }
  return "";
}

/**
 * 创建 Intent 节点函数。
 *
 * 行为：
 * 1. 提取最后一条用户消息
 * 2. 零 token 规则匹配
 * 3. 未命中 → LLM fallback 分类
 * 4. 输出 intentResult 到 state，由路由函数决定下一跳
 */
export function createIntentNode(config: IntentNodeConfig) {
  const {
    llmClient,
    streamCallback: _streamCallback,
    intentModel = "deepseek-v4-pro",
  } = config;

  return async function intentNode(state: { messages: BaseMessage[] }): Promise<{ intentResult: IntentResult }> {
    const userText = extractLastUserText(state.messages);

    // Phase 1: 零 token 规则分类
    const ruleResult = classifyByRules(userText);
    if (ruleResult) {
      return { intentResult: ruleResult };
    }

    // Phase 2: LLM fallback 分类
    const llmResult = await classifyByLLM(llmClient, userText, intentModel);
    return { intentResult: llmResult };
  };
}
