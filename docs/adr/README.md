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
| engine | @banyuan/banvasgl + @banyuan/flow | 引擎核心运行时（渲染、视图、流程执行器） |
| agent | @banyuan/xiangdi-agent + knowledge-server | AI 智能体系统（编排、记忆、知识检索） |
| app | banyan frontend/backend + xiangdi-server + electron | 应用层服务拓扑、前端架构、桌面平台 |
| schema | 跨边界数据契约 | 序列化格式、AI Projection、版本化存储 |
| product | 产品哲学 + 商业化 | 产品理念、授权模式、计费体系 |

---

## 能力域目录

### 引擎核心 `engine/`

@banyuan/banvasgl 图形引擎 + @banyuan/flow 流程执行引擎。渲染架构、视图体系、FlowRunner、事务管理。

| 粒度 | 文件 | 概述 |
|------|------|------|
| 架构级 | [`architecture.md`](./engine/architecture.md) | Canvas 2D 渲染、相机驱动无限画布、三态统一引擎、FlowRunner 独立为包、前后端执行器分离、七层架构 |
| 机制级 | [`mechanism.md`](./engine/mechanism.md) | 渲染优先级排序、TransactionManager 事务化、View 继承与 Addon mixin、layoutMode 统一容器、FlowSchema 节点图执行、Scene/View 生命周期与事件绑定、坐标与命中检测 |
| 原则级 | [`principle.md`](./engine/principle.md) | 渲染正确性优先、layoutMode 扩展不新增 ViewType、引擎纯净原则、FlowSchema 前后端一致性、单向数据流、最小化 AI 决策空间 |
| 协议级 | [`protocol.md`](./engine/protocol.md) | FlowContext 传递、Renderer 接口、App/Scene/View 通信、事务提交、NodeExecutor 注册、Hook 层通信、View 序列化 |

---

### AI 智能体 `agent/`

@banyuan/xiangdi-agent 编排系统 + knowledge-server 知识检索服务。Agent 管线、记忆系统、知识体系、检索引擎。

| 粒度 | 文件 | 概述 |
|------|------|------|
| 架构级 | [`architecture.md`](./agent/architecture.md) | Orchestrator+SubAgent 统一管线、上下文 Pull 架构、LangGraph 编排、知识 Tool 消费模式、三领域三层知识体系 |
| 机制级 | [`mechanism.md`](./agent/mechanism.md) | 记忆系统、命名空间隔离、Checkpoint 断点、冲突消歧、intent 续接、审计回退、ONNX+LanceDB 混合检索、知识保活 CI/CD |
| 原则级 | [`principle.md`](./agent/principle.md) | 工程化优先、Agentic Loop、全流程自动验收后移、知识本质（决策和生成）、格式自动/语义人工、知识版本隔离 |
| 协议级 | [`protocol.md`](./agent/protocol.md) | Dialogue 状态机、SSE 事件协议、Spec 协议、SubAgent 统一协议、上下文拉取 API、工具集三层结构、知识种子格式、HTTP 检索协议、CI knowledge-guard |

---

### 应用平台 `app/`

Banyan 前后端 + xiangdi-server + Electron 桌面壳。服务拓扑、构建预览、Bridge 抽象、环境配置。

| 粒度 | 文件 | 概述 |
|------|------|------|
| 架构级 | [`architecture.md`](./app/architecture.md) | 知识服务独立部署、XiangDi 无状态设计、Monorepo 回归、Electron 壳+Web 核心 |
| 机制级 | [`mechanism.md`](./app/mechanism.md) | AI 请求 SSE 代理、构建与预览服务、Bridge 平台能力抽象 |
| 原则级 | [`principle.md`](./app/principle.md) | 服务边界不可逾越、单向依赖原则、可观测性后置 |
| 协议级 | [`protocol.md`](./app/protocol.md) | 服务间 HTTP/SSE 通信协议、Electron IPC 协议、环境变量配置协议 |

---

### 数据契约 `schema/`

跨边界序列化格式、AI Projection 转换、版本化存储、数据迁移。

| 粒度 | 文件 | 概述 |
|------|------|------|
| 架构级 | [`architecture.md`](./schema/architecture.md) | 全量 JSON 唯一基座、版本化三表 append-only 存储 |
| 机制级 | [`mechanism.md`](./schema/mechanism.md) | AI Projection 双向转换、数据迁移外置到 CI/CD、物料序列化 |
| 原则级 | [`principle.md`](./schema/principle.md) | 引擎只认当前版本、append-only 不可篡改、AI Projection 视为 Breaking Change |
| 协议级 | [`protocol.md`](./schema/protocol.md) | Full JSON 格式规范、AI Projection 格式规范、独立版本号协议 |

---

### 产品哲学 `product/`

产品理念、授权模式、商业化体系。

| 粒度 | 文件 | 概述 |
|------|------|------|
| 架构级 | [`architecture.md`](./product/architecture.md) | AI 80%/人 20% 产品哲学、商业化三子系统架构 |
| 机制级 | [`mechanism.md`](./product/mechanism.md) | AI 用量配额计量、RBAC 权限控制 |
| 原则级 | [`principle.md`](./product/principle.md) | AGPL+商业双授权、配额耗尽降级不断服 |
| 协议级 | [`protocol.md`](./product/protocol.md) | Plan 关联计费协议 |
