/**
 * 操作栈体系的内部类型定义
 *
 * SceneAccessor 已迁移至 @/types/IScene，此处重新导出供模块内部使用。
 * IReviver / ReviverFactory 仅在 operations 内部使用，保留在此。
 */

// 从 interfaces 重新导出，供 DiffApplier / TransactionManager 继续使用 './types' 路径
export type { SceneAccessor } from '@/types'

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
