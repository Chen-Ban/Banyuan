/**
 * createClientFlowRunner —— 前端预组装工厂
 *
 * 组装 source / compute / control / function + 前端 action 执行器，
 * 创建并返回 `FlowRunner<FrontendCapProxy>` 实例。
 *
 * 注册的执行器：
 * - **Source**：Literal、Context
 * - **Compute**：Math、Compare、Logic、Concat、Format、Get
 * - **Control**：Condition、Loop、Parallel、Return
 * - **Function**：Function
 * - **Action（前端）**：SetVariable、SetViewData、SetViewVisible、PlayAnimation、Navigate、CloudFunction
 *
 * cap 由调用方显式传入，类型为 `FrontendCapProxy`，
 * 需提供 `navigate` / `setViewData` / `setViewVisible` / `playAnimation` / `httpClient`。
 *
 * @param cap - 前端能力代理
 * @returns 预组装好的 FlowRunner 实例
 *
 * @example
 * ```typescript
 * const runner = createClientFlowRunner({
 *   navigate: async (target) => router.push(target),
 *   setViewData: (viewId, key, value) => { app.getScene()?.getView(viewId)?.setData({ [key]: value }); },
 *   setViewVisible: (viewId, visible) => { app.getScene()?.getView(viewId)?.setVisible(visible); },
 *   playAnimation: (viewId, animationId) => { /* ... * / },
 *   httpClient: { request: async (m, u, h, b) => fetch(u, { method: m, headers: h, body: JSON.stringify(b) }).then(r => r.json()) },
 * });
 * ```
 */

import { FlowRunner } from "../FlowRunner/index.js";
import type { FrontendCapProxy } from "@/types/foundation/flow/context.js";
import type { ExecutorRegistry } from "@/types/foundation/flow/executor.js";
import { sourceExecutor } from "../executors/source.js";
import {
  mathExecutor,
  compareExecutor,
  logicExecutor,
  concatExecutor,
  formatExecutor,
  getExecutor,
} from "../executors/compute.js";
import {
  setVariableExecutor,
  setViewDataExecutor,
  setViewVisibleExecutor,
  playAnimationExecutor,
  navigateExecutor,
  cloudFunctionExecutor,
} from "../executors/action.js";
import {
  conditionExecutor,
  loopExecutor,
  parallelExecutor,
  returnExecutor,
} from "../executors/control.js";
import { functionExecutor } from "../executors/function.js";
import { NodeKind } from "@/types/foundation/flow/enums.js";

export function createClientFlowRunner(cap: FrontendCapProxy): FlowRunner<FrontendCapProxy> {
  const registry: ExecutorRegistry<FrontendCapProxy> = {
    [NodeKind.Literal]: sourceExecutor,
    [NodeKind.Context]: sourceExecutor,
    [NodeKind.Math]: mathExecutor,
    [NodeKind.Compare]: compareExecutor,
    [NodeKind.Logic]: logicExecutor,
    [NodeKind.Concat]: concatExecutor,
    [NodeKind.Format]: formatExecutor,
    [NodeKind.Get]: getExecutor,
    [NodeKind.SetVariable]: setVariableExecutor,
    [NodeKind.SetViewData]: setViewDataExecutor,
    [NodeKind.SetViewVisible]: setViewVisibleExecutor,
    [NodeKind.PlayAnimation]: playAnimationExecutor,
    [NodeKind.Navigate]: navigateExecutor,
    [NodeKind.CloudFunction]: cloudFunctionExecutor,
    [NodeKind.Condition]: conditionExecutor,
    [NodeKind.Loop]: loopExecutor,
    [NodeKind.Parallel]: parallelExecutor,
    [NodeKind.Return]: returnExecutor,
    [NodeKind.Function]: functionExecutor,
  };

  return new FlowRunner(registry, cap);
}
