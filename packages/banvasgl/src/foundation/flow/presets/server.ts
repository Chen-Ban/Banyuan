/**
 * createServerFlowRunner —— 后端预组装工厂
 *
 * 组装 source/compute + 后端 action 执行器。
 * 适用于 banyan 后端、XiangDi 服务、云函数执行。
 */

import { FlowRunner } from '../FlowRunner/index.js'
import { sourceExecutor } from '../executors/source.js'
import { mathExecutor, compareExecutor, logicExecutor, concatExecutor, formatExecutor, getExecutor } from '../executors/compute.js'
import { setVariableExecutor } from '../executors/action-client.js'
import { httpRequestExecutor, dbQueryExecutor, dbInsertExecutor, dbUpdateExecutor, dbDeleteExecutor } from '../executors/action-server.js'

export function createServerFlowRunner(): FlowRunner {
  return new FlowRunner({
    source: sourceExecutor,
    math: mathExecutor,
    compare: compareExecutor,
    logic: logicExecutor,
    concat: concatExecutor,
    format: formatExecutor,
    get: getExecutor,
    setVariable: setVariableExecutor,
    httpRequest: httpRequestExecutor,
    dbQuery: dbQueryExecutor,
    dbInsert: dbInsertExecutor,
    dbUpdate: dbUpdateExecutor,
    dbDelete: dbDeleteExecutor,
  })
}
