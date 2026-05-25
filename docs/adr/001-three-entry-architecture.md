# ADR-001: BanvasGL 三入口物理隔离架构

**状态**: ~~已采纳~~ **已废弃（Superseded by ADR-016）**
**日期**: 2026-05-14
**废弃日期**: 2026-06-01
**决策者**: 陈班

> ⚠️ 本 ADR 描述的三入口架构**从未实际落地**。
> BanvasGL 始终保持单一入口（`src/index.ts`），tsup 亦仅配置单 entry。
> 编辑态/运行态的物理隔离最终通过分层拆包方案实现，详见 [ADR-016](./016-banvasgl-layered-packages.md)。

## 背景

BanvasGL 引擎需要同时服务三种使用场景：编辑态（Banyan 编辑器中的完整设计功能）、运行态（最终用户使用的发布应用）、服务端（Node.js 环境的预览渲染和构建）。三种场景对依赖、产物大小、安全性的要求完全不同。

## 原始决策（未落地）

计划采用三入口物理隔离架构，通过 tsup 多 entry point 配置输出三份独立的 bundle：

- `index.frontend.ts` — 编辑态完整功能：core + workers + 全部 React hooks
- `index.runtime.ts` — 运行态最小集：core + useRuntimeBanvas（不含编辑 hook、Worker）
- `index.backend.ts` — 服务端环境：core + workers（不含 React/DOM）

## 为何未落地

实施过程中发现三入口方案维护成本过高：新增任何导出都需要手动同步三个文件，极易遗漏。
同时，随着 `@banyuan/banvas-design`、`@banyuan/banvas-runtime`、`@banyuan/banvas-runtime-web` 三个子包的逐步成熟，发现「包边界」本身就是比「入口文件」更强的物理隔离手段：

- 编辑态能力（hooks、Worker、设计器组件）归入 `@banyuan/banvas-design`
- 运行态接口层归入 `@banyuan/banvas-runtime` + `@banyuan/banvas-runtime-web`
- `@banyuan/banvasgl` 核心包只保留纯引擎能力，单入口 `src/index.ts` 统一导出

## 现状

`packages/banvasgl/tsup.config.ts` 中 `entry: ["src/index.ts"]`，单入口，无 external（核心包自包含）。
**不存在** `index.frontend.ts`、`index.runtime.ts`、`index.backend.ts`。

## 考虑过的方案（历史记录）

**方案 A：单入口 + tree-shaking** — 一个入口全部导出，依赖打包工具的 tree-shaking 去除未使用代码。问题：tree-shaking 不可靠（side-effect 标记不完善时会失效），且运行态产物可能意外包含编辑器代码。

**方案 B：编译时条件编译** — 使用 `process.env.MODE` 等环境变量做条件导出。问题：增加构建复杂度，且调试时难以追踪实际包含了哪些模块。

**方案 C（原计划）：物理三入口** — 三个独立入口文件，各自显式声明导出的模块列表。代价是新增模块时需手动维护三份导出。→ 最终被分层拆包取代。

**方案 D（实际采纳，见 ADR-016）：分层拆包** — 核心包单入口，编辑/运行能力以独立包形式拆分。包边界即物理隔离，零维护负担。
