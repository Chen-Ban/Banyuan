# ADR-001: BanvasGL 三入口物理隔离架构

**状态**: 已采纳
**日期**: 2026-05-14
**决策者**: 陈班

## 背景

BanvasGL 引擎需要同时服务三种使用场景：编辑态（Banyan 编辑器中的完整设计功能）、运行态（最终用户使用的发布应用）、服务端（Node.js 环境的预览渲染和构建）。三种场景对依赖、产物大小、安全性的要求完全不同。

## 决策

采用三入口物理隔离架构，通过 tsup 多 entry point 配置输出三份独立的 bundle：

- `index.frontend.ts` — 编辑态完整功能：core + workers + 全部 React hooks
- `index.runtime.ts` — 运行态最小集：core + useRuntimeBanvas（不含编辑 hook、Worker）
- `index.backend.ts` — 服务端环境：core + workers（不含 React/DOM）

## 考虑过的方案

**方案 A：单入口 + tree-shaking** — 一个入口全部导出，依赖打包工具的 tree-shaking 去除未使用代码。问题：tree-shaking 不可靠（side-effect 标记不完善时会失效），且运行态产物可能意外包含编辑器代码。

**方案 B：编译时条件编译** — 使用 `process.env.MODE` 等环境变量做条件导出。问题：增加构建复杂度，且调试时难以追踪实际包含了哪些模块。

**方案 C（采纳）：物理隔离** — 三个独立入口文件，各自显式声明导出的模块列表。代价是新增模块时需手动维护三份导出，但换来的是确定性。

## 后果

- 运行态产物零编辑器代码，bundle 更小、加载更快
- 服务端环境不引入 React/DOM，避免 Node.js 环境报错
- 新增模块时必须检查三个入口文件（已在 pitfalls.md 中记录）
- tsup 配置需维护三组 entry + 对应的 external 列表
