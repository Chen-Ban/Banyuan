/**
 * 相地 · Composition 种子数据验证脚本
 *
 * 功能：
 *   1. 读取 seeds/composition/ 目录下的所有 JSON 文件
 *   2. 验证每个文件符合 SeedFile 接口格式
 *   3. 验证 content 字段中嵌入的节点树示例符合 AISchema 规范
 *   4. 输出校验报告
 *
 * 用途：
 *   - 冷启动阶段：验证手工编写的种子数据格式正确性
 *   - CI 阶段：确保新增/修改的种子数据不破坏格式约定
 *   - 未来可扩展为调用 LLM 自动生成种子数据
 *
 * 运行方式：
 *   pnpm validate-seeds
 *   # 或直接
 *   npx tsx scripts/generate-composition-seeds.ts
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { z } from "zod";

// ─── 导入 AISchema 中的类型定义用于校验 ────────────────────────────────────────

import {
  AINodeSchema,
  AIGroupNodeSchema,
} from "../src/schema/AISchema.js";

// ─── SeedFile 格式 Schema ───────────────────────────────────────────────────────

const SeedFileSchema = z.object({
  id: z.string().startsWith("composition-"),
  content: z.string().min(100), // content 应足够详细
  source: z.literal("composition"),
  metadata: z.object({
    category: z.literal("composition"),
    pattern: z.string().min(1),
    description: z.string().min(10),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
  }),
});

// ─── 从 content 中提取 JSON 代码块 ──────────────────────────────────────────────

function extractJsonFromContent(content: string): object | null {
  const jsonBlockRegex = /```json\n([\s\S]*?)\n```/;
  const match = content.match(jsonBlockRegex);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// ─── 主逻辑 ─────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEEDS_DIR = resolve(
  __dirname,
  "../src/knowledge/seeds/composition"
);

interface ValidationResult {
  file: string;
  status: "pass" | "fail";
  errors: string[];
}

function validateSeedFile(filePath: string): ValidationResult {
  const fileName = filePath.split("/").pop() ?? filePath;
  const errors: string[] = [];

  // 1. 读取并解析 JSON
  let rawData: unknown;
  try {
    const content = readFileSync(filePath, "utf-8");
    rawData = JSON.parse(content);
  } catch (e) {
    return {
      file: fileName,
      status: "fail",
      errors: [`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  // 2. 验证 SeedFile 格式
  const seedResult = SeedFileSchema.safeParse(rawData);
  if (!seedResult.success) {
    for (const issue of seedResult.error.issues) {
      errors.push(`SeedFile 格式错误 [${issue.path.join(".")}]: ${issue.message}`);
    }
    return { file: fileName, status: "fail", errors };
  }

  const seed = seedResult.data;

  // 3. 提取并验证节点树 JSON
  const nodeTree = extractJsonFromContent(seed.content);
  if (!nodeTree) {
    errors.push("content 中未找到有效的 JSON 代码块（```json ... ```）");
    return { file: fileName, status: "fail", errors };
  }

  // 4. 尝试用 AINodeSchema 或 AIGroupNodeSchema 校验
  const nodeResult = AINodeSchema.safeParse(nodeTree);
  if (!nodeResult.success) {
    // 尝试 group schema（递归结构）
    const groupResult = AIGroupNodeSchema.safeParse(nodeTree);
    if (!groupResult.success) {
      for (const issue of nodeResult.error.issues.slice(0, 5)) {
        errors.push(
          `AISchema 校验错误 [${issue.path.join(".")}]: ${issue.message}`
        );
      }
      if (nodeResult.error.issues.length > 5) {
        errors.push(`... 还有 ${nodeResult.error.issues.length - 5} 个错误`);
      }
    }
  }

  return {
    file: fileName,
    status: errors.length === 0 ? "pass" : "fail",
    errors,
  };
}

// ─── 执行 ───────────────────────────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║     相地 · Composition 种子数据验证                         ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log();
console.log(`📂 扫描目录: ${SEEDS_DIR}`);
console.log();

const files = readdirSync(SEEDS_DIR).filter(
  (f) => f.endsWith(".json")
);

if (files.length === 0) {
  console.log("⚠️  未找到任何 JSON 种子文件");
  process.exit(1);
}

console.log(`📋 找到 ${files.length} 个种子文件\n`);

const results: ValidationResult[] = [];

for (const file of files) {
  const filePath = join(SEEDS_DIR, file);
  const result = validateSeedFile(filePath);
  results.push(result);

  const icon = result.status === "pass" ? "✅" : "❌";
  console.log(`${icon} ${result.file}`);
  if (result.errors.length > 0) {
    for (const err of result.errors) {
      console.log(`   └─ ${err}`);
    }
  }
}

// ─── 汇总 ───────────────────────────────────────────────────────────────────────

console.log();
console.log("─".repeat(60));

const passed = results.filter((r) => r.status === "pass").length;
const failed = results.filter((r) => r.status === "fail").length;

console.log(`\n📊 结果: ${passed} 通过, ${failed} 失败, 共 ${results.length} 个文件`);

if (failed > 0) {
  console.log("\n⚠️  存在格式错误，请修复后重新运行验证");
  process.exit(1);
} else {
  console.log("\n🎉 所有种子文件格式验证通过！");
  process.exit(0);
}
