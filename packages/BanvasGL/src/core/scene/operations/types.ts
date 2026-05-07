/**
 * 操作栈体系的公共类型定义
 *
 * 将接口定义独立到此文件，打破 TransactionManager ↔ DiffApplier 的循环引用。
 */

/**
 * Scene 向操作栈体系提供的访问能力
 * 通过接口注入，避免直接依赖 Scene 类
 */
export interface SceneAccessor {
  /** 通过 id 查找 View 实例 */
  findViewById(id: string): any | undefined
  /** 从场景中移除子视图 */
  removeChild(child: any): void
  /** 在指定位置插入子视图（设置 parent、VP矩阵、onAttach） */
  insertChildAt(child: any, index: number): void
  /**
   * 通过 id 查找容器节点（可能是 Scene 或 View）
   * 返回的对象需要有 children 数组
   */
  findContainerById(id: string): { children: any[] } | undefined
}

/**
 * 序列化器的最小接口（用于 DiffApplier 注入）
 * 避免直接依赖 Serializer 实现类（超级节点），消除间接循环依赖。
 */
export interface IReviver {
  /** 从序列化数据恢复对象实例 */
  revive<T = any>(data: any): T
}

/**
 * IReviver 的延迟工厂类型
 * 用于避免模块初始化阶段的循环依赖（Scene ↔ Serializer）
 */
export type ReviverFactory = () => IReviver
