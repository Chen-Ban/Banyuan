/**
 * cron — 定时任务调度
 *
 * 使用 node-cron 管理所有后台定时任务。
 * 通过 startCronJobs() / stopCronJobs() 控制生命周期。
 */

import cron from 'node-cron'
import { billingService } from '../services/BillingService.js'
import { logger } from '../utils/logger.js'

/** 所有已注册的 cron 任务 */
const tasks: cron.ScheduledTask[] = []

/**
 * 启动所有定时任务
 */
export function startCronJobs(): void {
  logger.info('Starting cron jobs...')

  // 每月 1 日 00:00 生成上月账单
  const monthlyBillTask = cron.schedule('0 0 1 * *', async () => {
    logger.info('Cron: Starting monthly bill generation')
    try {
      // 生成上个月的账单（yearMonth = 上个月）
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth()).padStart(2, '0') // getMonth() 返回 0-11，上个月
      // 如果当前是 1 月，上个月是去年 12 月
      const prevYearMonth = now.getMonth() === 0
        ? `${year - 1}-12`
        : `${year}-${month}`
      const count = await billingService.generateMonthlyBill(prevYearMonth)
      logger.info({ prevYearMonth, billCount: count }, 'Cron: Monthly bill generation completed')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error({ error: errorMsg }, 'Cron: Monthly bill generation failed')
    }
  })

  tasks.push(monthlyBillTask)
  logger.info(`Cron jobs started (${tasks.length} tasks)`)
}

/**
 * 停止所有定时任务
 */
export function stopCronJobs(): void {
  logger.info('Stopping cron jobs...')
  for (const task of tasks) {
    task.stop()
  }
  tasks.length = 0
  logger.info('All cron jobs stopped')
}
