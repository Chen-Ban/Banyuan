/**
 * 数据迁移脚本：为所有现有 Application 写入租户信息
 *
 * 执行逻辑：
 *   1. 创建一个模拟租户（tenant_default）
 *   2. 创建一个模拟用户（user_default），角色为 owner
 *   3. 将所有 tenantId 为空的 Application 文档更新为该租户和用户
 *
 * 运行方式：
 *   pnpm run migrations:tenant
 *
 * 环境变量：
 *   MONGODB_URI — MongoDB 连接字符串（默认 mongodb://localhost:27017/banyan）
 */

import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/banyan'

// 模拟租户和用户的固定 ID
const DEFAULT_TENANT_ID = 'tenant_default'
const DEFAULT_USER_ID = 'user_default'

async function main() {
  console.log(`[migrate] 连接数据库: ${MONGODB_URI}`)
  await mongoose.connect(MONGODB_URI)
  console.log('[migrate] 数据库连接成功')

  const db = mongoose.connection.db!

  // ─── Step 1：确保默认租户存在 ─────────────────────────────────────────────────
  const tenantsCol = db.collection('tenants')
  const existingTenant = await tenantsCol.findOne({ tenantId: DEFAULT_TENANT_ID })
  if (!existingTenant) {
    await tenantsCol.insertOne({
      tenantId: DEFAULT_TENANT_ID,
      name: '默认租户',
      plan: 'free',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    console.log('[migrate] 创建默认租户: tenant_default')
  } else {
    console.log('[migrate] 默认租户已存在，跳过')
  }

  // ─── Step 2：确保默认用户存在 ─────────────────────────────────────────────────
  const usersCol = db.collection('users')
  const existingUser = await usersCol.findOne({ userId: DEFAULT_USER_ID })
  if (!existingUser) {
    await usersCol.insertOne({
      userId: DEFAULT_USER_ID,
      tenantId: DEFAULT_TENANT_ID,
      username: '默认用户',
      email: 'default@banyuan.app',
      role: 'owner',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    console.log('[migrate] 创建默认用户: user_default')
  } else {
    console.log('[migrate] 默认用户已存在，跳过')
  }

  // ─── Step 3：更新所有缺少 tenantId 的 Application ────────────────────────────
  const applicationsCol = db.collection('applications')
  const result = await applicationsCol.updateMany(
    { $or: [{ tenantId: '' }, { tenantId: { $exists: false } }, { tenantId: null }] },
    {
      $set: {
        tenantId: DEFAULT_TENANT_ID,
        createdBy: DEFAULT_USER_ID,
        updatedAt: new Date(),
      },
    },
  )
  console.log(`[migrate] 更新 Application 文档: ${result.modifiedCount} 条`)

  // ─── Step 4：同步更新 Conversation 文档（如果有 appId 关联） ──────────────────
  // Conversation 不需要 tenantId，因为它通过 appId 间接关联到租户

  // ─── 完成 ─────────────────────────────────────────────────────────────────────
  console.log('[migrate] 迁移完成')
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('[migrate] 迁移失败:', err)
  process.exit(1)
})
