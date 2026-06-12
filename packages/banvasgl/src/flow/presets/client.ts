/**
 * createClientFlowRunner —— 前端预组装工厂
 *
 * 注册 source/compute/control + 前端 action 执行器。
 * 适用于 BanvasGL 运行态、Electron 前端。
 */

import { FlowRunner } from '../runtime/FlowRunner.js'
import { NodeExecutorRegistry } from '../executors/registry.js'
import { sourceExecutor } from '../executors/source.js'
import { mathExecutor, compareExecutor, logicExecutor, concatExecutor, formatExecutor, getExecutor } from '../executors/compute.js'
import { setVariableExecutor, navigateExecutor, callFlowExecutor } from '../executors/action-client.js'

export function createClientFlowRunner(): FlowRunner {
  const registry = new NodeExecutorRegistry()

  // source
  registry.register(sourceExecutor)

  // compute
  registry.register(mathExecutor)
  registry.register(compareExecutor)
  registry.register(logicExecutor)
  registry.register(concatExecutor)
  registry.register(formatExecutor)
  registry.register(getExecutor)

  // action (前端)
  registry.register(setVariableExecutor)
  registry.register(navigateExecutor)
  registry.register(callFlowExecutor)

  // 注：control 节点（condition/while/forEach/parallel/subFlow）
  // 由 FlowRunner 内置处理，无需注册到 registry

  return new FlowRunner(registry)
}
