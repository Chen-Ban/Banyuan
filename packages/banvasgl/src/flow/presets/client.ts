/**
 * createClientFlowRunner —— 前端预组装工厂
 *
 * 设计意图：一行代码获得完整配置的前端 FlowRunner。
 *
 * preset 是「语义表的预制组合」——将前端需要的所有执行器
 * （shared 共享节点 + client 前端节点）注册到同一个 registry 中。
 * App 只需 `const runner = createClientFlowRunner()` 即可。
 *
 * 包含：shared 全部（condition/delay/setVariable/callFlow/subFlow/return/forEach/parallel）
 *       + client 全部（setData/navigate/animate/setVisible）
 * 适用于：BanvasGL 运行态、Electron 前端
 */

import { FlowRunner } from '../runtime/FlowRunner.js'
import { NodeExecutorRegistry } from '../executors/registry.js'
import { conditionExecutor, delayExecutor, setVariableExecutor, callFlowExecutor, subFlowExecutor, returnExecutor, forEachExecutor, parallelExecutor } from '../executors/shared/index.js'
import { setDataExecutor, navigateExecutor, animateExecutor, setVisibleExecutor } from '../executors/client/index.js'

export function createClientFlowRunner(): FlowRunner {
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
    // 前端节点
    .register('setData', setDataExecutor)
    .register('navigate', navigateExecutor)
    .register('animate', animateExecutor)
    .register('setVisible', setVisibleExecutor)

  return new FlowRunner(registry)
}
