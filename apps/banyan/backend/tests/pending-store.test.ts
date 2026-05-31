/**
 * PendingStore 单元测试
 *
 * 运行方式：pnpm tsx apps/banyan/backend/tests/pending-store.test.ts
 *
 * 测试内容：
 *   1. create / get / getConfirmable 基本 CRUD
 *   2. setFinalAppJSON / setAssistantContent / setSchemaUpdates / setMemoryUpdates / setRoundSummary
 *   3. markDone 更新状态
 *   4. delete 清除数据
 *   5. 同一 appId 只允许一个 pending（覆盖语义）
 *   6. updateStatus 状态流转
 *   7. 磁盘落盘与删除
 *   8. 操作不存在的 appId 不抛错
 */

import { promises as fs } from 'fs'
import path from 'path'
import pendingStore from '../src/services/PendingStore.js'

// ─── 测试工具 ─────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    failures.push(message)
    console.error(`  ✗ ${message}`)
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const eq = JSON.stringify(actual) === JSON.stringify(expected)
  if (eq) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    failures.push(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    console.error(`  ✗ ${message}`)
    console.error(`    expected: ${JSON.stringify(expected)}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
  }
}

// ─── 测试用例 ─────────────────────────────────────────────────────────────────

async function testBasicCRUD(): Promise<void> {
  console.log('\n== 测试 1: 基本 CRUD ==')

  const appId = 'test-app-001'
  const dialogueId = '6650aabbccdd001122334455'
  const threadId = `${appId}:${dialogueId}`

  const data = pendingStore.create({
    appId,
    dialogueId,
    threadId,
    type: 'task',
    userMessage: { prompt: '帮我创建一个登录页', images: [] },
  })

  assert(data !== null, 'create 返回非 null')
  assertEqual(data.appId, appId, 'appId 正确')
  assertEqual(data.dialogueId, dialogueId, 'dialogueId 正确')
  assertEqual(data.type, 'task', 'type 正确')
  assertEqual(data.status, 'streaming', '初始状态为 streaming')
  assertEqual(data.finalAppJSON, null, 'finalAppJSON 初始为 null')
  assertEqual(data.assistantContent, [], 'assistantContent 初始为空数组')

  const fetched = pendingStore.get(appId)
  assert(fetched !== null, 'get 返回非 null')
  assertEqual(fetched?.dialogueId, dialogueId, 'get 返回正确的 dialogueId')

  const confirmable = pendingStore.getConfirmable(appId)
  assert(confirmable === null, 'streaming 状态时 getConfirmable 返回 null')

  assert(pendingStore.has(appId), 'has 返回 true')
  assert(!pendingStore.has('non-existent'), 'has 对不存在的 key 返回 false')

  await pendingStore.delete(appId)
}

async function testSetters(): Promise<void> {
  console.log('\n== 测试 2: Setter 方法 ==')

  const appId = 'test-app-002'

  pendingStore.create({
    appId,
    dialogueId: 'dial-002',
    threadId: `${appId}:dial-002`,
    type: 'task',
    userMessage: { prompt: 'test', images: [] },
  })

  pendingStore.setFinalAppJSON(appId, '{"pages":[]}')
  assertEqual(pendingStore.get(appId)?.finalAppJSON, '{"pages":[]}', 'setFinalAppJSON 生效')

  const content = [{ type: 'text' as const, text: '已创建登录页' }]
  pendingStore.setAssistantContent(appId, content)
  assertEqual(pendingStore.get(appId)?.assistantContent, content, 'setAssistantContent 生效')

  const schema = [{ name: 'users', displayName: '用户', fields: [] }]
  pendingStore.setSchemaUpdates(appId, schema as never)
  assertEqual(pendingStore.get(appId)?.schemaUpdates, schema as never, 'setSchemaUpdates 生效')

  const memory = { key: 'pref', value: 'dark-mode' }
  pendingStore.setMemoryUpdates(appId, memory as never)
  assertEqual(pendingStore.get(appId)?.memoryUpdates, memory as never, 'setMemoryUpdates 生效')

  pendingStore.setRoundSummary(appId, '用户要求创建登录页，已完成')
  assertEqual(pendingStore.get(appId)?.roundSummary, '用户要求创建登录页，已完成', 'setRoundSummary 生效')

  pendingStore.addPlanningEntry(appId, {
    agent: 'pm',
    output: { tasks: [] },
    reasoning: 'PM 分析完成',
    tokenUsage: { input: 100, output: 50 },
    durationMs: 1200,
  })
  assertEqual(pendingStore.get(appId)?.planningEntries.length, 1, 'addPlanningEntry 生效')

  await pendingStore.delete(appId)
}

async function testMarkDone(): Promise<void> {
  console.log('\n== 测试 3: markDone + getConfirmable ==')

  const appId = 'test-app-003'

  pendingStore.create({
    appId,
    dialogueId: 'dial-003',
    threadId: `${appId}:dial-003`,
    type: 'task',
    userMessage: { prompt: 'test', images: [] },
  })

  assertEqual(pendingStore.get(appId)?.status, 'streaming', '初始 status 为 streaming')
  assert(pendingStore.getConfirmable(appId) === null, 'streaming 时 getConfirmable 为 null')

  await pendingStore.markDone(appId)
  assertEqual(pendingStore.get(appId)?.status, 'done', 'markDone 后 status 为 done')
  assert(pendingStore.getConfirmable(appId) !== null, 'done 时 getConfirmable 返回数据')

  await pendingStore.delete(appId)
}

async function testDelete(): Promise<void> {
  console.log('\n== 测试 4: delete ==')

  const appId = 'test-app-004'

  pendingStore.create({
    appId,
    dialogueId: 'dial-004',
    threadId: `${appId}:dial-004`,
    type: 'task',
    userMessage: { prompt: 'test', images: [] },
  })

  assert(pendingStore.has(appId), 'create 后 has 为 true')
  await pendingStore.delete(appId)
  assert(!pendingStore.has(appId), 'delete 后 has 为 false')
  assert(pendingStore.get(appId) === null, 'delete 后 get 返回 null')
}

async function testOverwrite(): Promise<void> {
  console.log('\n== 测试 5: 同一 appId 覆盖语义 ==')

  const appId = 'test-app-005'

  pendingStore.create({
    appId,
    dialogueId: 'dial-005-old',
    threadId: `${appId}:dial-005-old`,
    type: 'task',
    userMessage: { prompt: 'old', images: [] },
  })

  pendingStore.create({
    appId,
    dialogueId: 'dial-005-new',
    threadId: `${appId}:dial-005-new`,
    type: 'task',
    userMessage: { prompt: 'new', images: [] },
  })

  assertEqual(pendingStore.get(appId)?.dialogueId, 'dial-005-new', '新 create 覆盖旧数据')
  assertEqual(pendingStore.get(appId)?.userMessage.prompt, 'new', '新 prompt 生效')

  await pendingStore.delete(appId)
}

async function testUpdateStatus(): Promise<void> {
  console.log('\n== 测试 6: updateStatus ==')

  const appId = 'test-app-006'

  pendingStore.create({
    appId,
    dialogueId: 'dial-006',
    threadId: `${appId}:dial-006`,
    type: 'task',
    userMessage: { prompt: 'test', images: [] },
  })

  pendingStore.updateStatus(appId, 'interrupted')
  assertEqual(pendingStore.get(appId)?.status, 'interrupted', 'updateStatus 到 interrupted')

  pendingStore.updateStatus(appId, 'failed')
  assertEqual(pendingStore.get(appId)?.status, 'failed', 'updateStatus 到 failed')

  assert(pendingStore.getConfirmable(appId) === null, 'failed 状态 getConfirmable 为 null')

  await pendingStore.delete(appId)
}

async function testDiskPersistence(): Promise<void> {
  console.log('\n== 测试 7: 磁盘落盘 ==')

  const appId = 'test-app-007'
  const dialogueId = 'dial-007'

  pendingStore.create({
    appId,
    dialogueId,
    threadId: `${appId}:${dialogueId}`,
    type: 'task',
    userMessage: { prompt: '磁盘测试', images: [] },
  })
  pendingStore.setFinalAppJSON(appId, '{"test":true}')
  await pendingStore.markDone(appId)

  // 等待异步落盘
  await new Promise((r) => setTimeout(r, 100))

  const filePath = path.resolve(process.cwd(), 'data', 'pending', appId, `${dialogueId}.json`)
  let fileExists = false
  try {
    await fs.access(filePath)
    fileExists = true
  } catch {
    fileExists = false
  }
  assert(fileExists, '落盘文件存在')

  if (fileExists) {
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(content)
    assertEqual(parsed.appId, appId, '文件内 appId 正确')
    assertEqual(parsed.status, 'done', '文件内 status 为 done')
    assertEqual(parsed.finalAppJSON, '{"test":true}', '文件内 finalAppJSON 正确')
  }

  await pendingStore.delete(appId)

  let fileExistsAfterDelete = false
  try {
    await fs.access(filePath)
    fileExistsAfterDelete = true
  } catch {
    fileExistsAfterDelete = false
  }
  assert(!fileExistsAfterDelete, 'delete 后磁盘文件已删除')
}

async function testNonExistentAppId(): Promise<void> {
  console.log('\n== 测试 8: 操作不存在的 appId ==')

  try {
    pendingStore.setFinalAppJSON('ghost-app', '{}')
    pendingStore.setAssistantContent('ghost-app', [])
    pendingStore.setSchemaUpdates('ghost-app', [])
    pendingStore.setMemoryUpdates('ghost-app', null as never)
    pendingStore.setRoundSummary('ghost-app', 'x')
    pendingStore.addPlanningEntry('ghost-app', { agent: 'pm', output: null, tokenUsage: { input: 0, output: 0 }, durationMs: 0 })
    pendingStore.updateStatus('ghost-app', 'done')
    await pendingStore.markDone('ghost-app')
    await pendingStore.delete('ghost-app')
    passed++
    console.log('  ✓ 操作不存在的 appId 不抛错')
  } catch (err) {
    failed++
    failures.push(`操作不存在的 appId 抛错: ${(err as Error).message}`)
    console.error(`  ✗ 操作不存在的 appId 抛错: ${(err as Error).message}`)
  }
}

// ─── 运行 ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════')
  console.log(' PendingStore 单元测试')
  console.log('═══════════════════════════════════════════')

  await testBasicCRUD()
  await testSetters()
  await testMarkDone()
  await testDelete()
  await testOverwrite()
  await testUpdateStatus()
  await testDiskPersistence()
  await testNonExistentAppId()

  console.log('\n═══════════════════════════════════════════')
  console.log(` 结果: ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log(' 失败项:')
    failures.forEach((f) => console.log(`   - ${f}`))
  }
  console.log('═══════════════════════════════════════════')

  pendingStore.destroy()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('测试运行失败:', err)
  process.exit(1)
})
