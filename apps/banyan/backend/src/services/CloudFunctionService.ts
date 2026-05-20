import crypto from 'node:crypto'
import { CloudFunction, ICloudFunction } from '../models/index.js'

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
}

export default new CloudFunctionService()
