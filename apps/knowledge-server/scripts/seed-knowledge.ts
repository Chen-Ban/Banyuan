#!/usr/bin/env tsx
/**
 * 知识种子写入脚本
 *
 * 将 seeds 目录中的 JSON 文件通过 HTTP API 写入 knowledge-server。
 * 知识服务负责向量化和 LanceDB 持久化。
 *
 * 用法：
 *   tsx scripts/seed-knowledge.ts --layer all         # 写入所有层级
 *   tsx scripts/seed-knowledge.ts --layer primitive   # 仅写入 primitive 层（原子能力）
 *   tsx scripts/seed-knowledge.ts --layer composition # 仅写入 composition 层（组合模式）
 *   tsx scripts/seed-knowledge.ts --layer convention  # 仅写入 convention 层（惯例约定）
 *
 * 前置条件：knowledge-server 需先启动（默认 http://localhost:3003）
 *
 * 幂等执行：先按 id 删除旧条目，再写入新条目。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'http'

// ─── 配置 ──────────────────────────────────────────────────────────────────────

type SeedCategory = 'primitive' | 'composition' | 'convention'

const VALID_LAYERS: ReadonlyArray<SeedCategory | 'all'> = ['primitive', 'composition', 'convention', 'all']

const KNOWLEDGE_BASE_URL = process.env.KNOWLEDGE_URL ?? 'http://localhost:3003'

/**
 * seeds 目录路径（与本脚本同处 knowledge-server 包内）
 *
 * 知识归属于 knowledge-server（系统级公共知识），因此种子与写入脚本就近放置。
 * 目录结构按 C7 三层 × 领域组织：
 *   seeds/primitive/{ui,flow,data}/*.json
 *   seeds/composition/{ui,bindflow,fullstack}/*.json
 *   seeds/convention/*.json
 */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SEEDS_BASE_DIR = path.resolve(__dirname, '../seeds')

// ─── 类型 ──────────────────────────────────────────────────────────────────────

interface SeedFile {
  id: string
  content: string
  source: string
  metadata: { category: string; [key: string]: unknown }
}

interface KnowledgeEntry {
  id: string
  content: string
  source: string
  metadata?: Record<string, unknown>
}

// ─── HTTP 工具 ──────────────────────────────────────────────────────────────────

function httpPost(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, KNOWLEDGE_BASE_URL)
    const bodyStr = JSON.stringify(body)

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 3003,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        Accept: 'application/json',
      },
      timeout: 60000, // 种子写入可能耗时（需要向量化）
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString()
      })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 500, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode ?? 500, data })
        }
      })
      res.on('error', reject)
    })

    req.on('error', (err) => {
      reject(new Error(`无法连接到知识服务 (${KNOWLEDGE_BASE_URL}): ${err.message}`))
    })

    req.write(bodyStr)
    req.end()
  })
}

function httpDelete(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, KNOWLEDGE_BASE_URL)
    const bodyStr = JSON.stringify(body)

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port || 3003,
      path: url.pathname,
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        Accept: 'application/json',
      },
      timeout: 30000,
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString()
      })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 500, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode ?? 500, data })
        }
      })
      res.on('error', reject)
    })

    req.on('error', (err) => {
      reject(new Error(`无法连接到知识服务 (${KNOWLEDGE_BASE_URL}): ${err.message}`))
    })

    req.write(bodyStr)
    req.end()
  })
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function parseArgs(): SeedCategory | 'all' {
  const args = process.argv.slice(2)
  const layerIdx = args.indexOf('--layer')

  if (layerIdx === -1 || layerIdx + 1 >= args.length) {
    console.error('❌ 缺少 --layer 参数')
    console.error(`   用法: tsx scripts/seed-knowledge.ts --layer <${VALID_LAYERS.join('|')}>`)
    process.exit(1)
  }

  const layer = args[layerIdx + 1] as SeedCategory | 'all'
  if (!VALID_LAYERS.includes(layer)) {
    console.error(`❌ 无效的 layer: "${layer}"`)
    console.error(`   可选值: ${VALID_LAYERS.join(', ')}`)
    process.exit(1)
  }

  return layer
}

/**
 * 递归收集目录下所有 .json 文件路径（支持 primitive/ui、composition/bindflow 等子目录）
 */
function collectJsonFiles(dir: string): string[] {
  const result: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectJsonFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      result.push(full)
    }
  }
  return result
}

/**
 * 从指定层级目录（含子目录）递归读取所有 JSON 种子文件
 */
function loadSeedFiles(category: SeedCategory): SeedFile[] {
  const dir = path.join(SEEDS_BASE_DIR, category)

  if (!fs.existsSync(dir)) {
    console.warn(`⚠️  目录不存在，跳过: ${dir}`)
    return []
  }

  const seeds: SeedFile[] = []

  for (const filePath of collectJsonFiles(dir)) {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as SeedFile

    // 基本校验
    if (!parsed.id || !parsed.content || !parsed.source || !parsed.metadata?.category) {
      console.warn(`⚠️  跳过格式不合法的文件: ${path.relative(dir, filePath)}`)
      continue
    }

    // 一致性校验：metadata.category 应与所在层级一致
    if (parsed.metadata.category !== category) {
      console.warn(
        `⚠️  category 不一致（文件声明 "${parsed.metadata.category}"，所在目录 "${category}"）: ${parsed.id}`,
      )
    }

    seeds.push(parsed)
  }

  return seeds
}

/**
 * 将 SeedFile 转为 KnowledgeEntry
 */
function seedsToEntries(seeds: SeedFile[]): KnowledgeEntry[] {
  return seeds.map((s) => ({
    id: s.id,
    content: s.content,
    source: s.source,
    metadata: s.metadata,
  }))
}

/**
 * 对指定层级执行幂等写入：先删除旧条目，再通过 HTTP API 写入
 */
async function seedLayer(category: SeedCategory): Promise<number> {
  const seeds = loadSeedFiles(category)

  if (seeds.length === 0) {
    console.log(`  ⏭  ${category}: 无种子文件，跳过`)
    return 0
  }

  // 幂等：先删除旧条目
  const ids = seeds.map((s) => s.id)
  try {
    await httpDelete('/knowledge/entries', { ids })
  } catch {
    // 首次运行时可能无数据，忽略错误
  }

  // 写入新条目
  const entries = seedsToEntries(seeds)
  const result = await httpPost('/knowledge/upsert', { entries })

  if (result.status !== 200) {
    console.error(`  ❌ ${category}: 写入失败`, result.data)
    return 0
  }

  console.log(`  ✅ ${category}: 写入 ${seeds.length} 条`)
  return seeds.length
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const layer = parseArgs()

  console.log(`\n🌱 知识种子写入（通过 knowledge-server）`)
  console.log(`   知识服务: ${KNOWLEDGE_BASE_URL}`)
  console.log(`   层级: ${layer}`)
  console.log(`   种子目录: ${SEEDS_BASE_DIR}\n`)

  // 验证知识服务可用
  try {
    const statsResult = await httpPost('/knowledge/search', { query: 'test', topK: 1 })
    if (statsResult.status >= 500) {
      throw new Error(`知识服务返回 ${statsResult.status}`)
    }
  } catch (err) {
    console.error(`❌ 无法连接到知识服务 (${KNOWLEDGE_BASE_URL})`)
    console.error(`   请确保 knowledge-server 已启动: cd apps/knowledge-server && pnpm dev`)
    console.error(`   错误: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  const categories: SeedCategory[] = layer === 'all' ? ['primitive', 'composition', 'convention'] : [layer]

  let total = 0
  for (const cat of categories) {
    total += await seedLayer(cat)
  }

  console.log(`\n🎉 完成！共写入 ${total} 条知识条目\n`)
}

main().catch((err: unknown) => {
  console.error('❌ 执行失败:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
