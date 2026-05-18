/**
 * FunctionService — 云函数 CRUD 服务
 *
 * 管理应用的云函数元数据（代码、Schema、描述等），
 * 持久化到 MongoDB 的 AppFunction Collection。
 */

import AppFunctionModel, { IAppFunction } from '../models/AppFunction.js'

// ── 输入类型 ──────────────────────────────────────────────────────────────────

export interface UpsertFunctionInput {
  displayName: string
  description?: string
  code: string
  inputSchema?: Record<string, string>
  outputSchema?: Record<string, string>
}

// ── FunctionService ───────────────────────────────────────────────────────────

export class FunctionService {
  /**
   * 列出应用的所有云函数
   */
  static async listFunctions(appId: string): Promise<IAppFunction[]> {
    return AppFunctionModel.find({ appId }).sort({ createdAt: 1 }).exec()
  }

  /**
   * 获取单个云函数（按 appId + name）
   */
  static async getFunction(appId: string, name: string): Promise<IAppFunction | null> {
    return AppFunctionModel.findOne({ appId, name }).exec()
  }

  /**
   * 新增或更新云函数（upsert 语义：name 存在则更新，不存在则创建）
   */
  static async upsertFunction(appId: string, name: string, input: UpsertFunctionInput): Promise<IAppFunction> {
    const doc = await AppFunctionModel.findOneAndUpdate(
      { appId, name },
      {
        $set: {
          displayName: input.displayName,
          description: input.description ?? '',
          code: input.code,
          inputSchema: input.inputSchema ?? {},
          outputSchema: input.outputSchema ?? {},
        },
        $setOnInsert: {
          appId,
          name,
        },
      },
      { upsert: true, new: true, runValidators: true },
    ).exec()

    return doc
  }

  /**
   * 删除云函数
   */
  static async deleteFunction(appId: string, name: string): Promise<void> {
    const result = await AppFunctionModel.deleteOne({ appId, name }).exec()
    if (result.deletedCount === 0) {
      throw Object.assign(new Error(`Function "${name}" not found in app "${appId}"`), { status: 404 })
    }
  }

  /**
   * 代码语法校验（简单的 TypeScript 语法检查）
   * 使用 Function 构造器做基本语法检测，不执行代码
   */
  static validateCode(code: string): { valid: boolean; error?: string } {
    try {
      // 使用 new Function 做语法检查（不执行），检测 JS 语法错误
      // 云函数代码格式：async (input, ctx) => { ... }
      // 包装为可解析的函数体
      new Function('input', 'ctx', code)
      return { valid: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { valid: false, error: message }
    }
  }
}
