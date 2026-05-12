import { connectDatabase, disconnectDatabase } from '../config/database'
import mongoose from 'mongoose'

/**
 * 迁移模板数据：将旧的 template（单个JSON字符串）迁移为 pages（JSON字符串数组）
 * 
 * 运行方式：tsx src/utils/migrateTemplates.ts
 */
async function migrateTemplates() {
  try {
    console.log('开始连接数据库...')
    await connectDatabase()
    console.log('✓ 数据库连接成功')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    const collection = db.collection('templates')

    // 查找所有还有旧 template 字段且没有 pages 字段的文档
    const oldTemplates = await collection.find({
      template: { $exists: true },
      pages: { $exists: false },
    }).toArray()

    if (oldTemplates.length === 0) {
      console.log('没有需要迁移的模板数据。')
      await disconnectDatabase()
      process.exit(0)
      return
    }

    console.log(`找到 ${oldTemplates.length} 个需要迁移的模板...`)

    let migratedCount = 0
    for (const doc of oldTemplates) {
      const templateStr = doc.template as string

      // 将单个 template 字符串包装为 pages 数组
      const pages = templateStr ? [templateStr] : []

      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            pages,
            description: '',
            thumbnail: '',
            tags: [],
            version: 1,
            createdBy: '',
            updatedBy: '',
          },
          $unset: {
            template: 1, // 移除旧字段
          },
        }
      )

      migratedCount++
      console.log(`  ✓ 迁移模板: ${doc.name || doc.id} (${migratedCount}/${oldTemplates.length})`)
    }

    console.log(`\n✓ 迁移完成！共迁移 ${migratedCount} 个模板。`)

    await disconnectDatabase()
    process.exit(0)
  } catch (error) {
    console.error('迁移失败:', error)
    process.exit(1)
  }
}

migrateTemplates()
