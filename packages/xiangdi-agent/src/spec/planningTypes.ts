/**
 * planningTypes.ts — Multi-Agent Planning Pipeline 类型定义
 *
 * 「运筹帷幄之中，决胜千里之外」
 *
 * 定义多智能体规划管线（ADR-032）的 Zod Schema 与 TypeScript 类型：
 * - PMAgent 输出：FeatureList（需求拆解）
 * - ArchAgent 输出：TechPlan（技术方案）
 * - VisualAgent 输出：VisualSpec（视觉规格）
 * - TaskPlannerAgent 输出：ChangeSpec（已在 types.ts 中定义）
 * - PlanningProgressEvent：SSE 进度事件
 *
 * @module @banyuan/xiangdi-agent/spec/planningTypes
 */

import { z } from 'zod';

// ─── Agent Role ────────────────────────────────────────────────────────────────

export const AgentRoleSchema = z.enum(['pm', 'arch', 'visual', 'task']);

export type AgentRole = z.infer<typeof AgentRoleSchema>;

// ─── PMAgent Output: FeatureList ───────────────────────────────────────────────

export const FeatureDependencySchema = z.object({
  featureId: z.string(),
  dependsOn: z.string(),
  reason: z.string(),
});

export type FeatureDependency = z.infer<typeof FeatureDependencySchema>;

export const FeatureSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  /** 用户故事，格式：「作为...，我希望...，以便...」 */
  userStory: z.string(),
  acceptanceCriteria: z.array(z.string()),
  priority: z.enum(['must', 'should', 'could']),
  relatedExistingFeatures: z.array(z.string()),
});

export type Feature = z.infer<typeof FeatureSchema>;

export const FeatureListSchema = z.object({
  features: z.array(FeatureSchema),
  outOfScope: z.array(z.string()),
  dependencies: z.array(FeatureDependencySchema),
});

export type FeatureList = z.infer<typeof FeatureListSchema>;

// ─── ArchAgent Output: TechPlan ────────────────────────────────────────────────

export const ViewChangeSchema = z.object({
  action: z.enum(['create', 'modify', 'delete']),
  viewType: z.string(),
  /** 已有视图 ID，modify/delete 时使用 */
  viewId: z.string().optional(),
  description: z.string(),
  parentId: z.string().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export type ViewChange = z.infer<typeof ViewChangeSchema>;

export const SchemaChangeSchema = z.object({
  action: z.enum(['create_collection', 'add_field', 'modify_field', 'delete_field']),
  collectionName: z.string(),
  fieldName: z.string().optional(),
  fieldType: z.string().optional(),
  description: z.string(),
});

export type SchemaChange = z.infer<typeof SchemaChangeSchema>;

export const TechPlanSchema = z.object({
  viewChanges: z.array(ViewChangeSchema),
  schemaChanges: z.array(SchemaChangeSchema),
  constraints: z.array(z.string()),
});

export type TechPlan = z.infer<typeof TechPlanSchema>;

// ─── VisualAgent Output: VisualSpec ────────────────────────────────────────────

export const PageVisualSpecSchema = z.object({
  /** 已有场景 ID，修改时使用 */
  sceneId: z.string().optional(),
  name: z.string(),
  layoutDescription: z.string(),
  /** 视觉层次描述 */
  hierarchy: z.string(),
  informationDensity: z.enum(['low', 'medium', 'high']),
});

export type PageVisualSpec = z.infer<typeof PageVisualSpecSchema>;

export const DesignTokensSchema = z.object({
  colors: z.record(z.string(), z.string()),
  /** 间距值，单位 px */
  spacing: z.record(z.string(), z.number()),
  borderRadius: z.record(z.string(), z.number()),
  typography: z.record(z.string(), z.object({
    fontSize: z.number(),
    fontWeight: z.number(),
    lineHeight: z.number(),
  })),
});

export type DesignTokens = z.infer<typeof DesignTokensSchema>;

export const ComponentChoiceSchema = z.object({
  /** 关联 Feature.id */
  featureId: z.string(),
  /** BanvasGL 视图类型 */
  componentType: z.string(),
  reason: z.string(),
});

export type ComponentChoice = z.infer<typeof ComponentChoiceSchema>;

export const VisualSpecSchema = z.object({
  pages: z.array(PageVisualSpecSchema),
  designTokens: DesignTokensSchema,
  componentChoices: z.array(ComponentChoiceSchema),
});

export type VisualSpec = z.infer<typeof VisualSpecSchema>;

// ─── TaskPlannerAgent Output: ChangeSpec Schema ────────────────────────────────

export const ChangeTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  done: z.boolean(),
  dependsOn: z.array(z.string()).optional(),
});

export const ChangeSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  proposal: z.object({
    why: z.string(),
    what: z.string(),
    outOfScope: z.string().optional(),
    successCriteria: z.array(z.string()).optional(),
  }),
  specs: z.array(z.string()),
  tasks: z.array(ChangeTaskSchema),
  status: z.enum(['draft', 'approved', 'in_progress', 'done', 'archived']),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// ─── SSE Progress Event ────────────────────────────────────────────────────────

export const PlanningProgressEventSchema = z.object({
  agent: AgentRoleSchema,
  status: z.enum(['started', 'completed', 'failed']),
  summary: z.string().optional(),
  artifactPreview: z.object({
    featureCount: z.number().optional(),
    viewChanges: z.number().optional(),
    schemaChanges: z.number().optional(),
    pageCount: z.number().optional(),
    taskCount: z.number().optional(),
  }).optional(),
});

export type PlanningProgressEvent = z.infer<typeof PlanningProgressEventSchema>;
