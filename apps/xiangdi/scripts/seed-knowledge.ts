#!/usr/bin/env tsx
/**
 * 相地 · 知识种子写入脚本
 *
 * 将 seeds 目录中的 JSON 文件写入 LanceDB，支持按层级选择性写入。
 *
 * 用法：
 *   tsx scripts/seed-knowledge.ts --layer all       # 写入所有层级
 *   tsx scripts/seed-knowledge.ts --layer schema    # 仅写入 schema 层
 *   tsx scripts/seed-knowledge.ts --layer composition # 仅写入 composition 层
 *   tsx scripts/seed-knowledge.ts --layer theme     # 仅写入 theme 层
 *
 * 幂等执行：先按 id 删除旧条目，再写入新条目。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { LanceDBKnowledgeStore, seedsToEntries } from "@banyuan/agent";
import type { SeedFile, SeedCategory } from "@banyuan/agent";
import { version as canvasVersion } from "@banyuan/canvas";

// ─── 配置 ──────────────────────────────────────────────────────────────────────

const VALID_LAYERS: ReadonlyArray<SeedCategory | "all"> = [
  "schema",
  "composition",
  "theme",
  "all",
];

/**
 * seeds 目录路径（相对于 monorepo 中 XiangDi 包的位置）
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEEDS_BASE_DIR = path.resolve(
  __dirname,
  "../../packages/XiangDi/src/knowledge/seeds"
);

// ─── 工具函数 ──────────────────────────────────────────────────────────────────

function parseArgs(): SeedCategory | "all" {
  const args = process.argv.slice(2);
  const layerIdx = args.indexOf("--layer");

  if (layerIdx === -1 || layerIdx + 1 >= args.length) {
    console.error("❌ 缺少 --layer 参数");
    console.error(`   用法: tsx scripts/seed-knowledge.ts --layer <${VALID_LAYERS.join("|")}>`);
    process.exit(1);
  }

  const layer = args[layerIdx + 1] as SeedCategory | "all";
  if (!VALID_LAYERS.includes(layer)) {
    console.error(`❌ 无效的 layer: "${layer}"`);
    console.error(`   可选值: ${VALID_LAYERS.join(", ")}`);
    process.exit(1);
  }

  return layer;
}

/**
 * 从指定目录读取所有 JSON 种子文件
 */
function loadSeedFiles(category: SeedCategory): SeedFile[] {
  const dir = path.join(SEEDS_BASE_DIR, category);

  if (!fs.existsSync(dir)) {
    console.warn(`⚠️  目录不存在，跳过: ${dir}`);
    return [];
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const seeds: SeedFile[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as SeedFile;

    // 基本校验
    if (!parsed.id || !parsed.content || !parsed.source || !parsed.metadata?.category) {
      console.warn(`⚠️  跳过格式不合法的文件: ${file}`);
      continue;
    }

    seeds.push(parsed);
  }

  return seeds;
}

/**
 * 对指定层级执行幂等写入：先删除旧条目，再写入新条目
 */
async function seedLayer(
  store: LanceDBKnowledgeStore,
  category: SeedCategory
): Promise<number> {
  const seeds = loadSeedFiles(category);

  if (seeds.length === 0) {
    console.log(`  ⏭  ${category}: 无种子文件，跳过`);
    return 0;
  }

  // 幂等：先删除旧条目
  const ids = seeds.map((s) => s.id);
  await store.remove(ids);

  // 写入新条目
  const entries = seedsToEntries(seeds);
  await store.add(entries);

  console.log(`  ✅ ${category}: 写入 ${seeds.length} 条`);
  return seeds.length;
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const layer = parseArgs();
  const tableName = `knowledge_v${canvasVersion}`;

  console.log(`\n🌱 相地知识种子写入`);
  console.log(`   表名: ${tableName}`);
  console.log(`   层级: ${layer}`);
  console.log(`   种子目录: ${SEEDS_BASE_DIR}\n`);

  const store = new LanceDBKnowledgeStore({ tableName });

  const categories: SeedCategory[] =
    layer === "all" ? ["schema", "composition", "theme"] : [layer];

  let total = 0;
  for (const cat of categories) {
    total += await seedLayer(store, cat);
  }

  console.log(`\n🎉 完成！共写入 ${total} 条知识条目`);

  // 验证总数
  const size = await store.size();
  console.log(`   当前知识库总条目数: ${size}\n`);
}

main().catch((err: unknown) => {
  console.error("❌ 执行失败:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
