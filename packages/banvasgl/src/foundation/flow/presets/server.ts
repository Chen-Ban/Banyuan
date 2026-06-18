/**
 * createServerFlowRunner —— 后端预组装工厂
 *
 * 组装 source / compute / control / function + 后端 action 执行器，
 * 创建并返回 `FlowRunner<BackendCapProxy>` 实例。
 *
 * 注册的执行器：
 * - **Source**：Literal、Context
 * - **Compute**：Math、Compare、Logic、Concat、Format、Get
 * - **Control**：Condition、Loop、Parallel、Return
 * - **Function**：Function
 * - **Action（后端）**：SetVariable、HttpRequest、DbQuery、DbInsert、DbUpdate、DbDelete
 *
 * cap 由调用方显式传入，类型为 `BackendCapProxy`，
 * 需提供 `db`（含 query/insert/update/delete）和 `httpClient`。
 *
 * @param cap - 后端能力代理
 * @returns 预组装好的 FlowRunner 实例
 *
 * @example
 * ```typescript
 * const runner = createServerFlowRunner({
 *   db: {
 *     query: async (coll, filter) => CollectionModel.find({ collection: coll, ...filter }),
 *     insert: async (coll, doc) => { const r = await CollectionModel.create({ collection: coll, ...doc }); return { id: r._id.toString() }; },
 *     update: async (coll, filter, update) => CollectionModel.updateMany({ collection: coll, ...filter }, update),
 *     delete: async (coll, filter) => CollectionModel.deleteMany({ collection: coll, ...filter }),
 *   },
 *   httpClient: { request: async (m, u, h, b) => { /* ... * / } },
 * });
 * ```
 */

import { FlowRunner } from "../FlowRunner/index.js";
import type { BackendCapProxy } from "@/types/foundation/flow/context.js";
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
  httpRequestExecutor,
  dbQueryExecutor,
  dbInsertExecutor,
  dbUpdateExecutor,
  dbDeleteExecutor,
} from "../executors/action.js";
import {
  conditionExecutor,
  loopExecutor,
  parallelExecutor,
  returnExecutor,
} from "../executors/control.js";
import { functionExecutor } from "../executors/function.js";
import { NodeKind } from "@/types/foundation/flow/enums.js";

export function createServerFlowRunner(cap: BackendCapProxy): FlowRunner<BackendCapProxy> {
  const registry: ExecutorRegistry<BackendCapProxy> = {
    [NodeKind.Literal]: sourceExecutor,
    [NodeKind.Context]: sourceExecutor,
    [NodeKind.Math]: mathExecutor,
    [NodeKind.Compare]: compareExecutor,
    [NodeKind.Logic]: logicExecutor,
    [NodeKind.Concat]: concatExecutor,
    [NodeKind.Format]: formatExecutor,
    [NodeKind.Get]: getExecutor,
    [NodeKind.SetVariable]: setVariableExecutor,
    [NodeKind.HttpRequest]: httpRequestExecutor,
    [NodeKind.DbQuery]: dbQueryExecutor,
    [NodeKind.DbInsert]: dbInsertExecutor,
    [NodeKind.DbUpdate]: dbUpdateExecutor,
    [NodeKind.DbDelete]: dbDeleteExecutor,
    [NodeKind.Condition]: conditionExecutor,
    [NodeKind.Loop]: loopExecutor,
    [NodeKind.Parallel]: parallelExecutor,
    [NodeKind.Return]: returnExecutor,
    [NodeKind.Function]: functionExecutor,
  };

  return new FlowRunner(registry, cap);
}
