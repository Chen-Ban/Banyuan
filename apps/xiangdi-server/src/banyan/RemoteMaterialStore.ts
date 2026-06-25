/**
 * RemoteMaterialStore — 物料存储远程适配器
 *
 * 实现 MaterialStore 接口，通过 BanyanClient 调用 banyan 后端物料 API。
 * 设计上与 RemoteKnowledgeStore 类似：
 *   - xiangdi-server 不直接访问 MongoDB
 *   - 物料数据由 banyan 后端持久化，本适配器只做代理
 *   - 错误降级为空结果（非致命），通过结构化日志记录
 */

import type { MaterialStore, MaterialSummary, MaterialDetail } from '@banyuan/xiangdi-agent'
import type { BanyanClient } from './BanyanClient.js'
import { logger } from '../logger.js'

export class RemoteMaterialStore implements MaterialStore {
  constructor(private readonly banyanClient: BanyanClient) {}

  async search(keyword: string, limit?: number): Promise<MaterialSummary[]> {
    try {
      return await this.banyanClient.searchMaterials(keyword, limit)
    } catch (err) {
      logger.warn('[RemoteMaterialStore] search failed, degrading to empty results', {
        error: err instanceof Error ? err.message : String(err),
        keyword: keyword.slice(0, 100),
      })
      return []
    }
  }

  async getDetail(materialId: string): Promise<MaterialDetail | null> {
    try {
      return await this.banyanClient.getMaterialDetail(materialId)
    } catch (err) {
      logger.warn('[RemoteMaterialStore] getDetail failed, degrading to null', {
        error: err instanceof Error ? err.message : String(err),
        materialId,
      })
      return null
    }
  }
}
