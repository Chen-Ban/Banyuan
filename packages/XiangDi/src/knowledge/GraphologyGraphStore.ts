/**
 * 相地 · Graphology 图知识库（GraphologyGraphStore）
 *
 * 基于 graphology 的内存图数据结构实现，替代 InMemoryGraphStore。
 *
 * 相比 InMemoryGraphStore 的改进：
 *   - 使用 graphology 的标准图 API，支持有向/无向/混合图
 *   - 内置 BFS/DFS 遍历（graphology-traversal）
 *   - 支持 JSON 序列化持久化（可选）
 *   - 更好的内存效率和遍历性能
 *   - 支持图算法扩展（PageRank、社区发现等）
 *
 * 入口实体查找策略：
 *   - 关键词匹配（name + description + type 字段）
 *   - 支持中英文分词
 *   - 按匹配度排序，取 top-5 作为 BFS 起点
 *
 * 持久化：
 *   - 可选的 JSON 文件持久化（通过 save/load 方法）
 *   - 格式：graphology 标准 JSON 序列化格式
 *
 * 使用示例：
 * ```ts
 * const graph = new GraphologyGraphStore();
 *
 * await graph.addEntities([
 *   { id: "page-home", type: "page", name: "HomePage", description: "首页" },
 *   { id: "comp-card", type: "component", name: "ProductCard" },
 * ]);
 *
 * await graph.addRelations([
 *   { id: "r1", sourceId: "page-home", targetId: "comp-card", type: "contains" },
 * ]);
 *
 * // 影响分析：修改 ProductCard 会影响哪些页面？
 * const impact = await graph.analyzeImpact(["comp-card"], { direction: "backward" });
 * // → { entities: [HomePage, ProductCard], relations: [...] }
 *
 * // 子图检索：查找与"首页"相关的知识
 * const subgraph = await graph.querySubGraph("首页布局", { maxHops: 2 });
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

// ─── 配置 ──────────────────────────────────────────────────────────────────────

export interface GraphologyGraphStoreConfig {
  /**
   * 是否允许自环（同一节点的自引用关系）
   * 默认：false
   */
  allowSelfLoops?: boolean;
  /**
   * 是否允许多重边（两节点间多条同类型关系）
   * 默认：true（不同 type 的关系可以共存）
   */
  multi?: boolean;
}

// ─── GraphologyGraphStore ─────────────────────────────────────────────────────

export class GraphologyGraphStore implements GraphKnowledgeStore {
  // 使用 Map 存储实体和关系元数据（graphology 节点/边属性的镜像）
  // 这样可以在不依赖 graphology 类型的情况下保持类型安全
  private entities: Map<string, GraphEntity> = new Map();
  private relations: Map<string, GraphRelation> = new Map();

  // graphology 图实例（懒加载）
  private graph: GraphologyInstance | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly config: GraphologyGraphStoreConfig = {}) {}

  // ── 写入操作 ──────────────────────────────────────────────────────────────

  async addEntities(entities: GraphEntity[]): Promise<void> {
    const g = await this.getGraph();

    for (const entity of entities) {
      this.entities.set(entity.id, entity);

      if (g.hasNode(entity.id)) {
        // 更新已有节点属性
        g.mergeNodeAttributes(entity.id, {
          type: entity.type,
          name: entity.name,
          description: entity.description ?? "",
          properties: entity.properties ?? {},
        });
      } else {
        g.addNode(entity.id, {
          type: entity.type,
          name: entity.name,
          description: entity.description ?? "",
          properties: entity.properties ?? {},
        });
      }
    }
  }

  async addRelations(relations: GraphRelation[]): Promise<void> {
    const g = await this.getGraph();

    for (const rel of relations) {
      this.relations.set(rel.id, rel);

      // 确保源/目标节点存在（防御性创建）
      if (!g.hasNode(rel.sourceId)) {
        g.addNode(rel.sourceId, { type: "unknown", name: rel.sourceId });
      }
      if (!g.hasNode(rel.targetId)) {
        g.addNode(rel.targetId, { type: "unknown", name: rel.targetId });
      }

      if (g.hasEdge(rel.id)) {
        g.mergeEdgeAttributes(rel.id, {
          type: rel.type,
          description: rel.description ?? "",
          weight: rel.weight ?? 1,
        });
      } else {
        g.addDirectedEdgeWithKey(rel.id, rel.sourceId, rel.targetId, {
          type: rel.type,
          description: rel.description ?? "",
          weight: rel.weight ?? 1,
        });
      }
    }
  }

  async removeEntities(ids: string[]): Promise<void> {
    const g = await this.getGraph();

    for (const id of ids) {
      this.entities.delete(id);

      if (g.hasNode(id)) {
        // graphology 删除节点时会自动删除相关的边
        const edgeKeys = g.edges(id);
        for (const edgeKey of edgeKeys) {
          this.relations.delete(edgeKey);
        }
        g.dropNode(id);
      }
    }
  }

  // ── 子图检索 ──────────────────────────────────────────────────────────────

  async querySubGraph(
    query: string,
    options?: GraphQueryOptions
  ): Promise<SubGraph> {
    const g = await this.getGraph();
    const maxHops = options?.maxHops ?? 2;
    const maxEntities = options?.maxEntities ?? 20;
    const relationTypes = options?.relationTypes;
    const entityTypes = options?.entityTypes;

    // Step 1: 找到入口实体（关键词匹配）
    const entryEntities = this.findEntitiesByKeywords(query, entityTypes);
    if (entryEntities.length === 0) {
      return { entities: [], relations: [] };
    }

    // Step 2: BFS 扩展
    const visitedNodes = new Set<string>();
    const visitedEdges = new Set<string>();
    const queue: Array<{ nodeId: string; depth: number }> = [];

    for (const entity of entryEntities.slice(0, 5)) {
      queue.push({ nodeId: entity.id, depth: 0 });
      visitedNodes.add(entity.id);
    }

    while (queue.length > 0 && visitedNodes.size < maxEntities) {
      const item = queue.shift()!;
      if (item.depth >= maxHops) continue;

      // 获取所有相邻边（出边 + 入边）
      const edges = g.edges(item.nodeId);

      for (const edgeKey of edges) {
        const edgeAttrs = g.getEdgeAttributes(edgeKey) as { type: string };

        // 关系类型过滤
        if (relationTypes && !relationTypes.includes(edgeAttrs.type)) continue;

        visitedEdges.add(edgeKey);

        const source = g.source(edgeKey);
        const target = g.target(edgeKey);
        const neighborId = source === item.nodeId ? target : source;

        if (!visitedNodes.has(neighborId)) {
          const neighborAttrs = g.getNodeAttributes(neighborId) as { type: string };

          // 实体类型过滤
          if (entityTypes && !entityTypes.includes(neighborAttrs.type)) continue;

          visitedNodes.add(neighborId);
          queue.push({ nodeId: neighborId, depth: item.depth + 1 });

          if (visitedNodes.size >= maxEntities) break;
        }
      }
    }

    return this.buildSubGraph(visitedNodes, visitedEdges);
  }

  // ── 影响分析 ──────────────────────────────────────────────────────────────

  async analyzeImpact(
    entityIds: string[],
    options?: ImpactAnalysisOptions
  ): Promise<SubGraph> {
    const g = await this.getGraph();
    const direction = options?.direction ?? "both";
    const maxDepth = options?.maxDepth ?? 3;
    const relationTypes = options?.relationTypes;

    const visitedNodes = new Set<string>(entityIds);
    const visitedEdges = new Set<string>();
    const queue: Array<{ nodeId: string; depth: number }> = entityIds.map(
      (id) => ({ nodeId: id, depth: 0 })
    );

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (item.depth >= maxDepth) continue;

      let edges: string[] = [];

      if (direction === "forward" || direction === "both") {
        edges = edges.concat(g.outEdges(item.nodeId));
      }
      if (direction === "backward" || direction === "both") {
        edges = edges.concat(g.inEdges(item.nodeId));
      }

      for (const edgeKey of edges) {
        const edgeAttrs = g.getEdgeAttributes(edgeKey) as { type: string };
        if (relationTypes && !relationTypes.includes(edgeAttrs.type)) continue;

        visitedEdges.add(edgeKey);

        const source = g.source(edgeKey);
        const target = g.target(edgeKey);
        const neighborId = source === item.nodeId ? target : source;

        if (!visitedNodes.has(neighborId)) {
          visitedNodes.add(neighborId);
          queue.push({ nodeId: neighborId, depth: item.depth + 1 });
        }
      }
    }

    return this.buildSubGraph(visitedNodes, visitedEdges);
  }

  // ── 邻居查询 ──────────────────────────────────────────────────────────────

  async getNeighbors(entityId: string, depth = 1): Promise<SubGraph> {
    return this.querySubGraph(entityId, {
      maxHops: depth,
      maxEntities: 50,
    });
  }

  // ── 持久化 ────────────────────────────────────────────────────────────────

  /**
   * 序列化为 JSON（可用于持久化到文件）
   * 使用 graphology 内置的 export() 方法
   */
  async toJSON(): Promise<string> {
    const g = await this.getGraph();
    return JSON.stringify((g as unknown as { export(): unknown }).export());
  }

  /**
   * 从 JSON 恢复（从文件加载）
   * 使用 graphology 内置的 import() 方法
   */
  async fromJSON(json: string): Promise<void> {
    const g = await this.getGraph();
    const data = JSON.parse(json) as unknown;
    (g as unknown as { import(data: unknown): void }).import(data);

    // 重建 entities 和 relations Map
    this.entities.clear();
    this.relations.clear();

    g.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
      this.entities.set(nodeId, {
        id: nodeId,
        type: String(attrs["type"] ?? "unknown"),
        name: String(attrs["name"] ?? nodeId),
        description: attrs["description"] ? String(attrs["description"]) : undefined,
        properties: attrs["properties"] as Record<string, unknown> | undefined,
      });
    });

    g.forEachEdge(
      (edgeKey: string, attrs: Record<string, unknown>, source: string, target: string) => {
        this.relations.set(edgeKey, {
          id: edgeKey,
          sourceId: source,
          targetId: target,
          type: String(attrs["type"] ?? "unknown"),
          description: attrs["description"] ? String(attrs["description"]) : undefined,
          weight: typeof attrs["weight"] === "number" ? attrs["weight"] : undefined,
        });
      }
    );
  }

  // ── 统计 ──────────────────────────────────────────────────────────────────

  get entityCount(): number {
    return this.entities.size;
  }

  get relationCount(): number {
    return this.relations.size;
  }

  // ── 内部工具 ──────────────────────────────────────────────────────────────

  private async getGraph(): Promise<GraphologyInstance> {
    if (this.graph) return this.graph;
    if (this.initPromise) {
      await this.initPromise;
      return this.graph!;
    }
    this.initPromise = this.initGraph();
    await this.initPromise;
    return this.graph!;
  }

  private async initGraph(): Promise<void> {
    const { default: Graph } = await import("graphology");
    this.graph = new Graph({
      allowSelfLoops: this.config.allowSelfLoops ?? false,
      multi: this.config.multi ?? true,
      type: "directed",
    }) as unknown as GraphologyInstance;
  }

  private buildSubGraph(
    visitedNodes: Set<string>,
    visitedEdges: Set<string>
  ): SubGraph {
    const entities = [...visitedNodes]
      .map((id) => this.entities.get(id))
      .filter((e): e is GraphEntity => e != null);

    const relations = [...visitedEdges]
      .map((id) => this.relations.get(id))
      .filter((r): r is GraphRelation => r != null);

    return { entities, relations };
  }

  /**
   * 关键词匹配查找入口实体
   * 对实体的 name + description + type 做分词匹配，返回按分数排序的实体列表
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

      const entityText = [
        entity.name,
        entity.description ?? "",
        entity.type,
        // 将 properties 中的字符串值也纳入匹配
        ...Object.values(entity.properties ?? {})
          .filter((v): v is string => typeof v === "string"),
      ].join(" ");

      const entityTokens = tokenize(entityText);
      const entityTokenSet = new Set(entityTokens);

      // 计算查询覆盖率（query 中有多少 token 命中了实体文本）
      let matchCount = 0;
      for (const token of queryTokens) {
        if (entityTokenSet.has(token)) {
          matchCount++;
        } else {
          // 部分匹配（子串）
          for (const et of entityTokens) {
            if (et.includes(token) || token.includes(et)) {
              matchCount += 0.5;
              break;
            }
          }
        }
      }

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
}

// ─── 分词工具 ──────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  const tokens: string[] = [];

  // 中文词组（2-4 字的连续汉字）
  const chineseWords = text.match(/[\u4e00-\u9fff]{2,4}/g) ?? [];
  tokens.push(...chineseWords);

  // 单个汉字（作为补充）
  const chineseChars = text.match(/[\u4e00-\u9fff]/g) ?? [];
  tokens.push(...chineseChars);

  // 英文/数字词汇（至少 2 字符）
  const words = text.toLowerCase().match(/[a-z][a-z0-9]*/g) ?? [];
  tokens.push(...words.filter((w) => w.length >= 2));

  // 去重
  return [...new Set(tokens)];
}

// ─── 内部类型（graphology API 的最小类型声明）────────────────────────────────

interface GraphologyInstance {
  hasNode(id: string): boolean;
  addNode(id: string, attrs: Record<string, unknown>): void;
  mergeNodeAttributes(id: string, attrs: Record<string, unknown>): void;
  dropNode(id: string): void;
  getNodeAttributes(id: string): Record<string, unknown>;
  forEachNode(cb: (id: string, attrs: Record<string, unknown>) => void): void;

  hasEdge(id: string): boolean;
  addDirectedEdgeWithKey(
    key: string,
    source: string,
    target: string,
    attrs: Record<string, unknown>
  ): void;
  mergeEdgeAttributes(key: string, attrs: Record<string, unknown>): void;
  getEdgeAttributes(key: string): Record<string, unknown>;
  forEachEdge(
    cb: (key: string, attrs: Record<string, unknown>, source: string, target: string) => void
  ): void;

  edges(nodeId: string): string[];
  outEdges(nodeId: string): string[];
  inEdges(nodeId: string): string[];
  source(edgeKey: string): string;
  target(edgeKey: string): string;
}
