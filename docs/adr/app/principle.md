# App · 原则级决策

> 遇到取舍时怎么选——Banyan 应用层的设计原则。

---

## 决策依赖图

```
┌───────────────────────────────────┐
│  P1 服务边界不可逾越               │
└────────────────┬──────────────────┘
                 │ enables
┌────────────────▼──────────────────┐
│  P2 单向依赖原则                   │
└────────────────┬──────────────────┘
                 │ enables
┌────────────────▼──────────────────┐
│  P3 可观测性后置（MVP 阶段）       │
└───────────────────────────────────┘
```

关系说明：

- P1→P2：服务边界不可逾越确立了进程间隔离规则，在此基础上单向依赖原则进一步规范了包级别的引用方向
- P2→P3：单向依赖 + 服务边界使系统具备良好分层后，才能放心在 MVP 阶段跳过可观测性建设——各服务独立清晰，问题定位即使缺少分布式追踪也不至于失控

---

## 架构纪律

### P1. 服务边界不可逾越

**✅ 已实施**

三个后端服务（banyan :3001、xiangdi :3002、knowledge :3003）职责严格划分，通过 HTTP 通信，禁止跨进程直接 import 业务模块。

**决策链：** Monorepo 环境下物理上可以直接 import -> 但这会导致部署耦合（改一个服务要重新部署另一个）-> 通过 HTTP 接口通信保持部署独立性 -> 每个服务可独立版本升级和扩缩容。

**约束：**

- banyan 后端禁止 import @banyuan/xiangdi-agent
- xiangdi-server 禁止访问 MongoDB
- knowledge-server 禁止访问 MongoDB，禁止 import xiangdi-agent 业务逻辑
- 服务间地址通过环境变量配置（XIANGDI_URL / KNOWLEDGE_URL）

---

### P2. 单向依赖原则

**✅ 已实施** · 细化 P1

包间依赖方向固定为：应用层 -> 能力层 -> 引擎核心层，禁止循环依赖。

**决策链：** 循环依赖导致构建顺序不确定 -> 增量构建失效 -> tree-shaking 失效 -> 维护时改一处牵一发动全身 -> 严格单向依赖确保每层可独立理解和测试。

**约束：**

- @banyuan/banvasgl 零外部 runtime dependencies（仅依赖 uuid），flow 子模块内嵌于包内
- @banyuan/banvasgl/flow/server 子路径可独立于图形运行时的渲染层被后端引用（tsup splitting）
- @banyuan/xiangdi-agent 通过 optional peerDep 依赖 @banyuan/banvasgl
- CI 可通过 pnpm why 或 depcheck 验证无循环依赖

---

## 数据层原则

### P3. 统一 MongoDB + 命名空间隔离

**✅ 已实施**

用户应用的业务数据与平台元数据统一存储在同一个 MongoDB 实例，通过 Collection 命名规则（`app_{appId}_{collectionName}`）实现应用级隔离。

**为什么不引入新数据库：** 现有后端已基于 MongoDB + Mongoose，MongoDB 的 schemaless 特性对低代码场景天然友好——用户随时可以加字段，不需要 migration。每个应用独立命名空间天然隔离。代价是关联查询能力弱于 SQL，但低代码场景数据模型通常较简单，可接受。

**决策链：** 低代码用户不理解 migration -> schemaless 友好 -> MongoDB 已在技术栈中 -> 不引入额外运维依赖 -> 命名空间隔离足够。

**约束：**

- 集合命名规则：`app_{appId}_{collectionName}`
- 动态 ORM 基于 AppSchema 动态生成 Mongoose Model
- 不适合场景：复杂多表 join（需在 UI 上明确告知限制）

---

## 阶段性取舍

### P4. 可观测性后置（MVP 阶段不建设）

**未实施** · 依赖 P1、P2

分布式追踪、结构化日志聚合、性能监控等可观测性基础设施在 MVP 阶段不建设，后续根据运维痛点按需引入。

**决策链：** 当前用户量小（单租户或极少量内部用户）-> 可观测性建设 ROI 低 -> 但架构上预留接入点（日志格式统一、请求 ID 透传）-> 未来有需求时可低成本接入 OpenTelemetry 等方案。

**约束：**

- 当前各服务使用 console.log + 请求级 requestId
- 服务间 HTTP 调用透传 X-Request-Id header
- 预留 OpenTelemetry SDK 接入点（中间件位置已确定）
