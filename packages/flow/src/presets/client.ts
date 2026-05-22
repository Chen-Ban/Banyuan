/**
 * createClientFlowRunner —— 前端预组装
 *
 * 包含：shared 全部 + client 全部
 * 适用于：BanvasGL 运行态、Electron 前端
 */

import { FlowRunner } from '../runtime/FlowRunner.js'
import { NodeExecutorRegistry } from '../executors/registry.js'
import { conditionExecutor, delayExecutor, setVariableExecutor, callFlowExecutor, subFlowExecutor } from '../executors/shared/index.js'
import { setDataExecutor, navigateExecutor, animateExecutor, setVisibleExecutor } from '../executors/client/index.js'

export function createClientFlowRunner(): FlowRunner {
  const registry = new NodeExecutorRegistry()
    // 共享节点
    .register('condition', conditionExecutor)
    .register('delay', delayExecutor)
    .register('setVariable', setVariableExecutor)
    .register('callFlow', callFlowExecutor)
    .register('subFlow', subFlowExecutor)
    // 前端节点
    .register('setData', setDataExecutor)
    .register('navigate', navigateExecutor)
    .register('animate', animateExecutor)
    .register('setVisible', setVisibleExecutor)

  return new FlowRunner(registry)
}
