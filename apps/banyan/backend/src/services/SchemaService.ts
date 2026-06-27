/**
 * SchemaService（ADR-042 升级：append-only 版本化）
 *
 * 核心变更：
 *   - 每次写操作（addCollection/updateCollection/deleteCollection/setCollections 等）
 *     都产生新版本文档（append-only），旧版本永不修改
 *   - 通过 Application.currentCollectionSchemaVersion 指针关联当前版本
 *   - 读操作读最新版本（或指定版本）
 *   - 字段级 CRUD 有 debounce/merge 语义：多个连续字段操作可以在同一个新版本中合并
 *
 * 保留原有的动态 Model 缓存逻辑不变。
 */

import mongoose from 'mongoose'
import type { Types } from 'mongoose'
import CollectionSchemaModel from '../models/application/CollectionSchema.js'
import type { ICollectionDef, IFieldDef } from '../models/types/index.js'
import { validateIdentifier } from '../utils/nameValidation.js'

// ── 动态 Model 缓存 ───────────────────────────────────────────────────────────
// key: `${appId}__${collectionName}`
// 每次 Schema 变更时，对应 key 的缓存需要清除并重建
const modelCache = new Map<string, mongoose.Model<mongoose.Document>>()

function getCacheKey(appId: string, collectionName: string): string {
  return `${appId}__${collectionName}`
}

/**
 * 根据 ICollectionDef 构建 Mongoose SchemaDefinition
 */
function buildMongooseSchemaDefinition(fields: IFieldDef[]): mongoose.SchemaDefinition {
  const def: mongoose.SchemaDefinition = {}

  for (const field of fields) {
    switch (field.type) {
      case 'string':
      case 'enum':
        def[field.name] = {
          type: String,
          required: field.required,
          default: field.defaultValue ?? undefined,
          ...(field.type === 'enum' && field.enumValues?.length ? { enum: field.enumValues } : {}),
        }
        break
      case 'number':
        def[field.name] = {
          type: Number,
          required: field.required,
          default: field.defaultValue ?? undefined,
        }
        break
      case 'boolean':
        def[field.name] = {
          type: Boolean,
          required: field.required,
          default: field.defaultValue ?? undefined,
        }
        break
      case 'date':
        def[field.name] = {
          type: Date,
          required: field.required,
          default: field.defaultValue ?? undefined,
        }
        break
      case 'ref':
        def[field.name] = {
          type: mongoose.Schema.Types.ObjectId,
          ref: field.refCollection,
          required: field.required,
        }
        break
      case 'array':
        def[field.name] = {
          type: [mongoose.Schema.Types.Mixed],
          default: field.defaultValue ?? [],
        }
        break
      case 'object':
      default:
        def[field.name] = {
          type: mongoose.Schema.Types.Mixed,
          default: field.defaultValue ?? undefined,
        }
        break
    }
  }

  return def
}

/**
 * 获取（或创建）某个应用 Collection 的动态 Mongoose Model
 * 集合名规则：app_{appId}_{collectionName}
 */
export function getDynamicModel(
  appId: string,
  collectionName: string,
  fields: IFieldDef[],
): mongoose.Model<mongoose.Document> {
  const cacheKey = getCacheKey(appId, collectionName)

  if (modelCache.has(cacheKey)) {
    return modelCache.get(cacheKey)!
  }

  const mongoCollectionName = `app_${appId}_${collectionName}`
  const schemaDef = buildMongooseSchemaDefinition(fields)
  const schema = new mongoose.Schema(schemaDef, {
    timestamps: true,
    strict: false, // 允许存储 Schema 未定义的字段（schemaless 友好）
  })

  // 如果 Mongoose 已注册同名 Model（热重载场景），先删除再重建
  if (mongoose.modelNames().includes(mongoCollectionName)) {
    delete (mongoose.connection.models as Record<string, unknown>)[mongoCollectionName]
  }

  const model = mongoose.model<mongoose.Document>(mongoCollectionName, schema, mongoCollectionName)
  modelCache.set(cacheKey, model)
  return model
}

/**
 * 清除某个 Collection 的 Model 缓存（Schema 变更后调用）
 */
export function invalidateDynamicModel(appId: string, collectionName: string): void {
  const cacheKey = getCacheKey(appId, collectionName)
  modelCache.delete(cacheKey)

  const mongoCollectionName = `app_${appId}_${collectionName}`
  if (mongoose.modelNames().includes(mongoCollectionName)) {
    delete (mongoose.connection.models as Record<string, unknown>)[mongoCollectionName]
  }
}

/**
 * 清除某个应用所有 Collection 的 Model 缓存
 */
export function invalidateAllDynamicModels(appId: string): void {
  for (const key of modelCache.keys()) {
    if (key.startsWith(`${appId}__`)) {
      const collectionName = key.slice(`${appId}__`.length)
      invalidateDynamicModel(appId, collectionName)
    }
  }
}

// ── Schema CRUD（ADR-042 版本化语义）─────────────────────────────────────────────

export class SchemaService {
  /**
   * 获取应用的最新 Schema（从 append-only 表，不存在则返回空）
   *
   * 优先从新表读取最新版本。
   */
  static async getSchema(
    appId: string,
  ): Promise<{ appId: string; collections: ICollectionDef[]; version: number }> {
    const doc = await CollectionSchemaModel.findOne({ appId }).sort({ version: -1 }).lean()
    if (!doc) {
      return { appId, collections: [], version: 0 }
    }
    return {
      appId: doc.appId,
      collections: doc.collections as unknown as ICollectionDef[],
      version: doc.version,
    }
  }

  /**
   * 获取指定版本的 Schema
   */
  static async getByVersion(
    appId: string,
    version: number,
  ): Promise<{ appId: string; collections: ICollectionDef[]; version: number } | null> {
    const doc = await CollectionSchemaModel.findOne({ appId, version }).lean()
    if (!doc) return null
    return {
      appId: doc.appId,
      collections: doc.collections as unknown as ICollectionDef[],
      version: doc.version,
    }
  }

  /**
   * 获取单个 Collection 定义
   */
  static async getCollection(appId: string, collectionName: string): Promise<ICollectionDef | null> {
    const { collections } = await this.getSchema(appId)
    return collections.find((c) => c.name === collectionName) ?? null
  }

  /**
   * 获取应用当前的最大版本号（含未接受 draft）
   */
  static async getMaxVersion(appId: string): Promise<number> {
    const doc = await CollectionSchemaModel.findOne({ appId }).sort({ version: -1 }).lean()
    return doc ? doc.version : 0
  }

  // ─── 版本号引用模型（对话驱动）─────────────────────────────────────────────────

  /**
   * 创建草稿版本（对话发起时调用）
   *
   * 拷贝基线版本的 collections，append 一个新版本并绑定 dialogueId。
   *
   * @param appId       应用 ID
   * @param dialogueId  持有该版本的对话 ID
   * @param baseVersion 拷贝基线版本号（最新已接受版本，0 表示无基线）
   * @returns 新版本号
   */
  static async createDraftVersion(
    appId: string,
    dialogueId: Types.ObjectId,
    baseVersion: number,
  ): Promise<number> {
    const base = baseVersion > 0 ? await this.getByVersion(appId, baseVersion) : null
    const newVersion = (await this.getMaxVersion(appId)) + 1

    await CollectionSchemaModel.create({
      appId,
      collections: base?.collections ?? [],
      version: newVersion,
      dialogueId,
    })

    return newVersion
  }

  /**
   * 按版本号原地更新 collections（构建期间 agent / 用户修改）
   *
   * 同时清除该应用的所有动态 Model 缓存（集合/字段可能变更）。
   */
  static async updateByVersion(appId: string, version: number, collections: ICollectionDef[]): Promise<void> {
    invalidateAllDynamicModels(appId)
    await CollectionSchemaModel.updateOne({ appId, version }, { $set: { collections } })
  }

  /**
   * 新增 Collection（产生新版本）
   */
  static async addCollection(appId: string, collection: ICollectionDef) {
    const { collections, version: currentVersion } = await this.getSchema(appId)

    const exists = collections.some((c) => c.name === collection.name)
    if (exists) {
      throw Object.assign(new Error(`Collection "${collection.name}" already exists`), { status: 409 })
    }

    const newCollections = [...collections, collection]
    return this._writeNewVersion(appId, newCollections, currentVersion)
  }

  /**
   * 更新 Collection（整体替换 fields，产生新版本）
   */
  static async updateCollection(
    appId: string,
    collectionName: string,
    updates: Partial<Pick<ICollectionDef, 'displayName' | 'fields'>>,
  ) {
    const { collections, version: currentVersion } = await this.getSchema(appId)

    const idx = collections.findIndex((c) => c.name === collectionName)
    if (idx === -1) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }

    const newCollections = [...collections]
    newCollections[idx] = { ...newCollections[idx] }

    if (updates.displayName !== undefined) {
      newCollections[idx].displayName = updates.displayName
    }
    if (updates.fields !== undefined) {
      newCollections[idx].fields = updates.fields
      invalidateDynamicModel(appId, collectionName)
    }

    return this._writeNewVersion(appId, newCollections, currentVersion)
  }

  /**
   * 删除 Collection（产生新版本）
   */
  static async deleteCollection(appId: string, collectionName: string) {
    const { collections, version: currentVersion } = await this.getSchema(appId)

    const newCollections = collections.filter((c) => c.name !== collectionName)
    if (newCollections.length === collections.length) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }

    invalidateDynamicModel(appId, collectionName)
    return this._writeNewVersion(appId, newCollections, currentVersion)
  }

  /**
   * 新增字段到 Collection（产生新版本）
   */
  static async addField(appId: string, collectionName: string, field: IFieldDef) {
    const { collections, version: currentVersion } = await this.getSchema(appId)

    const collectionIdx = collections.findIndex((c) => c.name === collectionName)
    if (collectionIdx === -1) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }

    const collection = collections[collectionIdx]
    const fieldExists = collection.fields.some((f) => f.name === field.name)
    if (fieldExists) {
      throw Object.assign(new Error(`Field "${field.name}" already exists`), { status: 409 })
    }

    const newCollections = [...collections]
    newCollections[collectionIdx] = {
      ...collection,
      fields: [...collection.fields, field],
    }

    invalidateDynamicModel(appId, collectionName)
    return this._writeNewVersion(appId, newCollections, currentVersion)
  }

  /**
   * 更新字段（产生新版本）
   */
  static async updateField(
    appId: string,
    collectionName: string,
    fieldName: string,
    updates: Partial<IFieldDef>,
  ) {
    const { collections, version: currentVersion } = await this.getSchema(appId)

    const collectionIdx = collections.findIndex((c) => c.name === collectionName)
    if (collectionIdx === -1) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }

    const collection = collections[collectionIdx]
    const fieldIdx = collection.fields.findIndex((f) => f.name === fieldName)
    if (fieldIdx === -1) {
      throw Object.assign(new Error(`Field "${fieldName}" not found`), { status: 404 })
    }

    const newFields = [...collection.fields]
    newFields[fieldIdx] = { ...newFields[fieldIdx], ...updates }

    const newCollections = [...collections]
    newCollections[collectionIdx] = { ...collection, fields: newFields }

    invalidateDynamicModel(appId, collectionName)
    return this._writeNewVersion(appId, newCollections, currentVersion)
  }

  /**
   * 删除字段（产生新版本）
   */
  static async deleteField(appId: string, collectionName: string, fieldName: string) {
    const { collections, version: currentVersion } = await this.getSchema(appId)

    const collectionIdx = collections.findIndex((c) => c.name === collectionName)
    if (collectionIdx === -1) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }

    const collection = collections[collectionIdx]
    const newFields = collection.fields.filter((f) => f.name !== fieldName)
    if (newFields.length === collection.fields.length) {
      throw Object.assign(new Error(`Field "${fieldName}" not found`), { status: 404 })
    }

    const newCollections = [...collections]
    newCollections[collectionIdx] = { ...collection, fields: newFields }

    invalidateDynamicModel(appId, collectionName)
    return this._writeNewVersion(appId, newCollections, currentVersion)
  }

  /**
   * 整体替换应用的 Schema（AI schema_set_collections 工具专用，产生新版本）
   *
   * 调用方（AiService）在收到 schema_update SSE 事件后调用此方法。
   */
  static async setCollections(appId: string, collections: ICollectionDef[]) {
    // 清除所有旧 Model 缓存（新 Schema 可能增删集合或改字段）
    invalidateAllDynamicModels(appId)

    const { version: currentVersion } = await this.getSchema(appId)
    return this._writeNewVersion(appId, collections, currentVersion)
  }

  // ─── 纯计算辅助（方向 B：直接编辑包装为 edit 对话时复用）────────────────────────
  // 这些方法不触碰数据库，仅对 collections 数组做不可变变换并返回新数组；
  // 调用方负责按版本号原地写入（updateByVersion）。

  /** 计算新增 Collection 后的数组（重复则抛 409） */
  static computeAddCollection(collections: ICollectionDef[], collection: ICollectionDef): ICollectionDef[] {
    validateIdentifier(collection.name, '表名')
    if (collections.some((c) => c.name === collection.name)) {
      throw Object.assign(new Error(`Collection "${collection.name}" already exists`), { status: 409 })
    }
    return [...collections, collection]
  }

  /** 计算更新 Collection 后的数组（不存在则抛 404） */
  static computeUpdateCollection(
    collections: ICollectionDef[],
    collectionName: string,
    updates: Partial<Pick<ICollectionDef, 'displayName' | 'fields'>>,
  ): ICollectionDef[] {
    const idx = collections.findIndex((c) => c.name === collectionName)
    if (idx === -1) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }
    const next = [...collections]
    next[idx] = { ...next[idx] }
    if (updates.displayName !== undefined) next[idx].displayName = updates.displayName
    if (updates.fields !== undefined) next[idx].fields = updates.fields
    return next
  }

  /** 计算删除 Collection 后的数组（不存在则抛 404） */
  static computeDeleteCollection(collections: ICollectionDef[], collectionName: string): ICollectionDef[] {
    const next = collections.filter((c) => c.name !== collectionName)
    if (next.length === collections.length) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }
    return next
  }

  /** 计算新增字段后的数组（集合不存在 404 / 字段重复 409） */
  static computeAddField(
    collections: ICollectionDef[],
    collectionName: string,
    field: IFieldDef,
  ): ICollectionDef[] {
    validateIdentifier(field.name, '字段名')
    const idx = collections.findIndex((c) => c.name === collectionName)
    if (idx === -1) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }
    if (collections[idx].fields.some((f) => f.name === field.name)) {
      throw Object.assign(new Error(`Field "${field.name}" already exists`), { status: 409 })
    }
    const next = [...collections]
    next[idx] = { ...next[idx], fields: [...next[idx].fields, field] }
    return next
  }

  /** 计算更新字段后的数组（集合/字段不存在均抛 404） */
  static computeUpdateField(
    collections: ICollectionDef[],
    collectionName: string,
    fieldName: string,
    updates: Partial<IFieldDef>,
  ): ICollectionDef[] {
    const idx = collections.findIndex((c) => c.name === collectionName)
    if (idx === -1) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }
    const fieldIdx = collections[idx].fields.findIndex((f) => f.name === fieldName)
    if (fieldIdx === -1) {
      throw Object.assign(new Error(`Field "${fieldName}" not found`), { status: 404 })
    }
    const newFields = [...collections[idx].fields]
    newFields[fieldIdx] = { ...newFields[fieldIdx], ...updates }
    const next = [...collections]
    next[idx] = { ...next[idx], fields: newFields }
    return next
  }

  /** 计算删除字段后的数组（集合/字段不存在均抛 404） */
  static computeDeleteField(
    collections: ICollectionDef[],
    collectionName: string,
    fieldName: string,
  ): ICollectionDef[] {
    const idx = collections.findIndex((c) => c.name === collectionName)
    if (idx === -1) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }
    const newFields = collections[idx].fields.filter((f) => f.name !== fieldName)
    if (newFields.length === collections[idx].fields.length) {
      throw Object.assign(new Error(`Field "${fieldName}" not found`), { status: 404 })
    }
    const next = [...collections]
    next[idx] = { ...next[idx], fields: newFields }
    return next
  }

  // ─── 私有方法 ──────────────────────────────────────────────────────────────

  /**
   * 写入新版本文档（核心方法）
   *
   * 1. 计算 newVersion = currentVersion + 1
   * 2. 创建新文档到 CollectionSchema 集合
   *
   * @returns { appId, collections, version }
   */
  private static async _writeNewVersion(
    appId: string,
    collections: ICollectionDef[],
    currentVersion: number,
  ): Promise<{ appId: string; collections: ICollectionDef[]; version: number }> {
    const newVersion = currentVersion + 1

    await CollectionSchemaModel.create({
      appId,
      collections,
      version: newVersion,
    })

    return { appId, collections, version: newVersion }
  }
}
