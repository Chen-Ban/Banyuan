/**
 * 可转移接口 —— 支持 Worker 零拷贝传输
 *
 * 实现此接口的类可以将内部的大型 ArrayBuffer 通过 Transferable 机制
 * 零拷贝传输到 Worker，避免序列化/反序列化开销。
 *
 * 设计要点：
 *   - toTransferable() 将对象拆为「轻量元数据 + ArrayBuffer 列表」
 *   - 元数据通过 Structured Clone 传输（自动深拷贝）
 *   - buffers 通过 Transferable 传输（零拷贝，所有权转移）
 *   - 传输后原线程的 ArrayBuffer 会被 detach（不可用），
 *     Worker 处理完毕后应通过返回值将 buffer 归还主线程
 */
export interface ITransferable {
  /**
   * 提取可转移的 ArrayBuffer，返回元数据和 buffer 列表。
   * 调用后当前实例中对应的 TypedArray 视图将失效（底层 buffer 被转移）。
   */
  toTransferable(): TransferableData

  /**
   * 从元数据和 buffer 列表重建实例（静态方法约定，接口层无法约束）。
   * 各类自行实现: static fromTransferable(data: TransferableData): T
   */
}

/**
 * Worker 传输数据结构
 * - meta: 轻量描述数据，走 Structured Clone（自动深拷贝）
 * - buffers: 大型二进制数据，走 Transferable（零拷贝所有权转移）
 */
export interface TransferableData {
  /** 类型标识，用于反序列化时查找对应的类 */
  $type: string
  /** 轻量元数据（不含 ArrayBuffer），通过 Structured Clone 传输 */
  meta: Record<string, any>
  /** 可转移的 ArrayBuffer 列表，通过 postMessage 第二参数传输 */
  buffers: ArrayBuffer[]
}
