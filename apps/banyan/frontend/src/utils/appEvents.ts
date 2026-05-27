/**
 * appEvents — 应用级事件总线
 *
 * 轻量级发布/订阅，用于跨层级通信，避免 prop drilling 和 Context 过度耦合。
 *
 * 当前事件：
 *   saveApp  — 触发应用保存。
 *              发布方：ApplicationLayout 保存按钮、AiBar onBeforeSend。
 *              订阅方：UIPage（序列化画布 pages 后调用 API 保存）。
 *              返回值：Promise<void>，发布方 await 所有订阅者完成后继续。
 */

type SaveAppHandler = () => Promise<void>

const saveAppHandlers = new Set<SaveAppHandler>()

export const appEvents = {
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
}
