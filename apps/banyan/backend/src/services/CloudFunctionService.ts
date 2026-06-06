import crypto from 'node:crypto'
import { CloudFunction } from '../models/index.js'
import type { ICloudFunction } from '../models/types/index.js'

export interface ICloudFunctionListResult {
  functions: ICloudFunction[]
}

export interface ICreateCloudFunctionData {
  name: string
  displayName?: string
  description?: string
  flowSchema?: Record<string, unknown>
}

export interface IUpdateCloudFunctionData {
  name?: string
  displayName?: string
  description?: string
  flowSchema?: Record<string, unknown>
}

class CloudFunctionService {
  /**
   * 获取应用的所有云函数列表
   */
  async listByApp(appId: string): Promise<ICloudFunction[]> {
    const functions = await CloudFunction.find({ appId }).sort({ createdAt: -1 }).lean()
    return functions as unknown as ICloudFunction[]
  }

  /**
   * 根据 functionId 获取单个云函数
   */
  async getByFunctionId(appId: string, functionId: string): Promise<ICloudFunction | null> {
    const fn = await CloudFunction.findOne({ appId, functionId }).lean()
    return fn as unknown as ICloudFunction | null
  }

  /**
   * 创建云函数
   */
  async create(appId: string, data: ICreateCloudFunctionData): Promise<ICloudFunction> {
    const trimmedName = data.name.trim()

    const existing = await CloudFunction.findOne({ appId, name: trimmedName })
    if (existing) {
      throw new Error(`DUPLICATE_NAME:${trimmedName}`)
    }

    const functionId = crypto.randomUUID()
    const fn = await CloudFunction.create({
      functionId,
      appId,
      name: trimmedName,
      displayName: data.displayName?.trim() || trimmedName,
      description: data.description?.trim() || '',
      flowSchema: data.flowSchema ?? { nodes: [], edges: [] },
    })

    return fn.toObject() as unknown as ICloudFunction
  }

  /**
   * 更新云函数（version 自增）
   */
  async update(
    appId: string,
    functionId: string,
    data: IUpdateCloudFunctionData
  ): Promise<ICloudFunction | null> {
    const fn = await CloudFunction.findOne({ appId, functionId })
    if (!fn) return null

    if (data.name !== undefined) {
      const trimmedName = data.name.trim()
      if (trimmedName !== fn.name) {
        const dup = await CloudFunction.findOne({ appId, name: trimmedName })
        if (dup) {
          throw new Error(`DUPLICATE_NAME:${trimmedName}`)
        }
        fn.name = trimmedName
      }
    }

    if (data.displayName !== undefined) fn.displayName = data.displayName.trim()
    if (data.description !== undefined) fn.description = data.description.trim()
    if (data.flowSchema !== undefined) fn.flowSchema = data.flowSchema
    fn.version += 1

    await fn.save()
    return fn.toObject() as unknown as ICloudFunction
  }

  /**
   * 删除云函数
   */
  async delete(appId: string, functionId: string): Promise<boolean> {
    const result = await CloudFunction.deleteOne({ appId, functionId })
    return result.deletedCount > 0
  }

  /**
   * 批量同步云函数（前端快照覆盖式写入）
   *
   * 前端在 AI chat 请求时上传当前内存中的所有云函数，
   * 后端以此为"单一事实来源"覆盖式同步到 DB：
   *   - 已存在的 functionId → 更新 name/displayName/description/flowSchema + version++
   *   - 新 functionId → 创建
   *   - DB 中存在但前端未传的 → 删除（说明用户已在前端删除）
   *
   * @param appId       目标应用 ID
   * @param functions   前端传入的云函数快照列表
   */
  async bulkSync(
    appId: string,
    functions: Array<{
      functionId: string
      name: string
      displayName?: string
      description?: string
      flowSchema?: Record<string, unknown>
    }>
  ): Promise<void> {
    // 获取 DB 中该应用现有的所有云函数
    const existing = await CloudFunction.find({ appId }).lean()
    const existingMap = new Map(existing.map((f) => [f.functionId, f]))

    const incomingIds = new Set(functions.map((f) => f.functionId))

    // 1. 删除前端不再包含的函数
    const toDelete = existing.filter((f) => !incomingIds.has(f.functionId))
    if (toDelete.length > 0) {
      await CloudFunction.deleteMany({
        appId,
        functionId: { $in: toDelete.map((f) => f.functionId) },
      })
    }

    // 2. 逐条 upsert（更新或创建）
    const ops = functions.map((fn) => ({
      updateOne: {
        filter: { appId, functionId: fn.functionId },
        update: {
          $set: {
            name: fn.name.trim(),
            displayName: fn.displayName?.trim() || fn.name.trim(),
            description: fn.description?.trim() || '',
            flowSchema: fn.flowSchema ?? { nodes: [], edges: [] },
          },
          $setOnInsert: {
            appId,
            functionId: fn.functionId,
            version: 1,
          },
          // 已存在时 version 自增
          ...(existingMap.has(fn.functionId) ? { $inc: { version: 1 } } : {}),
        },
        upsert: true,
      },
    }))

    if (ops.length > 0) {
      await CloudFunction.bulkWrite(ops)
    }
  }
}

export default new CloudFunctionService()
