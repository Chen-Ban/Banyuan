/**
 * @banyuan/deploy-agent 公共 API
 */

export { DeployAgent } from './DeployAgent.js';
export { scaffoldProject, scaffoldServer } from './scaffold.js';
export type { ScaffoldServerOptions } from './scaffold.js';
export type {
  AgentConfig,
  AgentMessage,
  AgentMessageType,
  AgentOutMessageType,
  DeployType,
  FieldType,
  FieldDef,
  CollectionDef,
  CloudFunctionDef,
  DeployRequest,
  DeployProgress,
  DeployResult,
  UIDefinition,
} from './types.js';
