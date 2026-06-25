# scripts/knowledge/ — 知识种子提取工具

> 独立于基础库的知识提取工具集，负责从各包类型定义中提取知识种子并写入 knowledge-server。

## 设计原则

- **独立工具，非构建钩子** — 不绑定任何包的 build 生命周期，按需手动或 CI 驱动执行
- **只读源码，只写种子** — 读取 banvasgl 的类型定义，产出 JSON 种子文件
- **与数据迁移同级隔离** — `scripts/knowledge/` 与 `scripts/migrations/` 并列，职责分离

## 目录结构

```
scripts/knowledge/
├── README.md                    # 本文件
├── generate-schema-seeds.ts     # [ui] Primitive 种子生成
└── utils/
    └── upsert.ts                # 共享：knowledge-server HTTP 写入工具
```

## 使用方式

```bash
# 在仓库根目录执行
pnpm knowledge:schema            # 生成 UI Schema 种子
```

## 依赖方向

```
scripts/knowledge/
  ├──读取──▶ packages/banvasgl (package.json version)
  └──写入──▶ knowledge-server HTTP API (:3003)
  └──写入──▶ packages/xiangdi-agent/src/knowledge/seeds/ (JSON 文件)
```

## 与 `scripts/migrations/` 的关系

| 维度     | migrations           | knowledge             |
| -------- | -------------------- | --------------------- |
| 触发时机 | 版本发布部署时       | 类型定义变更后        |
| 操作对象 | MongoDB 中的 appJSON | LanceDB 向量库        |
| 幂等性   | 是（版本对版本）     | 是（id-based upsert） |
| 回滚     | 需要 down 脚本       | 重新生成即可          |
