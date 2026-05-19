import mongoose from 'mongoose'
import AppSchemaModel, { ICollectionDef, IFieldDef } from '../models/AppSchema.js'

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
function buildMongooseSchemaDefinition(
  fields: IFieldDef[],
): mongoose.SchemaDefinition {
  const def: mongoose.SchemaDefinition = {}

  for (const field of fields) {
    switch (field.type) {
      case 'string':
      case 'enum':
        def[field.name] = {
          type: String,
          required: field.required,
          default: field.defaultValue ?? undefined,
          ...(field.type === 'enum' && field.enumValues?.length
            ? { enum: field.enumValues }
            : {}),
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

// ── Schema CRUD ───────────────────────────────────────────────────────────────

export class SchemaService {
  /**
   * 获取应用的 Schema（不存在则返回空 Schema）
   */
  static async getSchema(appId: string) {
    const doc = await AppSchemaModel.findOne({ appId })
    if (!doc) {
      return { appId, collections: [], version: 0 }
    }
    return doc.toObject()
  }

  /**
   * 获取单个 Collection 定义
   */
  static async getCollection(appId: string, collectionName: string): Promise<ICollectionDef | null> {
    const doc = await AppSchemaModel.findOne({ appId })
    if (!doc) return null
    return doc.collections.find((c) => c.name === collectionName) ?? null
  }

  /**
   * 新增 Collection
   */
  static async addCollection(
    appId: string,
    collection: ICollectionDef,
  ) {
    const doc = await AppSchemaModel.findOne({ appId })

    if (doc) {
      const exists = doc.collections.some((c) => c.name === collection.name)
      if (exists) {
        throw Object.assign(new Error(`Collection "${collection.name}" already exists`), { status: 409 })
      }
      doc.collections.push(collection)
      doc.version += 1
      await doc.save()
      return doc.toObject()
    } else {
      const newDoc = await AppSchemaModel.create({
        appId,
        collections: [collection],
        version: 1,
      })
      return newDoc.toObject()
    }
  }

  /**
   * 更新 Collection（整体替换 fields）
   */
  static async updateCollection(
    appId: string,
    collectionName: string,
    updates: Partial<Pick<ICollectionDef, 'displayName' | 'fields'>>,
  ) {
    const doc = await AppSchemaModel.findOne({ appId })
    if (!doc) {
      throw Object.assign(new Error(`AppSchema for app "${appId}" not found`), { status: 404 })
    }

    const idx = doc.collections.findIndex((c) => c.name === collectionName)
    if (idx === -1) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }

    if (updates.displayName !== undefined) {
      doc.collections[idx].displayName = updates.displayName
    }
    if (updates.fields !== undefined) {
      doc.collections[idx].fields = updates.fields
      // 字段变更，清除 Model 缓存
      invalidateDynamicModel(appId, collectionName)
    }

    doc.version += 1
    await doc.save()
    return doc.toObject()
  }

  /**
   * 删除 Collection
   */
  static async deleteCollection(appId: string, collectionName: string) {
    const doc = await AppSchemaModel.findOne({ appId })
    if (!doc) {
      throw Object.assign(new Error(`AppSchema for app "${appId}" not found`), { status: 404 })
    }

    const before = doc.collections.length
    doc.collections = doc.collections.filter((c) => c.name !== collectionName)

    if (doc.collections.length === before) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }

    doc.version += 1
    await doc.save()

    // 清除 Model 缓存
    invalidateDynamicModel(appId, collectionName)

    return doc.toObject()
  }

  /**
   * 新增字段到 Collection
   */
  static async addField(
    appId: string,
    collectionName: string,
    field: IFieldDef,
  ) {
    const doc = await AppSchemaModel.findOne({ appId })
    if (!doc) {
      throw Object.assign(new Error(`AppSchema for app "${appId}" not found`), { status: 404 })
    }

    const collection = doc.collections.find((c) => c.name === collectionName)
    if (!collection) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }

    const fieldExists = collection.fields.some((f) => f.name === field.name)
    if (fieldExists) {
      throw Object.assign(new Error(`Field "${field.name}" already exists`), { status: 409 })
    }

    collection.fields.push(field)
    doc.version += 1
    await doc.save()

    invalidateDynamicModel(appId, collectionName)
    return doc.toObject()
  }

  /**
   * 更新字段
   */
  static async updateField(
    appId: string,
    collectionName: string,
    fieldName: string,
    updates: Partial<IFieldDef>,
  ) {
    const doc = await AppSchemaModel.findOne({ appId })
    if (!doc) {
      throw Object.assign(new Error(`AppSchema for app "${appId}" not found`), { status: 404 })
    }

    const collection = doc.collections.find((c) => c.name === collectionName)
    if (!collection) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }

    const fieldIdx = collection.fields.findIndex((f) => f.name === fieldName)
    if (fieldIdx === -1) {
      throw Object.assign(new Error(`Field "${fieldName}" not found`), { status: 404 })
    }

    Object.assign(collection.fields[fieldIdx], updates)
    doc.version += 1
    await doc.save()

    invalidateDynamicModel(appId, collectionName)
    return doc.toObject()
  }

  /**
   * 删除字段
   */
  static async deleteField(
    appId: string,
    collectionName: string,
    fieldName: string,
  ) {
    const doc = await AppSchemaModel.findOne({ appId })
    if (!doc) {
      throw Object.assign(new Error(`AppSchema for app "${appId}" not found`), { status: 404 })
    }

    const collection = doc.collections.find((c) => c.name === collectionName)
    if (!collection) {
      throw Object.assign(new Error(`Collection "${collectionName}" not found`), { status: 404 })
    }

    const before = collection.fields.length
    collection.fields = collection.fields.filter((f) => f.name !== fieldName)

    if (collection.fields.length === before) {
      throw Object.assign(new Error(`Field "${fieldName}" not found`), { status: 404 })
    }

    doc.version += 1
    await doc.save()

    invalidateDynamicModel(appId, collectionName)
    return doc.toObject()
  }

  /**
   * 整体替换应用的 Schema（AI schema_set_collections 工具专用）
   *
   * 策略：upsert 整个文档，version 递增，并失效所有旧 Model 缓存。
   * 调用方（AiService）在收到 schema_update SSE 事件后调用此方法。
   */
  static async setCollections(appId: string, collections: ICollectionDef[]) {
    // 清除所有旧 Model 缓存（新 Schema 可能增删集合或改字段）
    invalidateAllDynamicModels(appId)

    const doc = await AppSchemaModel.findOne({ appId })
    if (doc) {
      doc.collections = collections
      doc.version += 1
      await doc.save()
      return doc.toObject()
    } else {
      const newDoc = await AppSchemaModel.create({
        appId,
        collections,
        version: 1,
      })
      return newDoc.toObject()
    }
  }
}
