# Composition 层知识种子

此目录存放 **UI 组合模式**的知识种子数据——知识三层架构中的"设计模式"层（ADR-040）。

## 知识本质

Composition 种子是高质量 Few-shot 示例，描述如何将多个 View 组合成有意义的 UI 结构。它告诉 LLM "一个登录表单应该长什么样"，而 Schema 种子告诉 LLM "每个节点的属性必须怎么写"。

## 内容

描述如何将多个 AI Projection 节点组合成有意义的 UI 模式，例如：

- 登录表单（Logo + 输入框 + 按钮）
- 商品卡片（封面图 + 商品名 + 价格 + 加购按钮）
- 数据表格（表头 + 行列结构 + 分页控件）
- 顶部导航栏、侧边栏布局、统计看板等

每个种子包含完整的节点树示例 + 使用场景说明。

## 数据格式

JSON 文件，metadata 中须包含 `"category": "composition"`，以便 KnowledgeSearchTool 按类别过滤。

**格式要求**：所有示例 JSON 必须使用当前版本的 AI Projection 格式（`AIProjectionNode` 类型体系），不得使用旧版简化 schema。具体来说：

- `type` 字段使用大写枚举值（`"TEXTVIEW"` / `"GRAPHVIEW"` / `"COMBINEDVIEW"` 等）
- `transform` 使用 `{ x, y, rotation?, scaleX?, scaleY? }` 格式
- 文本内容使用 `content.paragraphs[].elements[].text` 结构
- 装饰使用 `decoration` 对象（`fill` / `stroke` / `cornerRadius` 等）

## 正确性验证标准

每个 composition 种子中的示例 JSON 必须满足：

1. `fromAIProjection(seed.example)` 成功反序列化（程序化验证）
2. 反序列化结果渲染后视觉效果合理（人工验证）

## 更新流程

1. 冷启动阶段：运行 `generate-composition-seeds.ts` 脚本，由 LLM 生成候选节点树
2. `fromAIProjection()` 程序化验证通过
3. 人工 review 确认结构和视觉效果合理后提交到此目录
4. 后续变更走 PR review 流程
5. BanvasGL 版本升级时，用验证脚本批量检查已有种子是否仍然合法

## 注意

- 种子数据需人工 review，不是全自动生成
- 每个 JSON 文件应包含一个完整的 UI 模式示例
- 不合法的种子（无法通过 `fromAIProjection()` 验证的）不得合入仓库
