/**
 * createServerFlowRunner —— 后端预组装工厂
 *
 * 注册 source/compute/control + 后端 action 执行器。
 * 适用于 banyan 后端、XiangDi 服务、云函数执行。
 */

import { FlowRunner } from '../runtime/FlowRunner.js'
import { NodeExecutorRegistry } from '../executors/registry.js'
import { sourceExecutor } from '../executors/source.js'
import { mathExecutor, compareExecutor, logicExecutor, concatExecutor, formatExecutor, getExecutor } from '../executors/compute.js'
import { setVariableExecutor } from '../executors/action-client.js'
import { httpRequestExecutor, dbQueryExecutor, dbInsertExecutor, dbUpdateExecutor, dbDeleteExecutor } from '../executors/action-server.js'

export function createServerFlowRunner(): FlowRunner {
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

  // action (后端)
  registry.register(setVariableExecutor)
  registry.register(httpRequestExecutor)
  registry.register(dbQueryExecutor)
  registry.register(dbInsertExecutor)
  registry.register(dbUpdateExecutor)
  registry.register(dbDeleteExecutor)

  // 注：control 节点由 FlowRunner 内置处理

  return new FlowRunner(registry)
}
