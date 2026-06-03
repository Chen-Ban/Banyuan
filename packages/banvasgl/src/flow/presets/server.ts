/**
 * createServerFlowRunner —— 后端预组装工厂
 *
 * 设计意图：一行代码获得完整配置的后端 FlowRunner。
 *
 * 同一个 FlowSchema（AST）可以在前端和后端执行，差异仅在于：
 *   1. registry 中注册了哪些执行器（操作语义不同）
 *   2. context.env 中注入了哪些职责能力（前端操控视图 vs 后端操作数据）
 *
 * server preset 注册后端执行器（dbQuery/httpRequest/script 等），
 * 配合 ServerFlowContext 注入 db、httpClient 能力。
 *
 * 包含：shared 全部（condition/delay/setVariable/callFlow/subFlow/return/forEach/parallel）
 *       + server 全部（dbQuery/dbInsert/dbUpdate/dbDelete/httpRequest/transform/script）
 * 适用于：banyan 后端、XiangDi 服务、云函数执行
 */

import { FlowRunner } from '../runtime/FlowRunner.js'
import { NodeExecutorRegistry } from '../executors/registry.js'
import { conditionExecutor, delayExecutor, setVariableExecutor, callFlowExecutor, subFlowExecutor, returnExecutor, forEachExecutor, parallelExecutor } from '../executors/shared/index.js'
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
    .register('return', returnExecutor)
    .register('forEach', forEachExecutor)
    .register('parallel', parallelExecutor)
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
