/**
 * Phase 2 数据库迁移脚本：tenant -> team
 *
 * 执行：
 *   1. 删除所有旧 tenantId 相关索引
 *   2. 将所有集合中的 tenantId 字段重命名为 teamId
 *   3. 将 tenants 集合重命名为 teams
 *   4. 清理 users 残留
 *
 * 运行方式：
 *   npx tsx scripts/migrations/phase2-tenant-to-team.ts
 */

import mongoose from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/banyan'

async function main() {
  console.log('[phase2] Connecting:', MONGODB_URI)
  await mongoose.connect(MONGODB_URI)
  console.log('[phase2] Connected')

  const db = mongoose.connection.db!

  // Check if already migrated
  const teamsHasTeamId = await db.collection('teams').countDocuments({ teamId: { $exists: true } })
  const tenantsExists = (await db.collection('tenants').countDocuments({})) > 0
  if (teamsHasTeamId > 0 && !tenantsExists) {
    console.log('[phase2] Already migrated.')

    // Verify mode
    if (process.argv.includes('--verify')) {
      console.log('[phase2] Running verification...')
      const checks = [
        ['teams', 'teamId'],
        ['applications', 'teamId'],
        ['memberships', 'teamId'],
        ['deployments', 'teamId'],
        ['refreshtokens', 'teamId'],
      ]
      for (const [col, field] of checks) {
        const cnt = await db.collection(col).countDocuments({ [field]: { $exists: true } })
        console.log(`  ${col}: ${cnt} docs with ${field}`)
      }
      const bad = await db.collection('users').countDocuments({ tenantId: { $exists: true } })
      console.log(`  users with tenantId: ${bad} (should be 0)`)
    }

    await mongoose.disconnect()
    process.exit(0)
  }

  // Step 1: Drop all old/new tenantId/teamId indexes (will be rebuilt by syncIndexes)
  console.log('[phase2] Step 1: Dropping indexes...')
  const indexDrops: [string, string][] = [
    ['tenants', 'tenantId_1'],
    ['teams', 'teamId_1'],
    ['teams', 'tenantId_1'],
    ['applications', 'tenantId_1_createdBy_1'],
    ['applications', 'tenantId_1_appSlug_1'],
    ['applications', 'teamId_1_createdBy_1'],
    ['applications', 'teamId_1_appSlug_1'],
    ['memberships', 'userId_1_tenantId_1'],
    ['memberships', 'tenantId_1'],
    ['memberships', 'userId_1_teamId_1'],
    ['memberships', 'teamId_1'],
    ['deployments', 'tenantId_1_applicationId_1_createdAt_-1'],
    ['deployments', 'teamId_1_applicationId_1_createdAt_-1'],
    ['ecs_instances', 'tenantId_1'],
    ['ecs_instances', 'teamId_1'],
    ['bills', 'tenantId_1_yearMonth_1'],
    ['bills', 'teamId_1_yearMonth_1'],
    ['llm_call_records', 'tenantId_1_timestamp_-1'],
    ['llm_call_records', 'teamId_1_timestamp_-1'],
    ['notifications', 'tenantId_1_userId_1_createdAt_-1'],
    ['notifications', 'teamId_1_userId_1_createdAt_-1'],
    ['credit_usage', 'tenantId_1_yearMonth_1'],
    ['credit_usage', 'tenantId_1_applicationId_1_yearMonth_1'],
    ['credit_usage', 'teamId_1_yearMonth_1'],
    ['credit_usage', 'teamId_1_applicationId_1_yearMonth_1'],
  ]

  for (const [col, idx] of indexDrops) {
    try {
      await db.collection(col).dropIndex(idx)
      console.log(`[phase2]   Dropped: ${col}.${idx}`)
    } catch { /* skip */ }
  }
  console.log('[phase2] Step 1: Done')

  // Step 2: Rename tenantId -> teamId in all collections
  console.log('[phase2] Step 2: Renaming tenantId -> teamId...')
  const collections = [
    'tenants',
    'teams',
    'applications',
    'memberships',
    'deployments',
    'ecs_instances',
    'bills',
    'llm_call_records',
    'notifications',
    'payment_orders',
    'credit_usage',
    'refreshtokens',
  ]

  for (const colName of collections) {
    try {
      const result = await db.collection(colName).updateMany(
        { tenantId: { $exists: true } },
        { $rename: { tenantId: 'teamId' } },
      )
      if (result.modifiedCount > 0) {
        console.log(`[phase2]   ${colName}: ${result.modifiedCount} docs`)
      }
    } catch { /* collection may not exist */ }
  }
  console.log('[phase2] Step 2: Done')

  // Step 3: Rename tenants -> teams
  console.log('[phase2] Step 3: Renaming tenants -> teams...')
  const tenantsCount = await db.collection('tenants').countDocuments({})
  const teamsCount = await db.collection('teams').countDocuments({})

  if (tenantsCount > 0) {
    if (teamsCount === 0) {
      await db.collection('tenants').rename('teams')
      console.log('[phase2]   Renamed tenants -> teams')
    } else {
      // Both exist: drop empty teams first, then rename
      await db.collection('teams').drop()
      await db.collection('tenants').rename('teams')
      console.log('[phase2]   Dropped empty teams, renamed tenants -> teams')
    }
  } else {
    console.log('[phase2]   No tenants collection')
  }
  console.log('[phase2] Step 3: Done')

  // Step 4: Clean up tenantId in users
  console.log('[phase2] Step 4: Cleaning users...')
  try {
    const r = await db.collection('users').updateMany(
      { tenantId: { $exists: true } },
      { $unset: { tenantId: '' } },
    )
    if (r.modifiedCount > 0) console.log(`[phase2]   users: ${r.modifiedCount} docs`)
  } catch { /* skip */ }
  console.log('[phase2] Step 4: Done')

  console.log('[phase2] Migration complete!')
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('[phase2] Failed:', err)
  process.exit(1)
})
