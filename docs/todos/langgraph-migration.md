# TODO: XiangDi → LangGraph 迁移

> 关联决策：[ADR-014](../adr/014-langgraph-migration-plan.md)

## 前置调研

- [ ] 评估 `@langchain/langgraph` JS/TS SDK 最新版本稳定性
- [ ] 验证 `Send()` API 在 TS 版本中的并行执行能力（对标我们的 SubAgentRunner）
- [ ] 验证 Subgraph 隔离性（状态隔离、独立 tool 注册）
- [ ] 验证 Checkpointer 在 MongoDB 场景下的集成方式
- [ ] 评估 `interrupt_before` 机制能否替代当前的 HumanGate Promise 挂起
- [ ] 调研 LangGraph Studio 本地部署方案（可观测性收益）

## 迁移步骤（按优先级）

### Phase 1: AgentLoop → create_react_agent

- [ ] 用 `create_react_agent` 或自定义 think→act 图替换 `AgentLoop.run()` 的 while 循环
- [ ] 将 `ContextManager` 的消息裁剪逻辑迁移到 LangGraph 的 State reducer
- [ ] 验证 `StreamBridge` 的所有事件能通过 `astream_events` 等价发出
- [ ] 保持 `apps/xiangdi` 路由层接口不变

### Phase 2: HarnessRunner → 图节点链

- [ ] 将 Guard → AgentLoop → Checkpoint 流程建模为 LangGraph 节点
- [ ] 用条件边实现 Guard 失败回退
- [ ] 用 `interrupt_before` 实现 HumanGate 人工审批
- [ ] 迁移 SpecPlanner 为图的起始节点

### Phase 3: Orchestration → Send + Subgraph

- [ ] 将 LayoutPlanner → SubAgentRunner → Assembler → Auditor 管线建模为 LangGraph 图
- [ ] 用 `Send()` 替换手写 Semaphore 并行控制
- [ ] 用 Subgraph 替换手动创建独立 AgentLoop 实例
- [ ] 验证审计循环的条件边实现

### Phase 4: 收尾

- [ ] 移除已被替换的自研基础设施代码（AgentLoop、ContextManager、StreamBridge、AgentLifecycle）
- [ ] 更新 `packages/XiangDi/src/index.ts` 导出（公共 API 保持兼容）
- [ ] 更新 README 和 AGENTS.md
- [ ] 性能对比测试（延迟、并发吞吐）

## 不迁移清单

以下模块保留自研，只是被 LangGraph 节点内部调用：

- `schema/AISchema.ts` + `converters.ts`
- `tools/BanvasToolProtocol.ts` + `createBanvasToolRegistry.ts`
- `llm/LLMRouter.ts`（多 Provider 路由）
- `knowledge/`（LanceDB + graphology RAG 实现）
- `prompts/`（系统提示词内容）
- `spec/types.ts`（ProjectSpec / ChangeSpec 数据结构）
