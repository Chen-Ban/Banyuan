import mongoose from 'mongoose'
import { SchemaService, getDynamicModel } from './SchemaService.js'
import dialogueService from './DialogueService.js'

// ── CollectionAccessor 接口 ───────────────────────────────────────────────────

export interface CollectionAccessor {
  find(
    filter?: Record<string, unknown>,
    options?: { limit?: number; skip?: number; sort?: Record<string, 1 | -1> },
  ): Promise<mongoose.Document[]>

  findOne(filter: Record<string, unknown>): Promise<mongoose.Document | null>

  findById(id: string): Promise<mongoose.Document | null>

  create(data: Record<string, unknown>): Promise<mongoose.Document>

  updateById(id: string, data: Record<string, unknown>): Promise<mongoose.Document | null>

  deleteById(id: string): Promise<boolean>

  count(filter?: Record<string, unknown>): Promise<number>
}

// ── AppDB 接口 ────────────────────────────────────────────────────────────────

export type AppDB = Record<string, CollectionAccessor>

// ── OrmService ────────────────────────────────────────────────────────────────

export class OrmService {
  /**
   * 为指定应用构建 AppDB 访问层
   *
   * 版本号引用模型：从「最新已接受（done）对话」持有的 Schema 版本读取，
   * 确保运行时数据访问使用的是已验收的表结构，而非进行中的草稿版本。
   */
  static async buildAppDB(appId: string): Promise<AppDB> {
    const versions = await dialogueService.getLatestAcceptedVersions(appId)
    const schema = await SchemaService.getByVersion(appId, versions.schemaVersion)
    const collections = schema?.collections ?? []
    const db: AppDB = {}

    for (const collection of collections) {
      db[collection.name] = OrmService.buildAccessor(appId, collection.name, collection.fields)
    }

    return db
  }

  /**
   * 为单个 Collection 构建 CollectionAccessor
   */
  static buildAccessor(
    appId: string,
    collectionName: string,
    fields: { name: string; type: string; required: boolean; defaultValue?: unknown; refCollection?: string; enumValues?: string[] }[],
  ): CollectionAccessor {
    const getModel = () => getDynamicModel(appId, collectionName, fields as Parameters<typeof getDynamicModel>[2])

    return {
      async find(filter = {}, options = {}) {
        const model = getModel()
        let query = model.find(filter)
        if (options.sort) query = query.sort(options.sort)
        if (options.skip) query = query.skip(options.skip)
        if (options.limit) query = query.limit(options.limit)
        return query.exec()
      },

      async findOne(filter) {
        const model = getModel()
        return model.findOne(filter).exec()
      },

      async findById(id) {
        const model = getModel()
        if (!mongoose.Types.ObjectId.isValid(id)) return null
        return model.findById(id).exec()
      },

      async create(data) {
        const model = getModel()
        return model.create(data)
      },

      async updateById(id, data) {
        const model = getModel()
        if (!mongoose.Types.ObjectId.isValid(id)) return null
        return model.findByIdAndUpdate(id, { $set: data }, { new: true }).exec()
      },

      async deleteById(id) {
        const model = getModel()
        if (!mongoose.Types.ObjectId.isValid(id)) return false
        const result = await model.findByIdAndDelete(id).exec()
        return result !== null
      },

      async count(filter = {}) {
        const model = getModel()
        return model.countDocuments(filter).exec()
      },
    }
  }
}
