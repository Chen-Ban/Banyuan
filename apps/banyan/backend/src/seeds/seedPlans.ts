/**
 * Seed — 初始化内置套餐
 *
 * 幂等执行：按 planId upsert，已存在时更新 permissions/monthlyCredits 等可变字段，
 * 确保种子更新后重新 seed 能同步到已有文档。
 */

import { Plan } from '../models/Plan.js'

const BUILTIN_PLANS = [
  {
    planId: 'plan_free',
    name: '免费版',
    monthlyCredits: 0,
    priceInCents: 0,
    permissions: ['app:create', 'app:edit', 'ai:chat', 'data:browse', 'material:use'],
    active: true,
  },
  {
    planId: 'plan_pro',
    name: '专业版',
    monthlyCredits: 50_000,
    priceInCents: 9900, // ¥99
    permissions: [
      'app:create',
      'app:edit',
      'ai:chat',
      'deploy:publish',
      'schema:manage',
      'data:browse',
      'material:use',
    ],
    active: true,
  },
]

export async function seedPlans(): Promise<number> {
  let count = 0
  for (const plan of BUILTIN_PLANS) {
    await Plan.findOneAndUpdate(
      { planId: plan.planId },
      {
        $set: {
          name: plan.name,
          monthlyCredits: plan.monthlyCredits,
          priceInCents: plan.priceInCents,
          permissions: plan.permissions,
          active: plan.active,
        },
        $setOnInsert: { planId: plan.planId },
      },
      { upsert: true },
    )
    count++
  }
  return count
}
