/**
 * 相地 · LLM 客户端模块
 *
 * 提供开箱即用的 LLM 客户端实现 + 智能路由层。
 *
 * 架构：
 *   AgentLoop ──→ LLMRouter（代理层）──→ DeepSeekClient（实际调用）
 *                      │
 *                      ├── 异常检测（限额/超时/错误）
 *                      ├── 健康状态追踪
 *                      ├── 信号发射（通知外部）
 *                      └── [未来] 自动切换 fallback provider
 */

// ─── LLM 客户端 ──────────────────────────────────────────────────────────────
export { DeepSeekClient, loadApiKeyFromFile } from "./DeepSeekClient.js";
export type { DeepSeekConfig } from "./DeepSeekClient.js";

// ─── LLM 路由层 ─────────────────────────────────────────────────────────────
export { LLMRouter } from "./LLMRouter.js";
export type {
  LLMRouterConfig,
  LLMProvider,
  ProviderHealth,
  RoutingSignal,
  RoutingSignalType,
  SuggestedAction,
  SignalListener,
} from "./LLMRouter.js";
