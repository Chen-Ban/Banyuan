# Schema 层知识种子

此目录存放**自动生成的** Schema 层知识种子数据。

## 内容

来自 `packages/XiangDi/src/schema/AISchema.ts` 中 Zod Schema 定义的结构化文档，描述 BanvasGL 可操作的节点类型、属性结构及合法值范围。

## 生成方式

由 `packages/BanvasGL/scripts/generate-knowledge.ts` 脚本自动生成（P2 阶段实现）：

```
pnpm build:banvasgl
  └─ postbuild: tsx scripts/generate-knowledge.ts
       └─ 输出到此目录下的 JSON 文件
```

## 更新流程

1. BanvasGL 构建后自动运行 `generate-knowledge.ts`
2. 脚本将 AISchema 变更输出为 JSON 文件
3. 变更通过 PR review 后合并

## 注意

- 此目录下的文件是自动生成的，**请勿手工编辑**
- 近期（P1 阶段），AISchema 类型定义直接注入 system prompt，此目录为后续扩展预留
