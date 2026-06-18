/**
 * createClientFlowRunner —— 前端预组装工厂
 *
 * 组装 source/compute + 前端 action 执行器。
 * 适用于 BanvasGL 运行态、Electron 前端。
 */

import { FlowRunner } from '../FlowRunner/index.js'
import { NodeKind } from '@/types/foundation/flow/enums.js'
import { sourceExecutor } from '../executors/source.js'
import { mathExecutor, compareExecutor, logicExecutor, concatExecutor, formatExecutor, getExecutor } from '../executors/compute.js'
import { setVariableExecutor, navigateExecutor } from '../executors/action-client.js'

export function createClientFlowRunner(): FlowRunner {
  return new FlowRunner({
    [NodeKind.Literal]: sourceExecutor,
    [NodeKind.Context]: sourceExecutor,
    math: mathExecutor,
    compare: compareExecutor,
    logic: logicExecutor,
    concat: concatExecutor,
    format: formatExecutor,
    get: getExecutor,
    setVariable: setVariableExecutor,
    navigate: navigateExecutor,
  })
}
