/**
 * appEvents — 应用级事件总线
 *
 * 轻量级发布/订阅，用于跨层级通信，避免 prop drilling 和 Context 过度耦合。
 *
 * 事件列表：
 *
 *   saveApp  — 触发应用保存。
 *              发布方：ApplicationLayout 保存按钮、AiBar onBeforeSend。
 *              订阅方：UIPage（序列化画布 appJSON 后调用 API 保存）。
 *              返回值：Promise<void>，发布方 await 所有订阅者完成后继续。
 *
 *   initialPrompt — 首页创建应用后传递初始 prompt 到 AiBar。
 *              发布方：HomePage（创建应用后 emit）。
 *              订阅方：UIPage（AiBar 就绪后消费）。
 *              设计：带缓冲（buffered）—— emit 时若无消费者则暂存，
 *              消费者订阅时若有 pending 则立即 flush。解决跨页面跳转时
 *              生产者/消费者 mount 时序不确定的问题。
 */

// ── saveApp ─────────────────────────────────────────────────────────────────

type SaveAppHandler = () => Promise<void>

const saveAppHandlers = new Set<SaveAppHandler>()

// ── initialPrompt（带缓冲的单次事件） ─────────────────────────────────────────

type InitialPromptHandler = (prompt: string) => void

/** pending buffer：最多暂存一条未消费的 prompt（以 appId 为 key 隔离） */
const pendingPrompts = new Map<string, string>()
const promptHandlers = new Map<string, InitialPromptHandler>()

export const appEvents = {
  // ── saveApp ───────────────────────────────────────────────────────────────

  /** 订阅 saveApp 事件，返回取消订阅函数 */
  onSaveApp(handler: SaveAppHandler): () => void {
    saveAppHandlers.add(handler)
    return () => saveAppHandlers.delete(handler)
  },

  /**
   * 发布 saveApp 事件，并发等待所有订阅者完成。
   * 若无订阅者（非画布页），静默 resolve。
   */
  async emitSaveApp(): Promise<void> {
    await Promise.all([...saveAppHandlers].map((h) => h()))
  },

  // ── initialPrompt ─────────────────────────────────────────────────────────

  /**
   * 发布 initialPrompt 事件。
   * 若已有消费者（UIPage 已 mount 且 AiBar 就绪）→ 立即投递。
   * 否则暂存到 pendingPrompts，等消费者订阅时自动 flush。
   */
  emitInitialPrompt(appId: string, prompt: string): void {
    const handler = promptHandlers.get(appId)
    if (handler) {
      handler(prompt)
    } else {
      pendingPrompts.set(appId, prompt)
    }
  },

  /**
   * 订阅 initialPrompt 事件（消费者端调用）。
   * 注册时自动检查 pending buffer 并 flush。
   * 返回取消订阅函数。
   */
  onInitialPrompt(appId: string, handler: InitialPromptHandler): () => void {
    promptHandlers.set(appId, handler)
    // 若有 pending prompt，立即 flush
    const pending = pendingPrompts.get(appId)
    if (pending !== undefined) {
      pendingPrompts.delete(appId)
      handler(pending)
    }
    return () => {
      promptHandlers.delete(appId)
    }
  },

  /** 清除某 appId 的 pending prompt（页面卸载时调用，防止内存泄漏） */
  clearInitialPrompt(appId: string): void {
    pendingPrompts.delete(appId)
    promptHandlers.delete(appId)
  },
}
