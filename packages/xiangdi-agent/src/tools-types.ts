/**
 * 相地 · 工具依赖注入接口
 *
 * 这些接口定义了 xiangdi-server 层需要实现的外部服务适配器契约。
 * 实现方通过依赖注入传入 Orchestrator，Agent 不直接访问外部服务。
 */

// ─── 物料存储接口 ────────────────────────────────────────────────────────────────

/**
 * 物料存储接口，由 xiangdi-server 层实现并注入
 *
 * 抽象物料服务的网络调用，工具层只依赖此接口。
 */
export interface MaterialStore {
  /** 搜索物料，返回匹配的元数据列表 */
  search(keyword: string, limit?: number): Promise<MaterialSummary[]>
  /** 获取物料详情（含完整参数定义） */
  getDetail(materialId: string): Promise<MaterialDetail | null>
}

export interface MaterialSummary {
  material_id: string
  name: string
  description?: string
  tags?: string[]
  /** 参数名列表（快速预览） */
  parameterNames?: string[]
}

export interface MaterialDetail {
  material_id: string
  name: string
  description?: string
  tags?: string[]
  parameters: Array<{
    id: string
    name: string
    type: string
    description?: string
    defaultValue?: unknown
    required?: boolean
  }>
  assets: Array<{
    id: string
    type: string
    url: string
  }>
}
