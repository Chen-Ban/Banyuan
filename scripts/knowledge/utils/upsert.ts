/**
 * 知识种子写入工具
 *
 * 共享的 knowledge-server HTTP 写入逻辑，所有种子生成脚本复用。
 */

// ─── 配置 ─────────────────────────────────────────────────────────────────────

const KNOWLEDGE_URL = process.env.KNOWLEDGE_URL || "http://localhost:3003";
const KNOWLEDGE_TOKEN = process.env.KNOWLEDGE_INTERNAL_TOKEN || "";

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface SeedEntry {
  id: string;
  content: string;
  source: string;
  metadata: Record<string, unknown>;
}

// ─── 公共 API ─────────────────────────────────────────────────────────────────

/**
 * 将种子写入 knowledge-server 向量库。
 *
 * 策略：先探测 /health 确认服务可达，可达时批量 POST /knowledge/upsert，
 * 不可达时优雅降级（仅打印警告，不阻断流程）。
 */
export async function upsertToKnowledgeServer(entries: SeedEntry[]): Promise<void> {
  console.log("");
  console.log(`📡 尝试写入 knowledge-server (${KNOWLEDGE_URL})...`);

  const reachable = await checkHealth();
  if (!reachable) {
    console.log(`   ⚠️  knowledge-server 不可达，跳过写入。种子文件已生成到本地，可后续手动写入。`);
    return;
  }

  try {
    const response = await fetch(`${KNOWLEDGE_URL}/knowledge/upsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(KNOWLEDGE_TOKEN ? { "X-Internal-Token": KNOWLEDGE_TOKEN } : {}),
      },
      body: JSON.stringify({ entries }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.log(`   ⚠️  upsert 失败 (HTTP ${response.status}): ${body}`);
      console.log(`   种子文件已生成到本地，可后续手动写入。`);
      return;
    }

    const result = (await response.json()) as { success: boolean; count?: number };
    if (result.success) {
      console.log(`   ✅ 成功写入 ${result.count ?? entries.length} 条知识`);
    } else {
      console.log(`   ⚠️  upsert 返回 success=false，种子文件已生成到本地。`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`   ⚠️  upsert 请求异常: ${message}`);
    console.log(`   种子文件已生成到本地，可后续手动写入。`);
  }
}

/**
 * 探测 knowledge-server 健康状态
 */
async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${KNOWLEDGE_URL}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
