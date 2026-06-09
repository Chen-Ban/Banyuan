# ADR 索引

架构决策记录（Architecture Decision Records）按架构层域分目录存放。每个域的决策按四个粒度组织为独立文件：

| 粒度 | 回答的问题 |
|------|-----------|
| 架构级（architecture） | 整体怎么组织 |
| 机制级（mechanism） | 某个机制怎么工作 |
| 原则级（principle） | 遇到取舍时怎么选 |
| 协议级（protocol） | 模块间怎么通信 |

新决策按粒度追加到对应文件。过时的决策写入取代它的决策的「反例」中，不单独保留文件。

---

## 状态说明

| 状态 | 含义 |
|------|------|
| ✅ 已实施 | 决策已在代码中落地 |
| 未实施 | 决策已确认，代码尚未实现 |

---

## 域划分标准

划分依据是「这个决策失效时，哪个 npm 包 / 服务需要改代码？」——按架构层级归属：

| 域 | 涵盖 | 判断标准 |
|----|------|----------|
| engine | @banyuan/banvasgl（含 flow 子模块） | 面向声明式 UI 的 2D 图形运行时（渲染、视图、流程执行器） |
| agent | @banyuan/xiangdi-agent + knowledge-server | AI 智能体系统（编排、记忆、知识检索） |
| app | banyan frontend/backend + xiangdi-server + electron | 应用层服务拓扑、前端架构、桌面平台 |
| schema | 跨边界数据契约 | 序列化格式、AI Projection、版本化存储 |
| product | 产品哲学 + 商业化 | 产品理念、授权模式、计费体系 |

---

## 能力域目录

### 引擎核心 `engine/`

@banyuan/banvasgl 面向声明式 UI 的 2D 图形运行时（含流程控制，定位见 engine/architecture.md A0）。渲染架构、交互状态机、视图体系、布局系统、动画系统、FlowRunner、事务管理、序列化、物料系统。

每个文件内的决策按逻辑分组排列，文件头部附 ASCII 决策依赖图标注 enables/refines/drives/complements 等关系。

| 粒度 | 文件 | 分组概述 |
|------|------|---------|
| 架构级 | [`architecture.md`](./engine/architecture.md) | 顶层组织（A1 八层架构）→ 渲染（A2→A2a）→ 交互（A3→A3a）→ 视图（A4→A4a）→ Flow（A5→A5a）→ 序列化（A6→A6a）→ 物料（A7→A7a）→ 宿主集成（A8→A8a） |
| 机制级 | [`mechanism.md`](./engine/mechanism.md) | 渲染管线（M1→M2→M3）→ 数据管理（M4→M5→M6）→ 布局系统（M7→M8）→ 交互与对齐（M9⇄M10）→ 动画系统（M11→M12→M13）→ 流程执行（M14→M15/M16）→ 外部订阅（M17） |
| 原则级 | [`principle.md`](./engine/principle.md) | 设计哲学（P1→P2/P3/P4）→ 渲染层（P5→P5a）→ 数据管理（P6→P6a）→ 架构边界（P7→P7a）→ 交互设计（P8） |
| 协议级 | [`protocol.md`](./engine/protocol.md) | 视图树通信（C1→C2/C3→C4）→ 流程执行（C5→C6→C7）→ 渲染（C8）→ 交互（C9→C10）→ 宿主集成（C11→C12）→ 属性适配（C13） |

---

### AI 智能体 `agent/`

@banyuan/xiangdi-agent 编排系统 + knowledge-server 知识检索服务。Agent 管线、记忆系统、知识体系、检索引擎。

每个文件内的决策按逻辑分组排列，文件头部附 ASCII 决策依赖图标注 enables/refines/drives/complements 等关系。

| 粒度 | 文件 | 分组概述 |
|------|------|---------|
| 架构级 | [`architecture.md`](./agent/architecture.md) | 管线编排（A1→A2/A3）→ 知识架构（A4→A5） |
| 机制级 | [`mechanism.md`](./agent/mechanism.md) | 记忆与状态（M1→M2, M3⇄M4）→ 流程控制（M5←M6）→ 知识检索（M7→M8） |
| 原则级 | [`principle.md`](./agent/principle.md) | 执行哲学（P1→P2/P3）→ 知识哲学（P4→P5/P6） |
| 协议级 | [`protocol.md`](./agent/protocol.md) | 会话与事件（C1→C2）→ Agent 协议（C3→C4←C5, C4→C6）→ 知识服务协议（C7→C8→C9） |

---

### 应用平台 `app/`

Banyan 前后端 + xiangdi-server + Electron 桌面壳。服务拓扑、构建预览、Bridge 抽象、环境配置。

每个文件内的决策按逻辑分组排列，文件头部附 ASCII 决策依赖图标注 enables/refines/drives/complements 等关系。

| 粒度 | 文件 | 分组概述 |
|------|------|---------|
| 架构级 | [`architecture.md`](./app/architecture.md) | 服务拓扑（A1→A2）→ 平台与工程策略（A3→A4）→ 预览态服务拓扑（A5） |
| 机制级 | [`mechanism.md`](./app/mechanism.md) | 后端服务机制（M1⇄M2）→ 平台适配机制（M3） |
| 原则级 | [`principle.md`](./app/principle.md) | 架构纪律（P1→P2）→ 数据层原则（P3）→ 阶段性取舍（P4←P1/P2）→ 产品形态取舍（P5） |
| 协议级 | [`protocol.md`](./app/protocol.md) | 后端通信协议（C1→C3）→ 桌面端通信协议（C2⇄C1） |

---

### 数据契约 `schema/`

跨边界序列化格式、AI Projection 转换、版本化存储、数据迁移。

每个文件内的决策按逻辑分组排列，文件头部附 ASCII 决策依赖图标注 enables/refines/drives/complements 等关系。

| 粒度 | 文件 | 分组概述 |
|------|------|---------|
| 架构级 | [`architecture.md`](./schema/architecture.md) | 数据格式（A1）→ 版本化存储（A2） |
| 机制级 | [`mechanism.md`](./schema/mechanism.md) | 格式转换（M1）→ 版本升级（M2）→ 片段复用（M3） |
| 原则级 | [`principle.md`](./schema/principle.md) | 版本格式原则（P1→P2）→ AI 协作原则（P3） |
| 协议级 | [`protocol.md`](./schema/protocol.md) | 序列化格式（C1→C2）→ 版本号协议（C3） |

---

### 产品哲学 `product/`

产品理念、授权模式、商业化体系。

每个文件内的决策按逻辑分组排列，文件头部附 ASCII 决策依赖图标注 enables/refines/drives/complements 等关系。

| 粒度 | 文件 | 分组概述 |
|------|------|---------|
| 架构级 | [`architecture.md`](./product/architecture.md) | 产品哲学（A1）→ 商业化架构（A2←A1） |
| 机制级 | [`mechanism.md`](./product/mechanism.md) | 计费维度（M1）⇄ 权限维度（M2），经套餐关联 |
| 原则级 | [`principle.md`](./product/principle.md) | 授权模式（P1）→ 运营体验（P2←A1） |
| 协议级 | [`protocol.md`](./product/protocol.md) | 子系统协调（C1←A2，关联支付/M1/M2 三子系统） |
