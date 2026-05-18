# Composition 层知识种子

此目录存放 **UI 组合模式**的知识种子数据。

## 内容

描述如何将多个 AISchema 节点组合成有意义的 UI 模式，例如：

- 登录表单（Logo + 输入框 + 按钮）
- 商品卡片（封面图 + 商品名 + 价格 + 加购按钮）
- 数据表格（表头 + 行列结构 + 分页控件）
- 顶部导航栏、侧边栏布局、统计看板等

每个种子包含完整的节点树示例 + 使用场景说明。

## 数据格式

JSON 文件，metadata 中须包含 `"category": "composition"`，以便 KnowledgeSearchTool 按类别过滤。

## 更新流程

1. 冷启动阶段：运行 `generate-composition-seeds.ts` 脚本，由 LLM 生成候选节点树
2. 人工 review 确认结构合理后提交到此目录
3. 后续变更走 PR review 流程

## 注意

- 种子数据需人工 review，不是全自动生成
- 每个 JSON 文件应包含一个完整的 UI 模式示例
