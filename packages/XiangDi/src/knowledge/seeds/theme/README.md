# Theme 层知识种子

此目录存放**设计主题与 token** 的知识种子数据。

## 内容

产品级的设计约束，包括：

- 颜色体系（primary、success、warning、error 等语义色）
- 字号规范（xs ~ xxl 层级）
- 间距规范（xs ~ xxl 层级）
- 圆角规范

本质是"在这个产品里，什么是好看的/合规的"——跨所有节点生效的全局设计 token。

## 数据格式

JSON 文件，metadata 中须包含 `"category": "theme"`，以便 KnowledgeSearchTool 按类别过滤。

## 更新流程

- **人工维护**，由设计师/产品负责人定义
- 变更走 PR review 流程
- 主题是强主观决策，不走自动化生成

## 初始种子（P2 阶段）

- `theme-default.json`：蓝色系，对齐 Ant Design 5 Design Token
- `theme-dark.json`：暗色主题示例
