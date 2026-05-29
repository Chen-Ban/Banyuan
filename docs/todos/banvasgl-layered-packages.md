# ~~TODO: BanvasGL 分层拆包~~ （已废弃）

> 创建时间：2025-07-18  
> **废弃时间：2026-05-28**
>
> 关联决策：[ADR-016](../adr/016-banvasgl-layered-packages.md)（已废弃）
>
> **废弃原因**：ADR-016 已于 2026-05-28 废弃。实践证明 BanvasGL 作为单一引擎包的内聚性优于物理拆包——FlowViews 与核心 View 体系共享 addon 管线、事件系统、渲染管线、TransactionManager 等大量基础设施，物理拆分会导致频繁跨包 breaking change。当前通过目录隔离（`src/view/FlowViews/`）已足够清晰。Flow 执行器（`@banyuan/flow`）的独立拆分已完成，视图层保持在 banvasgl 内。

---

本文件中的所有任务项不再执行。
