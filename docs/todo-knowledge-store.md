# TODO: KnowledgeStore 持久化知识体系设计

> 创建时间：2026-05-16
> 背景：讨论 XiangDi 的 `knowledge_search` 工具所依赖的持久化知识库，应该存什么、怎么生成、怎么隔离版本。

---

## 问题一：我们需要这个知识库吗？可以直接看代码吗？

### 问题本质

这是一个 **context window 经济学问题**，不是技术可行性问题。

直接把 BanvasGL 源码塞给 LLM 在技术上完全可行，但有明确的代价：

| 方案 | 优点 | 代价 |
|------|------|------|
| 直接读源码 | 信息最全、永远最新、零维护 | BanvasGL 共 161 个 .ts 文件、28409 行，全量塞入约 ~40k tokens，每次 Agent 调用都要付这个成本 |
| 只读 AISchema + converters | 信息精准（AI 操作的唯一接口）、仅 343 行 | 缺少"怎么组合用"的示例知识，LLM 容易生成合法但不合理的结构 |
| KnowledgeStore 按需检索 | Token 按需消耗、可包含示例和规范 | 需要维护知识库，存在知识过时的风险 |

### 结论

**不需要把 BanvasGL 全量源码放进知识库**，但也不能完全不要知识库。

真正需要的知识分两类：

1. **结构性知识**（可以直接从代码生成）：AISchema 的 JSON Schema 定义、各节点类型的属性列表、合法的属性值范围。这部分直接在 system prompt 里注入 AISchema 的 TypeScript 类型定义即可，不需要向量检索。

2. **经验性知识**（代码里没有，需要人工或 LLM 提炼）：好的布局组合方式、常见 UI 模式的节点结构示例、设计规范（间距、字号、颜色体系）。这部分才是 KnowledgeStore 真正的价值所在。

**当前阶段的务实选择**：先把 AISchema 类型定义直接注入 system prompt（零维护成本），KnowledgeStore 暂时只存少量高价值的示例模板，等产品成熟后再系统化建设知识库。

---

## 问题二：知识需要按 BanvasGL 版本隔离

### 问题本质

BanvasGL 的 AISchema（`packages/XiangDi/src/schema/AISchema.ts`）定义了 AI 能操作的节点类型和属性结构。当 BanvasGL 版本升级时，AISchema 可能发生变化（新增节点类型、属性改名、属性废弃），旧版本生成的知识片段可能包含已失效的属性名或节点类型，导致 Agent 生成错误的工具调用。

### 具体风险

```
知识库中存储：{ type: "rect", fill: { color: "#FF0000" } }
BanvasGL v0.2 将 fill.color 改为 fill.solidColor
→ Agent 按旧知识生成的 JSON 被 converters.ts 拒绝或静默忽略
```

### 解决方案

**版本隔离策略**：以 BanvasGL 的 `version` 字段（来自 `packages/BanvasGL/src/version.ts`，构建时由 tsup 注入）作为知识库的命名空间。

```
~/.xiangdi/lancedb/
  knowledge_v0.1.0/    ← tableName = "knowledge_v0.1.0"
  knowledge_v0.2.0/    ← tableName = "knowledge_v0.2.0"
```

**实现方式**：`LanceDBKnowledgeStore` 的 `tableName` 默认值改为 `knowledge_${banvasglVersion}`，版本号由调用方（`apps/xiangdi`）在初始化时传入。

```ts
// apps/xiangdi/src/routes/ai.ts 初始化时
import { version as banvasglVersion } from "banvasgl";

const store = new LanceDBKnowledgeStore({
  tableName: `knowledge_v${banvasglVersion}`,
});
```

**版本升级时的处理**：新版本首次启动时，对应的 table 不存在，知识库为空，Agent 退化为只依赖 system prompt 中的 AISchema 类型定义工作（可接受）。旧版本的 table 保留在磁盘上，不自动删除（磁盘便宜，手动清理即可）。

---

## 问题三：知识怎么生成、怎么触发、怎么写入

### 问题本质

知识库的内容本质是**对 BanvasGL 使用方式的浓缩**，分两个来源：

**来源 A：可自动生成的结构性知识**（从代码派生）

- AISchema 各节点类型的完整属性定义（JSON 格式，便于 LLM 直接参考）
- 各属性的合法值示例（从 Zod schema 的 `.enum()`、`.min()`、`.max()` 等约束中提取）
- 节点嵌套规则（group 可以包含哪些子节点）

**来源 B：需要人工/LLM 提炼的经验性知识**

- 常见 UI 模式的完整节点树示例（登录表单、商品卡片、导航栏等）
- 设计规范（颜色体系、字号体系、间距规范）
- 反例：哪些写法是合法但不推荐的

### 触发时机

| 触发时机 | 适用知识类型 | 实现位置 |
|----------|-------------|----------|
| BanvasGL 版本升级时（构建后脚本） | 来源 A（自动生成） | `packages/BanvasGL/scripts/generate-knowledge.ts` |
| 开发者手动运行 | 来源 B（人工整理） | `apps/xiangdi/scripts/seed-knowledge.ts` |
| 未来：用户使用过程中积累（在线学习） | 来源 B（从成功案例中提炼） | 暂不实现 |

### 生成流程（来源 A，自动生成）

```
1. 读取 AISchema.ts 中的 Zod schema 定义
2. 用 zod-to-json-schema 或手写脚本将每个节点类型转为 JSON Schema 文档
3. 为每个节点类型生成一个最小可用示例（所有必填字段填合理默认值）
4. 调用 LanceDBKnowledgeStore.add() 写入，source 标记为 "component_schema"
```

### 生成流程（来源 B，人工整理）

```
1. 在 packages/XiangDi/src/knowledge/seeds/ 目录下维护 .json 或 .md 文件
2. 每个文件对应一类知识（登录页模板、卡片组件示例、设计规范等）
3. 运行 seed-knowledge.ts 脚本，批量写入 LanceDBKnowledgeStore
4. 脚本幂等：先按 id 删除旧版本，再写入新版本
```

---

## 行动项

### 近期（当前版本 v0.1.0 可用）

- [ ] **[P1] 将 AISchema 类型定义直接注入 system prompt**
  - 修改 `packages/XiangDi/src/prompts/system.ts` 的 `buildSystemPrompt()`，接受 `aiSchemaDoc` 参数
  - 在 `apps/xiangdi/src/routes/ai.ts` 中，将 AISchema 的 TypeScript 类型定义（或精简版 JSON Schema）作为字符串传入
  - 这样 Agent 不需要调用 `knowledge_search` 就能知道节点结构，减少一轮工具调用
  - 预计 token 成本：~1500 tokens（可接受）

- [ ] **[P1] LanceDBKnowledgeStore 支持版本化 tableName**
  - 修改 `LanceDBKnowledgeStore` 构造函数，`tableName` 默认值改为 `"knowledge"`（保持现状）
  - 在 `apps/xiangdi/src/routes/ai.ts` 初始化时，显式传入 `tableName: \`knowledge_v${banvasglVersion}\``
  - 文档说明版本升级时的处理方式

- [ ] **[P2] 创建 knowledge seeds 目录和初始种子数据**
  - 路径：`packages/XiangDi/src/knowledge/seeds/`
  - 初始内容：登录页示例、商品卡片示例、基础设计规范（颜色/字号/间距）
  - 格式：每条知识一个 JSON 对象 `{ id, content, source, metadata: { category, banvasglVersion } }`

- [ ] **[P2] 编写 seed-knowledge.ts 脚本**
  - 路径：`apps/xiangdi/scripts/seed-knowledge.ts`
  - 功能：读取 seeds 目录，批量写入 LanceDBKnowledgeStore，幂等执行
  - 在 `apps/xiangdi/package.json` 中添加 `"seed": "tsx scripts/seed-knowledge.ts"` 脚本

### 中期（v0.2.0 版本升级时）

- [ ] **[P2] 编写 generate-knowledge.ts 脚本（自动从 AISchema 生成结构性知识）**
  - 路径：`packages/BanvasGL/scripts/generate-knowledge.ts`
  - 输出：`packages/XiangDi/src/knowledge/seeds/auto-generated/` 目录下的 JSON 文件
  - 触发：在 BanvasGL 的 `package.json` 中添加 `"postbuild": "tsx scripts/generate-knowledge.ts"`

- [ ] **[P3] 版本升级时的知识迁移工具**
  - 检测旧版本 table 是否存在，提示开发者是否需要迁移/重新生成
  - 对于纯新增属性的小版本升级，可以复用旧知识（只需追加新知识）
  - 对于 breaking change 的大版本升级，需要重新生成全部知识

### 长期（产品成熟后）

- [ ] **[P3] 从用户成功案例中在线学习**
  - 当 Agent 成功完成一个任务（用户确认满意），将该任务的最终节点树作为新的示例知识写入
  - 需要去重和质量过滤机制

---

## 附：当前 KnowledgeStore 的实际使用状态

目前 `knowledge_search` 工具已注册（`KnowledgeSearchTool.ts`），但知识库为空——没有任何种子数据写入。Agent 调用 `knowledge_search` 时会得到空结果，实际上退化为只依赖 system prompt 工作。

这意味着**近期最高优先级是 [P1] 将 AISchema 注入 system prompt**，而不是建设知识库，因为这能立即提升 Agent 的生成质量，且零维护成本。
