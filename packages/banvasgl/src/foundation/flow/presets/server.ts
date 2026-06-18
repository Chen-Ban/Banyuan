/**
 * createServerFlowRunner —— 后端预组装工厂
 *
 * 组装 source/compute + 后端 action 执行器。
 * cap 由调用方显式传入，类型为 BackendCapProxy。
 */

import { FlowRunner } from '../FlowRunner/index.js'
import { NodeKind } from '@/types/foundation/flow/enums.js'
import type { BackendCapProxy } from '@/types/foundation/flow/context.js'
import { sourceExecutor } from '../executors/source.js'
import { mathExecutor, compareExecutor, logicExecutor, concatExecutor, formatExecutor, getExecutor } from '../executors/compute.js'
import { setVariableExecutor } from '../executors/action-client.js'
import { httpRequestExecutor, cloudFunctionExecutor, dbQueryExecutor, dbInsertExecutor, dbUpdateExecutor, dbDeleteExecutor } from '../executors/action-server.js'

export function createServerFlowRunner(cap: BackendCapProxy): FlowRunner {
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
    httpRequest: httpRequestExecutor,
    cloudFunction: cloudFunctionExecutor,
    dbQuery: dbQueryExecutor,
    dbInsert: dbInsertExecutor,
    dbUpdate: dbUpdateExecutor,
    dbDelete: dbDeleteExecutor,
  }, cap as any)
}
