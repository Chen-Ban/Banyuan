# App · 原则级决策

> 遇到取舍时怎么选——Banyan 应用层的设计原则。

---

## 服务边界不可逾越

**✅ 已实施**

三个后端服务（banyan :3001、xiangdi :3002、knowledge :3003）职责严格划分，通过 HTTP 通信，禁止跨进程直接 import 业务模块。

**决策链：** Monorepo 环境下物理上可以直接 import -> 但这会导致部署耦合（改一个服务要重新部署另一个）-> 通过 HTTP 接口通信保持部署独立性 -> 每个服务可独立版本升级和扩缩容。

**约束：**

- banyan 后端禁止 import @banyuan/xiangdi-agent
- xiangdi-server 禁止访问 MongoDB
- knowledge-server 禁止访问 MongoDB，禁止 import xiangdi-agent 业务逻辑
- 服务间地址通过环境变量配置（XIANGDI_URL / KNOWLEDGE_URL）

---

## 单向依赖原则

**✅ 已实施**

包间依赖方向固定为：应用层 -> 能力层 -> 引擎核心层，禁止循环依赖。

**决策链：** 循环依赖导致构建顺序不确定 -> 增量构建失效 -> tree-shaking 失效 -> 维护时改一处牵一发动全身 -> 严格单向依赖确保每层可独立理解和测试。

**约束：**

- @banyuan/flow 无任何 runtime dependencies（纯独立包）
- @banyuan/banvasgl 仅依赖 @banyuan/flow（类型层 + 运行时 FlowRunner）
- @banyuan/xiangdi-agent 通过 optional peerDep 依赖 @banyuan/banvasgl
- CI 可通过 pnpm why 或 depcheck 验证无循环依赖

---

## 可观测性后置（MVP 阶段不建设）

**未实施**

分布式追踪、结构化日志聚合、性能监控等可观测性基础设施在 MVP 阶段不建设，后续根据运维痛点按需引入。

**决策链：** 当前用户量小（单租户或极少量内部用户）-> 可观测性建设 ROI 低 -> 但架构上预留接入点（日志格式统一、请求 ID 透传）-> 未来有需求时可低成本接入 OpenTelemetry 等方案。

**约束：**

- 当前各服务使用 console.log + 请求级 requestId
- 服务间 HTTP 调用透传 X-Request-Id header
- 预留 OpenTelemetry SDK 接入点（中间件位置已确定）
