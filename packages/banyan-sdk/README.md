# BanyanSDK — 统一 SDK 入口（`@banyuan/banyan-sdk`）

BanyanSDK 是 Banyuan 低代码平台的**统一 SDK 伞包**，聚合导出 BanvasGL 核心引擎及编辑态/运行态/流程图编辑器的全部能力。应用层只需安装 `@banyuan/banyan-sdk` 一个包，即可获得完整的画布引擎能力。

---

## 设计理念

Banyuan 的图形引擎按 ADR-016 拆分为多个独立包（核心/编辑态/运行态/流程图/流程执行器），各包职责清晰、可独立安装。但对于应用层开发者（如 Banyan 前端），逐个安装和管理 5 个包的版本较为繁琐。

BanyanSDK 作为伞包，提供：

- **一次安装**：`pnpm add @banyuan/banyan-sdk`，所有子包自动可用
- **多入口按需导入**：通过子路径（`./core`、`./design`、`./runtime`、`./flow`）按需引入，不影响 tree-shaking
- **版本统一**：子包版本由 SDK 统一管理，消费方无需关心兼容性

---

## 多入口

| 入口 | 导入路径 | 对应子包 | 说明 |
|------|----------|----------|------|
| 全量 | `@banyuan/banyan-sdk` | 所有 | 一次导入全部能力 |
| 核心 | `@banyuan/banyan-sdk/core` | `@banyuan/banvasgl` | 场景图、图形基元、序列化、动画 |
| 编辑态 | `@banyuan/banyan-sdk/design` | `@banyuan/banvas-design` | useDesignBanvas + Workers + 交互 |
| 运行态 | `@banyuan/banyan-sdk/runtime` | `@banyuan/banvas-runtime` | useRuntimeBanvas（最小渲染集） |
| 流程图 | `@banyuan/banyan-sdk/flow` | `@banyuan/flow-design` | useFlowBanvas + NodeView/EdgeView |

---

## 快速使用

```tsx
// 按需导入（推荐，更清晰的依赖边界）
import { Scene, Serializer, ViewRegistry } from '@banyuan/banyan-sdk/core'
import { useDesignBanvas } from '@banyuan/banyan-sdk/design'
import { useRuntimeBanvas } from '@banyuan/banyan-sdk/runtime'
import { useFlowBanvas, installFlowViews } from '@banyuan/banyan-sdk/flow'

// 或全量导入（快速原型开发）
import { Scene, useDesignBanvas, useRuntimeBanvas, useFlowBanvas } from '@banyuan/banyan-sdk'
```

---

## 安装

```json
{
  "dependencies": {
    "@banyuan/banyan-sdk": "workspace:*"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  }
}
```

SDK 会自动带入以下子包作为 dependencies：

- `@banyuan/banvasgl` — 核心引擎
- `@banyuan/banvas-runtime` — 运行态
- `@banyuan/banvas-design` — 编辑态
- `@banyuan/flow-design` — 流程图编辑器

---

## 子包文档

SDK 聚合的各子包均有独立文档，深入了解请参阅：

- [**@banyuan/banvasgl** — 核心 2D 图形引擎](../BanvasGL/README.md)
- [**@banyuan/banvas-design** — 编辑态 React 绑定](../BanvasDesign/README.md)
- [**@banyuan/banvas-runtime** — 运行态 React Hook](../BanvasRuntime/README.md)
- [**@banyuan/flow-design** — 流程图编辑器](../BanvasFlowEditor/README.md)
- [**@banyuan/flow** — 声明式流程执行器](../BanvasFlow/README.md)

---

## 目录结构

```
src/
├── index.ts      # 全量导出（re-export 所有子包）
├── core.ts       # @banyuan/banvasgl 导出代理
├── design.ts     # @banyuan/banvas-design 导出代理
├── runtime.ts    # @banyuan/banvas-runtime 导出代理
└── flow.ts       # @banyuan/flow-design 导出代理
```

---

## 构建

```bash
pnpm --filter @banyuan/banyan-sdk build
pnpm --filter @banyuan/banyan-sdk dev   # watch 模式
```
