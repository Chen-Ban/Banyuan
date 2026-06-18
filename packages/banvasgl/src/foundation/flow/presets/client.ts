/**
 * createClientFlowRunner —— 前端预组装工厂
 *
 * 组装 source/compute + 前端 action 执行器。
 * cap 由调用方显式传入，类型为 FrontendCapProxy。
 */

import { FlowRunner } from "../FlowRunner/index.js";
import type { FrontendCapProxy } from "@/types/foundation/flow/context.js";
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
  navigateExecutor,
} from "../executors/action-client.js";

export function createClientFlowRunner(cap: FrontendCapProxy): FlowRunner {
  return new FlowRunner(
    {
      literal: sourceExecutor,
      context: sourceExecutor,
      math: mathExecutor,
      compare: compareExecutor,
      logic: logicExecutor,
      concat: concatExecutor,
      format: formatExecutor,
      get: getExecutor,
      setVariable: setVariableExecutor,
      navigate: navigateExecutor,
    },
    cap,
  );
}
