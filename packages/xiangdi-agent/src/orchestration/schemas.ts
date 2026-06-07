/**
 * 五个 SubAgent 的结构化输出 Schema
 *
 * ADR-041: 每个 SubAgent 的产出都有对应的 Zod schema 用于运行时验证。
 * TypeScript 类型通过 z.infer<> 派生，保证类型定义与验证规则一致。
 */
import { z } from 'zod'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. StructuredRequirements（需求解析 SubAgent 产出）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const FeatureSchema = z.object({
  id: z.string().describe('功能唯一标识，如 "feat-login"'),
  title: z.string().describe('功能标题'),
  description: z.string().describe('功能详细描述'),
  userStory: z.string().optional().describe('用户故事：As a...I want...So that...'),
  priority: z.enum(['must', 'should', 'could']).describe('优先级'),
})

export const StructuredRequirementsSchema = z.object({
  features: z.array(FeatureSchema).min(1).describe('功能列表'),
  constraints: z.array(z.string()).describe('技术/业务约束'),
  outOfScope: z.array(z.string()).optional().describe('明确不做的事项'),
})

export type Feature = z.infer<typeof FeatureSchema>
export type StructuredRequirements = z.infer<typeof StructuredRequirementsSchema>

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. UIDesignSpec（UI 设计 SubAgent 产出）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const ComponentSpecSchema = z.object({
  id: z.string().describe('组件唯一标识'),
  type: z.string().describe('BanvasGL ViewType'),
  description: z.string().describe('组件功能描述'),
  dataBinding: z.string().optional().describe('绑定的数据字段描述'),
})

export const InteractionSpecSchema = z.object({
  trigger: z.string().describe('触发条件，如"点击提交按钮"'),
  action: z.string().describe('执行动作，如"调用创建订单云函数"'),
  targetComponent: z.string().describe('触发组件 ID'),
})

export const PageSpecSchema = z.object({
  id: z.string().describe('页面 ID（对应 Scene ID）'),
  name: z.string().describe('页面名称'),
  layout: z.string().describe('布局描述（自然语言）'),
  components: z.array(ComponentSpecSchema).describe('组件列表'),
  interactions: z.array(InteractionSpecSchema).describe('交互列表'),
})

export const NavigationFlowSchema = z.object({
  from: z.string().describe('来源页面 ID'),
  to: z.string().describe('目标页面 ID'),
  trigger: z.string().describe('触发条件'),
})

export const DesignTokenOverridesSchema = z.object({
  primaryColor: z.string().optional().describe('主题色'),
  backgroundColor: z.string().optional().describe('背景色'),
  fontFamily: z.string().optional().describe('字体族'),
  borderRadius: z.number().optional().describe('圆角值'),
}).passthrough()

export const UIDesignSpecSchema = z.object({
  pages: z.array(PageSpecSchema).min(1).describe('页面规格列表'),
  navigation: z.array(NavigationFlowSchema).describe('页面间导航关系'),
  designTokens: DesignTokenOverridesSchema.optional().describe('视觉规格覆盖'),
})

export type ComponentSpec = z.infer<typeof ComponentSpecSchema>
export type InteractionSpec = z.infer<typeof InteractionSpecSchema>
export type PageSpec = z.infer<typeof PageSpecSchema>
export type NavigationFlow = z.infer<typeof NavigationFlowSchema>
export type DesignTokenOverrides = z.infer<typeof DesignTokenOverridesSchema>
export type UIDesignSpec = z.infer<typeof UIDesignSpecSchema>

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. IntegrationContract（契约定义 SubAgent 产出）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── 数据表契约 ─────────────────────────────────────────────────────────────

export const FieldContractSchema = z.object({
  name: z.string().describe('字段英文名（camelCase）'),
  displayName: z.string().describe('字段中文显示名'),
  type: z.enum(['string', 'number', 'boolean', 'date', 'enum', 'ref', 'array', 'object'])
    .describe('字段类型（与 banyan 后端 IFieldDef 对齐）'),
  required: z.boolean().describe('是否必填'),
  defaultValue: z.unknown().optional().describe('默认值'),
  refCollection: z.string().optional().describe('type=ref 时关联的集合 name'),
  enumValues: z.array(z.string()).optional().describe('type=enum 时的可选值列表'),
})

export const CollectionContractSchema = z.object({
  name: z.string().describe('集合英文标识符（camelCase）'),
  displayName: z.string().describe('集合中文显示名'),
  description: z.string().describe('用途描述'),
  fields: z.array(FieldContractSchema).min(1).describe('字段列表'),
})

// ─── 云函数签名契约 ─────────────────────────────────────────────────────────

export const ParamContractSchema = z.object({
  name: z.string().describe('参数名'),
  type: z.enum(['string', 'number', 'boolean', 'date', 'array', 'object']).describe('参数类型'),
  required: z.boolean().describe('是否必填'),
  description: z.string().describe('参数说明'),
})

export const SideEffectSchema = z.object({
  collection: z.string().describe('操作的集合 name（必须在 CollectionContract 中存在）'),
  operation: z.enum(['create', 'read', 'update', 'delete']).describe('操作类型'),
})

export const FunctionContractSchema = z.object({
  functionId: z.string().uuid().describe('UUID，契约定义时预分配，前端 callFlow.flowId 引用此值'),
  name: z.string().describe('函数英文标识符（camelCase，同 app 内唯一）'),
  displayName: z.string().describe('中文显示名'),
  description: z.string().describe('功能描述'),
  input: z.array(ParamContractSchema).describe('入参定义'),
  output: z.array(ParamContractSchema).describe('出参定义'),
  sideEffects: z.array(SideEffectSchema).describe('副作用声明'),
})

// ─── 绑定映射（前端事件→云函数的"接线图"）───────────────────────────────────

export const ParamMappingSchema = z.object({
  source: z.string().describe('数据来源描述（如"表单字段 username"）'),
  target: z.string().describe('对应函数入参 name'),
})

export const BindingContractSchema = z.object({
  id: z.string().describe('绑定唯一标识'),
  description: z.string().describe('绑定描述，如"用户点击提交按钮时创建订单"'),
  frontend: z.object({
    pageId: z.string().describe('哪个页面'),
    componentId: z.string().describe('哪个组件'),
    event: z.string().describe('什么事件（onClick/onSubmit 等）'),
  }),
  backend: z.object({
    functionId: z.string().uuid().describe('调用哪个云函数（对应 FunctionContract.functionId）'),
    paramMapping: z.array(ParamMappingSchema).describe('参数映射'),
  }),
})

export const IntegrationContractSchema = z.object({
  collections: z.array(CollectionContractSchema).describe('数据表契约列表'),
  cloudFunctions: z.array(FunctionContractSchema).describe('云函数签名契约列表'),
  bindings: z.array(BindingContractSchema).describe('前后端绑定映射列表'),
})

export type FieldContract = z.infer<typeof FieldContractSchema>
export type CollectionContract = z.infer<typeof CollectionContractSchema>
export type ParamContract = z.infer<typeof ParamContractSchema>
export type SideEffect = z.infer<typeof SideEffectSchema>
export type FunctionContract = z.infer<typeof FunctionContractSchema>
export type ParamMapping = z.infer<typeof ParamMappingSchema>
export type BindingContract = z.infer<typeof BindingContractSchema>
export type IntegrationContract = z.infer<typeof IntegrationContractSchema>

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. FrontendArtifacts（前端 Worker 产出）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 客户端 FlowSchema 的 Zod 验证放宽为 passthrough object。
 * FlowSchema 结构复杂且由 @banyuan/flow 定义，精确验证由 flow 包的校验函数负责。
 */
export const FlowSchemaZod = z.object({
  nodes: z.array(z.object({}).passthrough()),
  edges: z.array(z.object({}).passthrough()),
}).passthrough().describe('FlowSchema（节点图）')

export const ClientFlowBindingSchema = z.object({
  viewId: z.string().describe('绑定到哪个 View'),
  event: z.string().describe('事件名（onClick/onSubmit 等）'),
  flowSchema: FlowSchemaZod.describe('客户端 FlowSchema（含 callFlow 节点）'),
})

/**
 * AIProjectionScene 的 Zod 验证放宽为 passthrough object。
 * 精确验证由 fromAIProjection() 负责（包含完整的结构校验和类型映射）。
 */
export const AIProjectionSceneZod = z.object({
  id: z.string(),
  name: z.string(),
  nodes: z.array(z.object({}).passthrough()),
}).passthrough().describe('AIProjectionScene（页面完整视图结构）')

export const PageArtifactSchema = z.object({
  pageId: z.string().describe('页面 ID（对应 UIDesignSpec.pages[].id / Scene ID）'),
  scene: AIProjectionSceneZod.describe('该页面的完整视图结构'),
  clientFlows: z.array(ClientFlowBindingSchema).describe('该页面内的事件绑定'),
})

export const FrontendArtifactsSchema = z.object({
  pages: z.array(PageArtifactSchema).min(1).describe('按页面组织的产出'),
})

export type ClientFlowBinding = z.infer<typeof ClientFlowBindingSchema>
export type PageArtifact = z.infer<typeof PageArtifactSchema>
export type FrontendArtifacts = z.infer<typeof FrontendArtifactsSchema>

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. BackendArtifacts（后端 Worker 产出）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const CollectionFieldSchema = z.object({
  name: z.string().describe('字段英文名'),
  displayName: z.string().describe('字段中文显示名'),
  type: z.enum(['string', 'number', 'boolean', 'date', 'enum', 'ref', 'array', 'object']).describe('字段类型'),
  required: z.boolean().describe('是否必填'),
  defaultValue: z.unknown().optional().describe('默认值'),
  refCollection: z.string().optional().describe('关联集合'),
  enumValues: z.array(z.string()).optional().describe('枚举可选值'),
})

export const IndexDefinitionSchema = z.object({
  fields: z.array(z.string()).min(1).describe('索引字段列表'),
  unique: z.boolean().optional().describe('是否唯一索引'),
})

export const CollectionDefinitionSchema = z.object({
  name: z.string().describe('集合名'),
  fields: z.array(CollectionFieldSchema).min(1).describe('字段列表'),
  indexes: z.array(IndexDefinitionSchema).optional().describe('索引定义'),
})

export const CloudFunctionEntrySchema = z.object({
  functionId: z.string().uuid().describe('函数 ID（与 IntegrationContract.FunctionContract.functionId 一致）'),
  name: z.string().describe('函数名（唯一标识）'),
  displayName: z.string().describe('中文显示名'),
  description: z.string().describe('功能描述'),
  flowSchema: FlowSchemaZod.describe('服务端 FlowSchema（节点图）'),
})

export const BackendArtifactsSchema = z.object({
  collections: z.array(CollectionDefinitionSchema).describe('数据表完整定义'),
  cloudFunctions: z.array(CloudFunctionEntrySchema).describe('云函数列表'),
})

export type CollectionField = z.infer<typeof CollectionFieldSchema>
export type IndexDefinition = z.infer<typeof IndexDefinitionSchema>
export type CollectionDefinition = z.infer<typeof CollectionDefinitionSchema>
export type CloudFunctionEntry = z.infer<typeof CloudFunctionEntrySchema>
export type BackendArtifacts = z.infer<typeof BackendArtifactsSchema>
