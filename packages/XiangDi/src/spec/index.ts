/**
 * 相地 · Spec 模块
 *
 * SDD 两层 Spec 架构的统一出口：
 *
 *   ProjectSpec（项目级规范）
 *   └── 从 AGENTS.md / xiangdi.spec.md 加载
 *   └── 注入 system prompt，约束 Agent 全局行为
 *
 *   ChangeSpec（变更级过程文件）
 *   └── 由用户输入触发生成
 *   └── 包含 proposal + specs + tasks
 *   └── 驱动 Harness 执行
 */

export type {
  ProjectSpecRaw,
  ProjectSpec,
  ProjectSpecLoader,
  ChangeStatus,
  ChangeTask,
  ChangeSpec,
  ChangeSpecStore,
} from "./types.js";

export {
  FileProjectSpecLoader,
  InlineProjectSpecLoader,
  parseProjectSpec,
  DEFAULT_SPEC_FILE_CANDIDATES,
} from "./ProjectSpecLoader.js";

export { ChangeSpecBuilder } from "./ChangeSpecBuilder.js";
export { MemoryChangeSpecStore } from "./MemoryChangeSpecStore.js";
