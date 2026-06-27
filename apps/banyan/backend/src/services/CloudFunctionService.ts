/**
 * CloudFunctionService（ADR-042）
 *
 * 使用 CloudFunction 模型（per-app 打包，append-only 版本化）。
 *
 * 核心语义：
 *   - 所有写操作产生新版本文档（append-only）
 *   - 读取通过 `findOne({ appId }).sort({ version: -1 })` 获取最新
 *   - 版本永不删除
 *   - 无版本指针，无向后兼容
 */

import crypto from 'node:crypto'
import type { Types } from 'mongoose'
import { CloudFunction } from '../models/index.js'
import type { ICloudFunctionDef, ICloudFunctionGroup } from '../models/types/index.js'
import { validateIdentifier } from '../utils/nameValidation.js'

export interface ICloudFunctionListResult {
  functions: ICloudFunctionDef[]
  version: number
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

export class CloudFunctionService {
  // ─── 读取 ──────────────────────────────────────────────────────────────────

  /**
   * 获取应用的最新云函数组
   */
  async getLatestGroup(appId: string): Promise<ICloudFunctionGroup | null> {
    const doc = await CloudFunction.findOne({ appId }).sort({ version: -1 }).lean()
    return doc as ICloudFunctionGroup | null
  }

  /**
   * 获取指定版本的云函数组
   */
  async getByVersion(appId: string, version: number): Promise<ICloudFunctionGroup | null> {
    const doc = await CloudFunction.findOne({ appId, version }).lean()
    return doc as ICloudFunctionGroup | null
  }

  /**
   * 获取应用的所有云函数列表
   */
  async listByApp(appId: string): Promise<ICloudFunctionDef[]> {
    const group = await this.getLatestGroup(appId)
    return group?.functions ?? []
  }

  /**
   * 根据 functionId 获取单个云函数
   */
  async getByFunctionId(appId: string, functionId: string): Promise<ICloudFunctionDef | null> {
    const functions = await this.listByApp(appId)
    return functions.find((fn) => fn.functionId === functionId) ?? null
  }

  /**
   * 获取应用当前的最大版本号（含未接受 draft）
   */
  async getMaxVersion(appId: string): Promise<number> {
    const latest = await CloudFunction.findOne({ appId }).sort({ version: -1 }).lean()
    return latest ? latest.version : 0
  }

  // ─── 版本号引用模型（对话驱动）─────────────────────────────────────────────────

  /**
   * 创建草稿版本（对话发起时调用）
   *
   * 拷贝基线版本的 functions，append 一个新版本并绑定 dialogueId。
   *
   * @param appId       应用 ID
   * @param dialogueId  持有该版本的对话 ID
   * @param baseVersion 拷贝基线版本号（最新已接受版本，0 表示无基线）
   * @returns 新版本号
   */
  async createDraftVersion(appId: string, dialogueId: Types.ObjectId, baseVersion: number): Promise<number> {
    const base = baseVersion > 0 ? await this.getByVersion(appId, baseVersion) : null
    const newVersion = (await this.getMaxVersion(appId)) + 1

    await CloudFunction.create({
      appId,
      version: newVersion,
      dialogueId,
      functions: base?.functions ?? [],
    })

    return newVersion
  }

  /**
   * 按版本号原地更新 functions（构建期间 agent / 用户修改）
   */
  async updateByVersion(appId: string, version: number, functions: ICloudFunctionDef[]): Promise<void> {
    await CloudFunction.updateOne({ appId, version }, { $set: { functions } })
  }

  // ─── 写入（append-only，每次产生新版本）────────────────────────────────────────

  /**
   * 创建云函数（产生新版本）
   */
  async create(appId: string, data: ICreateCloudFunctionData): Promise<ICloudFunctionDef> {
    const trimmedName = data.name.trim()
    const currentFunctions = await this.listByApp(appId)

    const existing = currentFunctions.find((fn) => fn.name === trimmedName)
    if (existing) {
      throw new Error(`DUPLICATE_NAME:${trimmedName}`)
    }

    const newFunction: ICloudFunctionDef = {
      functionId: crypto.randomUUID(),
      name: trimmedName,
      displayName: data.displayName?.trim() || trimmedName,
      description: data.description?.trim() || '',
      flowSchema: data.flowSchema ?? { nodes: [], edges: [] },
    }

    const newFunctions = [...currentFunctions, newFunction]
    await this._writeNewVersion(appId, newFunctions)

    return newFunction
  }

  /**
   * 更新云函数（产生新版本）
   */
  async update(
    appId: string,
    functionId: string,
    data: IUpdateCloudFunctionData,
  ): Promise<ICloudFunctionDef | null> {
    const currentFunctions = await this.listByApp(appId)
    const idx = currentFunctions.findIndex((fn) => fn.functionId === functionId)
    if (idx === -1) return null

    const fn = { ...currentFunctions[idx] }

    if (data.name !== undefined) {
      const trimmedName = data.name.trim()
      if (trimmedName !== fn.name) {
        const dup = currentFunctions.find((f) => f.name === trimmedName && f.functionId !== functionId)
        if (dup) {
          throw new Error(`DUPLICATE_NAME:${trimmedName}`)
        }
        fn.name = trimmedName
      }
    }

    if (data.displayName !== undefined) fn.displayName = data.displayName.trim()
    if (data.description !== undefined) fn.description = data.description.trim()
    if (data.flowSchema !== undefined) fn.flowSchema = data.flowSchema

    const newFunctions = [...currentFunctions]
    newFunctions[idx] = fn
    await this._writeNewVersion(appId, newFunctions)

    return fn
  }

  /**
   * 删除云函数（产生新版本）
   */
  async delete(appId: string, functionId: string): Promise<boolean> {
    const currentFunctions = await this.listByApp(appId)
    const newFunctions = currentFunctions.filter((fn) => fn.functionId !== functionId)

    if (newFunctions.length === currentFunctions.length) {
      return false // 未找到该函数
    }

    await this._writeNewVersion(appId, newFunctions)
    return true
  }

  /**
   * 批量同步云函数（覆盖式写入，产生新版本）
   *
   * AI 对话结束或前端同步时调用。
   */
  async bulkSync(
    appId: string,
    functions: Array<{
      functionId: string
      name: string
      displayName?: string
      description?: string
      flowSchema?: Record<string, unknown>
    }>,
  ): Promise<number> {
    const newFunctions: ICloudFunctionDef[] = functions.map((fn) => ({
      functionId: fn.functionId,
      name: fn.name.trim(),
      displayName: fn.displayName?.trim() || fn.name.trim(),
      description: fn.description?.trim() || '',
      flowSchema: fn.flowSchema ?? { nodes: [], edges: [] },
    }))

    return this._writeNewVersion(appId, newFunctions)
  }

  // ─── 纯计算辅助（无 DB 访问，供直接编辑控制器方向 B 包装使用）──────────────────
  //
  // 这些 static 方法对传入的 functions 数组做不可变变换，返回新数组；
  // 校验失败时抛带 status 的错误（被全局错误中间件翻译为 HTTP 状态码）。
  // 控制器在 dialogueService.runAutoConfirmedEdit 的 mutator 中：
  //   读取草稿版本 functions → compute* 变换 → updateByVersion 原地写回。

  /**
   * 计算「新增云函数」后的 functions（返回 { functions, created }）
   */
  static computeCreate(
    functions: ICloudFunctionDef[],
    data: ICreateCloudFunctionData,
  ): { functions: ICloudFunctionDef[]; created: ICloudFunctionDef } {
    const trimmedName = validateIdentifier(data.name, '函数名')
    if (functions.some((fn) => fn.name === trimmedName)) {
      throw Object.assign(new Error(`Cloud function "${trimmedName}" already exists`), { status: 409 })
    }

    const created: ICloudFunctionDef = {
      functionId: crypto.randomUUID(),
      name: trimmedName,
      displayName: data.displayName?.trim() || trimmedName,
      description: data.description?.trim() || '',
      flowSchema: data.flowSchema ?? { nodes: [], edges: [] },
    }

    return { functions: [...functions, created], created }
  }

  /**
   * 计算「更新云函数」后的 functions（返回 { functions, updated }）
   */
  static computeUpdate(
    functions: ICloudFunctionDef[],
    functionId: string,
    data: IUpdateCloudFunctionData,
  ): { functions: ICloudFunctionDef[]; updated: ICloudFunctionDef } {
    const idx = functions.findIndex((fn) => fn.functionId === functionId)
    if (idx === -1) {
      throw Object.assign(new Error(`Cloud function "${functionId}" not found`), { status: 404 })
    }

    const fn: ICloudFunctionDef = { ...functions[idx] }

    if (data.name !== undefined) {
      const trimmedName = validateIdentifier(data.name, '函数名')
      if (trimmedName !== fn.name) {
        const dup = functions.find((f) => f.name === trimmedName && f.functionId !== functionId)
        if (dup) {
          throw Object.assign(new Error(`Cloud function "${trimmedName}" already exists`), { status: 409 })
        }
        fn.name = trimmedName
      }
    }
    if (data.displayName !== undefined) fn.displayName = data.displayName.trim()
    if (data.description !== undefined) fn.description = data.description.trim()
    if (data.flowSchema !== undefined) fn.flowSchema = data.flowSchema

    const next = [...functions]
    next[idx] = fn
    return { functions: next, updated: fn }
  }

  /**
   * 计算「删除云函数」后的 functions
   */
  static computeDelete(functions: ICloudFunctionDef[], functionId: string): ICloudFunctionDef[] {
    const next = functions.filter((fn) => fn.functionId !== functionId)
    if (next.length === functions.length) {
      throw Object.assign(new Error(`Cloud function "${functionId}" not found`), { status: 404 })
    }
    return next
  }

  // ─── 私有方法 ──────────────────────────────────────────────────────────────

  /**
   * 写入新版本（核心方法）
   *
   * 1. 查询当前最大版本号
   * 2. 写入 version+1 的新文档
   *
   * @returns 新版本号
   */
  private async _writeNewVersion(appId: string, functions: ICloudFunctionDef[]): Promise<number> {
    const latest = await CloudFunction.findOne({ appId }).sort({ version: -1 }).lean()
    const newVersion = latest ? latest.version + 1 : 1

    await CloudFunction.create({
      appId,
      version: newVersion,
      functions,
    })

    return newVersion
  }
}

export default new CloudFunctionService()
