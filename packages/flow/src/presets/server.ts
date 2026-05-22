/**
 * createServerFlowRunner —— 后端预组装
 *
 * 包含：shared 全部 + server 全部
 * 适用于：banyan 后端、XiangDi 服务、云函数执行
 */

import { FlowRunner } from '../runtime/FlowRunner.js'
import { NodeExecutorRegistry } from '../executors/registry.js'
import { conditionExecutor, delayExecutor, setVariableExecutor, callFlowExecutor, subFlowExecutor } from '../executors/shared/index.js'
import {
  dbQueryExecutor,
  dbInsertExecutor,
  dbUpdateExecutor,
  dbDeleteExecutor,
  httpRequestExecutor,
  transformExecutor,
  scriptExecutor,
} from '../executors/server/index.js'

export function createServerFlowRunner(): FlowRunner {
  const registry = new NodeExecutorRegistry()
    // 共享节点
    .register('condition', conditionExecutor)
    .register('delay', delayExecutor)
    .register('setVariable', setVariableExecutor)
    .register('callFlow', callFlowExecutor)
    .register('subFlow', subFlowExecutor)
    // 后端节点
    .register('dbQuery', dbQueryExecutor)
    .register('dbInsert', dbInsertExecutor)
    .register('dbUpdate', dbUpdateExecutor)
    .register('dbDelete', dbDeleteExecutor)
    .register('httpRequest', httpRequestExecutor)
    .register('transform', transformExecutor)
    .register('script', scriptExecutor)

  return new FlowRunner(registry)
}
