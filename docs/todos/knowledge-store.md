# TODO: KnowledgeStore 知识体系

> 创建时间：2026-05-16
>
> 背景：XiangDi 的 `knowledge_search` 工具已注册（`KnowledgeSearchTool.ts`），底层 `LanceDBKnowledgeStore` 实现完整，但知识库数据为空——没有任何种子数据写入。Agent 调用 `knowledge_search` 时退化为空结果，实际上只依赖 system prompt 工作。

---

## 核心判断：什么知识需要 RAG，什么直接注入

这是一个 **context window 经济学问题**，不是技术可行性问题。

| 方案 | 优点 | 代价 |
|------|------|------|
| 直接读 BanvasGL 全量源码 | 信息最全、永远最新、零维护 | ~40k tokens，每次 Agent 调用都要付这个成本 |
| 只读 AISchema + converters | 信息精准、仅 343 行 | 缺少"怎么组合用"的示例知识，LLM 容易生成合法但不合理的结构 |
| KnowledgeStore 按需检索 | Token 按需消耗、可包含示例和规范 | 需要维护知识库，存在知识过时的风险 |

**结论**：AISchema 类型定义直接注入 system prompt（近期最高优先级，零维护），KnowledgeStore 存经验性知识（常见 UI 模式示例、设计规范）。

---

## 三层架构

KnowledgeStore 的知识不是同质的——不同类型的知识在来源、更新频率、维护成本上差异巨大，混在一起管理会导致各类问题。三层架构让不同来源的知识走不同的维护路径，互不干扰。

### 第一层：实体规范层（Schema）

**是什么**：BanvasGL 能操作什么、每种节点有哪些属性、属性的合法值范围是什么。

**来源**：直接从 `packages/XiangDi/src/schema/AISchema.ts` 中的 Zod schema 定义自动生成。

**存在哪里**：
- 近期：直接注入 system prompt（~1500 tokens，零维护成本，立即可用）
- 中期：`packages/XiangDi/src/knowledge/seeds/auto-generated/` 目录下的 JSON 文件，通过 KnowledgeStore 按需检索

**更新机制（CI/CD）**：

```
BanvasGL 构建 (pnpm build:banvasgl)
  └─ postbuild: tsx scripts/generate-knowledge.ts
       └─ 输出 seeds/auto-generated/*.json
            └─ diff 变更触发 PR → 人工 review AISchema diff → 合并后种子数据更新
```

人工 review 的是 **AISchema 的变更 diff**（即 generate-knowledge.ts 生成的 JSON 变更），而不是源码本身。这样可以直观看到"这次升级新增了哪些属性、改了哪些约束"。

---

### 第二层：实体组合层（Composition）

**是什么**：如何将多个节点组合成有意义的 UI 模式——登录表单、商品卡片、导航栏、数据表格等常见页面结构。

**来源**：需要提炼，代码里没有直接答案。

**存在哪里**：`packages/XiangDi/src/knowledge/seeds/composition/` 目录下的 JSON 文件，包含完整的节点树示例 + 使用场景说明。

**冷启动策略（LLM 生成 + 人工确认）**：

1. 运行冷启动脚本，提供 AISchema 定义 + UI 模式描述，让 LLM 生成节点树示例
2. 脚本将生成结果以格式化 JSON 输出，等待人工 review
3. 人工确认结构合理、属性使用正确后，提交到 `seeds/composition/` 目录

**初始种子数据清单**（待实现）：

- `login-form.json`：标准登录表单（品牌 Logo + 邮箱输入 + 密码输入 + 登录按钮）
- `product-card.json`：商品卡片（封面图 + 商品名 + 价格 + 加购按钮）
- `data-table.json`：数据表格（表头 + 行列结构 + 分页控件）
- `top-navbar.json`：顶部导航栏（Logo + 菜单项 + 用户头像/操作区）
- `sidebar-layout.json`：侧边栏布局（左侧菜单 + 右侧内容区）
- `stats-dashboard.json`：统计看板（多个指标卡片的 Grid 布局）
- `form-with-validation.json`：带校验提示的表单（字段 + 错误提示文本）
- `modal-dialog.json`：弹窗结构（遮罩 + 标题 + 内容区 + 确认/取消按钮）

**更新机制**：种子数据以 JSON 文件形式存于 git，变更走 PR review 流程。

在线积累策略分两个阶段：

短期采用**显式反馈 + 开发者 review 队列**：Agent 完成任务后弹出质量评分（1-5 分），高分结果（≥4 分）自动写入 `seeds/pending/` 暂存目录；开发者定期跑 review 脚本，人工确认后才移入 `seeds/composition/` 正式生效。质量门控权始终在人手里，不存在脏数据自动入库的风险。

长期演进为**多信号打分 + 个人库/共享库分层**：在显式评分基础上叠加隐式信号（采纳后是否立刻 undo、30 秒内是否大幅改动、最终是否成功保存），融合为质量分；采纳结果先写入用户自己的私有知识库（个人沙盒），只有经过多用户交叉验证或开发者 review 后，才晋升到所有人共用的共享库。这样恶意破坏或低质采纳只会污染个人库，不影响全局质量。

---

### 第三层：风格/主题层（Theme）

**是什么**：产品级的设计约束——颜色体系、字号规范、间距规范、圆角规范等。本质是"在这个产品里，什么是好看的/合规的"。不是具体节点结构（那是第二层的职责），而是跨所有节点生效的全局设计 token。

**来源**：产品决策，由设计师/产品负责人定义，人工维护。

**存在哪里**：`packages/XiangDi/src/knowledge/seeds/theme/` 目录下的 JSON 文件。

**数据结构示例**：

```json
{
  "id": "theme-default",
  "content": "默认主题设计规范",
  "source": "theme",
  "metadata": {
    "category": "theme",
    "name": "default",
    "tokens": {
      "colors": {
        "primary": "#1677FF",
        "success": "#52C41A",
        "warning": "#FAAD14",
        "error": "#FF4D4F",
        "text-primary": "#262626",
        "text-secondary": "#8C8C8C",
        "bg-base": "#FFFFFF",
        "bg-layout": "#F5F5F5"
      },
      "typography": {
        "font-size-xs": 12,
        "font-size-sm": 14,
        "font-size-md": 16,
        "font-size-lg": 20,
        "font-size-xl": 24,
        "font-size-xxl": 32,
        "line-height-base": 1.5
      },
      "spacing": { "xs": 4, "sm": 8, "md": 16, "lg": 24, "xl": 32, "xxl": 48 },
      "border": { "radius-sm": 4, "radius-md": 8, "radius-lg": 16, "radius-full": 9999 }
    }
  }
}
```

**初始种子数据**：`theme-default.json`（蓝色系，对齐 Ant Design 5 Design Token）+ `theme-dark.json`（暗色主题示例）。

**更新机制**：人工维护，走 PR review。主题是强主观决策，不走自动化生成。

---

## 版本隔离方案

BanvasGL 版本升级时，AISchema 可能发生 breaking change，旧知识片段可能包含已失效的属性名，导致 Agent 生成错误的工具调用。

**策略**：以 BanvasGL 的 `version` 字段作为知识库命名空间。

```
~/.xiangdi/lancedb/
  knowledge_v0.1.0/    ← tableName = "knowledge_v0.1.0"
  knowledge_v0.2.0/    ← tableName = "knowledge_v0.2.0"
```

实现方式：`LanceDBKnowledgeStore` 的 `tableName` 由 `apps/xiangdi` 初始化时显式传入：

```ts
// apps/xiangdi/src/routes/ai.ts
import { version as banvasglVersion } from "banvasgl";

const store = new LanceDBKnowledgeStore({
  tableName: `knowledge_v${banvasglVersion}`,
});
```

新版本首次启动时对应 table 为空，Agent 退化为只依赖 system prompt 工作（可接受）。旧版本 table 保留在磁盘上，不自动删除。

---

## Agent 使用方式

```
用户意图
   ↓
Agent 规划阶段
   ├─ 查询第一层（我要用哪种节点类型？属性怎么填？）
   ├─ 查询第二层（这个 UI 模式有没有现成的节点树示例？）
   └─ 查询第三层（颜色/字号/间距用什么值？）
   ↓
生成工具调用（create_view / update_view 等）
```

`knowledge_search` 工具通过 `metadata.category` 过滤，便于 Agent 精确指定查询哪层：

```ts
knowledge_search({ query: "text view 属性结构", filter: { category: "component_schema" } })
knowledge_search({ query: "登录表单布局",       filter: { category: "composition" } })
knowledge_search({ query: "primary color",      filter: { category: "theme" } })
```

---

## 行动项

### P1：立即执行

- [x] **将 AISchema 类型定义注入 system prompt**
  - 修改 `packages/XiangDi/src/prompts/system.ts` 的 `buildSystemPrompt()`，接受 `aiSchemaDoc` 参数
  - 在 `apps/xiangdi/src/routes/ai.ts` 中，将 AISchema 的 TypeScript 类型定义（或精简版 JSON Schema）作为字符串传入
  - 效果：Agent 不需要调用 `knowledge_search` 就能知道节点结构，减少一轮工具调用；预计 token 成本 ~1500（可接受）

- [x] **LanceDBKnowledgeStore 支持版本化 tableName**
  - 修改 `LanceDBKnowledgeStore` 构造函数，`tableName` 默认值保持 `"knowledge"`（不破坏现有接口）
  - 在 `apps/xiangdi/src/routes/ai.ts` 初始化时，显式传入 `tableName: \`knowledge_v${banvasglVersion}\``

- [x] **`KnowledgeSearchTool` 支持按 category 过滤**
  - 在 tool input schema 中增加可选的 `filter.category` 字段
  - 将 filter 透传给 `LanceDBKnowledgeStore.search()`

- [x] **建立 seeds 目录结构**
  - 创建 `packages/XiangDi/src/knowledge/seeds/{auto-generated,composition,theme}/` 三个子目录
  - 每个目录下放 `README.md` 说明该层的内容规范和更新流程

### P2：知识体系搭建（v0.1.0）

**第一层（Schema 自动生成）**

- [x] **编写 `generate-knowledge.ts` 脚本**
  - 路径：`packages/BanvasGL/scripts/generate-knowledge.ts`
  - 读取 `packages/XiangDi/src/schema/AISchema.ts` 中的 Zod schema，输出每个节点类型的 JSON Schema 文档 + 最小可用示例到 `seeds/auto-generated/`
  - 在 `packages/BanvasGL/package.json` 添加 `"postbuild": "tsx scripts/generate-knowledge.ts"`

- [ ] **CI 中接入 review 流程**
  - BanvasGL 构建后，如果 `seeds/auto-generated/` 目录有变更，自动提 PR
  - PR 描述中列出 AISchema 变更摘要（新增属性、修改属性、废弃属性）

**第二层（Composition 冷启动）**

- [x] **编写 `generate-composition-seeds.ts` 冷启动脚本**
  - 路径：`packages/XiangDi/scripts/generate-composition-seeds.ts`
  - 向 LLM 输入 AISchema 类型定义 + UI 模式描述列表，批量生成节点树示例，输出到 `seeds/composition/` 等待人工 review

- [x] **初始化 8 个标准 UI 模式种子数据**（见上方清单），人工 review 后提交到 git

**第三层（Theme 人工初始化）**

- [x] **写入 `seeds/theme/theme-default.json` 和 `theme-dark.json`**，对齐当前产品实际使用的设计规范

**种子写入脚本**

- [x] **编写 `seed-knowledge.ts` 脚本**
  - 路径：`apps/xiangdi/scripts/seed-knowledge.ts`
  - 支持 `--layer schema|composition|theme|all`，幂等执行（先按 id 删除旧条目，再写入）
  - 在 `apps/xiangdi/package.json` 添加 `"seed": "tsx scripts/seed-knowledge.ts"`

### P3：长远演进

- [ ] **版本升级时的知识迁移工具**
  - 检测旧版本 table 是否存在，提示开发者迁移/重新生成
  - 小版本（纯新增属性）：复用旧知识，只追加新知识；大版本（breaking change）：重新生成全部

- [ ] **在 ProjectSpec 中声明主题偏好，注入检索上下文**
  - 用户应用配置了自定义主题时，自动将主题 id 注入 `knowledge_search` 的 filter

- [ ] **显式反馈收集（第三种方案，短期）**
  - Agent 完成任务后，在前端展示质量评分卡片（1-5 分 + 可选文字描述）
  - 后端收到评分事件后，≥4 分的结果将对应节点树序列化写入 `seeds/pending/` 暂存目录（含评分、时间戳、用户 id 匿名化摘要）
  - 评分 ≤2 分的记录单独存入 `seeds/rejected/`，作为反例知识的候选来源

- [ ] **开发者 review 脚本**
  - 路径：`apps/xiangdi/scripts/review-pending.ts`
  - 读取 `seeds/pending/` 目录，逐条展示节点树预览（终端渲染或生成预览图）
  - 支持交互式操作：`a` 接受（移入 `seeds/composition/`）、`r` 拒绝（移入 `seeds/rejected/`）、`s` 跳过
  - 接受时自动做相似度去重（cosine similarity > 0.9 则跳过写入）
  - 在 `apps/xiangdi/package.json` 添加 `"review": "tsx scripts/review-pending.ts"`

- [ ] **多信号打分 + 个人库/共享库分层（第二种+第四种方案，长期）**
  - 埋点采集隐式信号：采纳后是否立刻 undo、30 秒内是否大幅修改（diff > 30%）、最终是否成功保存应用
  - 将显式评分与隐式信号融合为综合质量分（加权求和，权重可配置）
  - 采纳结果先写入用户私有知识库（`knowledge_v{version}_user_{userId}` table），不影响共享库
  - 私有库中综合质量分持续累积，达到阈值（如同一模式被同一用户高质量采纳 3 次）后自动提名进入 `seeds/pending/`，走现有 review 流程晋升共享库
