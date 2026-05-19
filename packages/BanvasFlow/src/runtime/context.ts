/**
 * FlowContext —— 流程执行的抽象上下文接口
 *
 * 前后端各自提供实现：
 * - 前端 BanvasFlowContext：操作 View.data / Scene.data / navigate / animate
 * - 后端 ServerFlowContext：操作内存变量表 / DB / HTTP
 *
 * FlowRunner 只依赖此接口，不关心具体环境。
 */

export interface FlowContext {
  /**
   * 获取变量值
   * @param scope - 变量作用域（前端: viewId/'self'/'page'，后端: 'local'/'flow'）
   * @param key - 变量名
   */
  getVariable(scope: string, key: string): unknown

  /**
   * 设置变量值
   * @param scope - 变量作用域
   * @param key - 变量名
   * @param value - 新值
   */
  setVariable(scope: string, key: string, value: unknown): void

  /** 触发事件时的原始参数列表 */
  eventArgs: unknown[]

  /**
   * 环境特定能力注入
   *
   * 前端可能注入：{ appId, navigateTo, playAnimation, markDirty }
   * 后端可能注入：{ db, appId, httpClient }
   *
   * 执行器通过 ctx.env.xxx 访问环境能力。
   */
  env: Record<string, unknown>
}
