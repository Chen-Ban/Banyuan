/**
 * 相地 · 内存态图知识库（InMemoryGraphStore）
 *
 * 基于 Map 结构实现的 GraphKnowledgeStore。
 * 生产环境可替换为基于 graphology 或 Neo4j 的实现。
 *
 * 特性：
 *   - 支持实体和关系的 CRUD
 *   - 支持子图检索（关键词匹配入口 + BFS 扩展）
 *   - 支持影响分析（正向/反向 BFS）
 *   - 支持邻居查询
 *
 * 使用示例：
 * ```ts
 * const graph = new InMemoryGraphStore();
 *
 * await graph.addEntities([
 *   { id: "page-home", type: "page", name: "HomePage" },
 *   { id: "comp-card", type: "component", name: "ProductCard" },
 * ]);
 *
 * await graph.addRelations([
 *   { id: "r1", sourceId: "page-home", targetId: "comp-card", type: "contains" },
 * ]);
 *
 * const impact = await graph.analyzeImpact(["comp-card"], { direction: "backward" });
 * // → { entities: [HomePage, ProductCard], relations: [...] }
 * ```
 */

import type {
  GraphKnowledgeStore,
  GraphEntity,
  GraphRelation,
  SubGraph,
  GraphQueryOptions,
  ImpactAnalysisOptions,
} from "./types.js";

// ─── InMemoryGraphStore ───────────────────────────────────────────────────────

export class InMemoryGraphStore implements GraphKnowledgeStore {
  private entities: Map<string, GraphEntity> = new Map();
  private relations: Map<string, GraphRelation> = new Map();

  // 邻接索引：entityId → 相关的 relationId[]
  private outEdges: Map<string, Set<string>> = new Map();
  private inEdges: Map<string, Set<string>> = new Map();

  // ── 写入操作 ──────────────────────────────────────────────────────────────

  async addEntities(entities: GraphEntity[]): Promise<void> {
    for (const entity of entities) {
      this.entities.set(entity.id, entity);
      // 确保邻接索引存在
      if (!this.outEdges.has(entity.id)) this.outEdges.set(entity.id, new Set());
      if (!this.inEdges.has(entity.id)) this.inEdges.set(entity.id, new Set());
    }
  }

  async addRelations(relations: GraphRelation[]): Promise<void> {
    for (const rel of relations) {
      this.relations.set(rel.id, rel);
      // 更新邻接索引
      if (!this.outEdges.has(rel.sourceId)) this.outEdges.set(rel.sourceId, new Set());
      if (!this.inEdges.has(rel.targetId)) this.inEdges.set(rel.targetId, new Set());
      this.outEdges.get(rel.sourceId)!.add(rel.id);
      this.inEdges.get(rel.targetId)!.add(rel.id);
    }
  }

  async removeEntities(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.entities.delete(id);

      // 删除所有相关的关系
      const outRels = this.outEdges.get(id) ?? new Set();
      const inRels = this.inEdges.get(id) ?? new Set();

      for (const relId of outRels) {
        const rel = this.relations.get(relId);
        if (rel) {
          this.inEdges.get(rel.targetId)?.delete(relId);
        }
        this.relations.delete(relId);
      }

      for (const relId of inRels) {
        const rel = this.relations.get(relId);
        if (rel) {
          this.outEdges.get(rel.sourceId)?.delete(relId);
        }
        this.relations.delete(relId);
      }

      this.outEdges.delete(id);
      this.inEdges.delete(id);
    }
  }

  // ── 子图检索 ──────────────────────────────────────────────────────────────

  async querySubGraph(
    query: string,
    options?: GraphQueryOptions
  ): Promise<SubGraph> {
    const maxHops = options?.maxHops ?? 2;
    const maxEntities = options?.maxEntities ?? 20;
    const relationTypes = options?.relationTypes;
    const entityTypes = options?.entityTypes;

    // Step 1: 找到入口实体（关键词匹配）
    const entryEntities = this.findEntitiesByKeywords(query, entityTypes);

    if (entryEntities.length === 0) {
      return { entities: [], relations: [] };
    }

    // Step 2: 从入口实体 BFS 扩展
    const visitedEntities = new Set<string>();
    const visitedRelations = new Set<string>();
    const queue: Array<{ entityId: string; depth: number }> = [];

    for (const entity of entryEntities.slice(0, 5)) {
      queue.push({ entityId: entity.id, depth: 0 });
      visitedEntities.add(entity.id);
    }

    while (queue.length > 0 && visitedEntities.size < maxEntities) {
      const item = queue.shift()!;
      if (item.depth >= maxHops) continue;

      // 扩展：出边 + 入边
      const outRels = this.outEdges.get(item.entityId) ?? new Set();
      const inRels = this.inEdges.get(item.entityId) ?? new Set();
      const allRels = [...outRels, ...inRels];

      for (const relId of allRels) {
        const rel = this.relations.get(relId);
        if (!rel) continue;

        // 关系类型过滤
        if (relationTypes && !relationTypes.includes(rel.type)) continue;

        visitedRelations.add(relId);

        const neighborId = rel.sourceId === item.entityId ? rel.targetId : rel.sourceId;
        if (!visitedEntities.has(neighborId)) {
          const neighbor = this.entities.get(neighborId);
          if (!neighbor) continue;

          // 实体类型过滤
          if (entityTypes && !entityTypes.includes(neighbor.type)) continue;

          visitedEntities.add(neighborId);
          queue.push({ entityId: neighborId, depth: item.depth + 1 });

          if (visitedEntities.size >= maxEntities) break;
        }
      }
    }

    // 构建子图结果
    const entities = [...visitedEntities]
      .map((id) => this.entities.get(id))
      .filter((e): e is GraphEntity => e != null);

    const relations = [...visitedRelations]
      .map((id) => this.relations.get(id))
      .filter((r): r is GraphRelation => r != null);

    return { entities, relations };
  }

  // ── 影响分析 ──────────────────────────────────────────────────────────────

  async analyzeImpact(
    entityIds: string[],
    options?: ImpactAnalysisOptions
  ): Promise<SubGraph> {
    const direction = options?.direction ?? "both";
    const maxDepth = options?.maxDepth ?? 3;
    const relationTypes = options?.relationTypes;

    const visitedEntities = new Set<string>(entityIds);
    const visitedRelations = new Set<string>();
    const queue: Array<{ entityId: string; depth: number }> = entityIds.map(
      (id) => ({ entityId: id, depth: 0 })
    );

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (item.depth >= maxDepth) continue;

      const rels: string[] = [];

      if (direction === "forward" || direction === "both") {
        const out = this.outEdges.get(item.entityId) ?? new Set();
        rels.push(...out);
      }

      if (direction === "backward" || direction === "both") {
        const inp = this.inEdges.get(item.entityId) ?? new Set();
        rels.push(...inp);
      }

      for (const relId of rels) {
        const rel = this.relations.get(relId);
        if (!rel) continue;
        if (relationTypes && !relationTypes.includes(rel.type)) continue;

        visitedRelations.add(relId);

        const neighborId = rel.sourceId === item.entityId ? rel.targetId : rel.sourceId;
        if (!visitedEntities.has(neighborId)) {
          visitedEntities.add(neighborId);
          queue.push({ entityId: neighborId, depth: item.depth + 1 });
        }
      }
    }

    const entities = [...visitedEntities]
      .map((id) => this.entities.get(id))
      .filter((e): e is GraphEntity => e != null);

    const relations = [...visitedRelations]
      .map((id) => this.relations.get(id))
      .filter((r): r is GraphRelation => r != null);

    return { entities, relations };
  }

  // ── 邻居查询 ──────────────────────────────────────────────────────────────

  async getNeighbors(entityId: string, depth = 1): Promise<SubGraph> {
    return this.querySubGraph(entityId, {
      maxHops: depth,
      maxEntities: 50,
    });
  }

  // ── 内部工具 ──────────────────────────────────────────────────────────────

  /**
   * 关键词匹配查找入口实体
   * 对实体的 name + description + type 做简单分词匹配
   */
  private findEntitiesByKeywords(
    query: string,
    entityTypes?: string[]
  ): GraphEntity[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const scored: Array<{ entity: GraphEntity; score: number }> = [];

    for (const entity of this.entities.values()) {
      if (entityTypes && !entityTypes.includes(entity.type)) continue;

      const entityText = [entity.name, entity.description ?? "", entity.type].join(" ");
      const entityTokens = tokenize(entityText);

      const matchCount = queryTokens.filter((t) =>
        entityTokens.some((et) => et.includes(t) || t.includes(et))
      ).length;

      if (matchCount > 0) {
        scored.push({
          entity,
          score: matchCount / queryTokens.length,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.entity);
  }

  // ── 统计 ──────────────────────────────────────────────────────────────────

  get entityCount(): number {
    return this.entities.size;
  }

  get relationCount(): number {
    return this.relations.size;
  }
}

// ─── 分词工具 ──────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 中文字符
  const chinese = text.match(/[\u4e00-\u9fff]+/g) ?? [];
  tokens.push(...chinese);
  // 英文/数字
  const words = text.toLowerCase().match(/[a-z][a-z0-9]*/g) ?? [];
  tokens.push(...words.filter((w) => w.length >= 2));
  return tokens;
}
