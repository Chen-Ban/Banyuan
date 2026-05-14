/**
 * 相地 · AISchema —— AI 友好的中间表示格式
 *
 * BanvasGL 的原生 JSON 结构对 LLM 而言过于底层（坐标、矩阵、样式对象……）。
 * AISchema 是一套更接近自然语言描述的中间格式：
 *   - 字段语义清晰，LLM 可直接生成
 *   - 与 BanvasGL 原生格式之间有双向转换器
 *
 * 如同园林图纸与实地施工之间的翻译层。
 */

import { z } from "zod";

// ─── 基础类型 ─────────────────────────────────────────────────────────────────

export const AIColorSchema = z.union([
  z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "hex color"),
  z.string().startsWith("rgb"),
  z.literal("transparent"),
]);

export const AIPositionSchema = z.object({
  x: z.number().describe("水平位置，单位 px，左上角为原点"),
  y: z.number().describe("垂直位置，单位 px，左上角为原点"),
});

export const AISizeSchema = z.object({
  width: z.number().positive().describe("宽度，单位 px"),
  height: z.number().positive().describe("高度，单位 px"),
});

export const AITransformSchema = z.object({
  position: AIPositionSchema,
  size: AISizeSchema,
  rotation: z.number().default(0).describe("旋转角度，单位度"),
  opacity: z.number().min(0).max(1).default(1).describe("透明度 0-1"),
});

// ─── 样式 ─────────────────────────────────────────────────────────────────────

export const AIFillSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("solid"),
    color: AIColorSchema,
  }),
  z.object({
    type: z.literal("gradient"),
    direction: z.enum(["horizontal", "vertical", "diagonal"]),
    stops: z.array(
      z.object({ offset: z.number().min(0).max(1), color: AIColorSchema })
    ),
  }),
  z.object({
    type: z.literal("none"),
  }),
]);

export const AIStrokeSchema = z.object({
  color: AIColorSchema,
  width: z.number().nonnegative(),
  style: z.enum(["solid", "dashed", "dotted"]).default("solid"),
});

export const AITextStyleSchema = z.object({
  fontSize: z.number().positive().default(14),
  fontWeight: z.enum(["normal", "bold"]).default("normal"),
  color: AIColorSchema.default("#000000"),
  align: z.enum(["left", "center", "right"]).default("left"),
  lineHeight: z.number().positive().default(1.5),
});

// ─── 组件节点 ─────────────────────────────────────────────────────────────────

const AIBaseNodeSchema = z.object({
  id: z.string().describe("唯一标识符"),
  name: z.string().optional().describe("可读名称，便于引用"),
  transform: AITransformSchema,
  zIndex: z.number().int().default(0),
  locked: z.boolean().default(false),
});

export const AIRectNodeSchema = AIBaseNodeSchema.extend({
  type: z.literal("rect"),
  fill: AIFillSchema.default({ type: "solid", color: "#ffffff" }),
  stroke: AIStrokeSchema.optional(),
  cornerRadius: z.number().nonnegative().default(0),
});

export const AITextNodeSchema = AIBaseNodeSchema.extend({
  type: z.literal("text"),
  content: z.string().describe("文本内容"),
  style: AITextStyleSchema.default({}),
});

export const AIImageNodeSchema = AIBaseNodeSchema.extend({
  type: z.literal("image"),
  src: z.string().url().describe("图片 URL"),
  objectFit: z.enum(["fill", "contain", "cover"]).default("cover"),
});

export const AIGroupNodeSchema = AIBaseNodeSchema.extend({
  type: z.literal("group"),
  children: z.array(z.lazy(() => AINodeSchema)),
});

export const AINodeSchema: z.ZodType<AINode> = z.discriminatedUnion("type", [
  AIRectNodeSchema,
  AITextNodeSchema,
  AIImageNodeSchema,
  AIGroupNodeSchema,
]);

export type AINode = z.infer<typeof AIRectNodeSchema>
  | z.infer<typeof AITextNodeSchema>
  | z.infer<typeof AIImageNodeSchema>
  | { type: "group"; id: string; name?: string; transform: z.infer<typeof AITransformSchema>; zIndex: number; locked: boolean; children: AINode[] };

// ─── 页面 ─────────────────────────────────────────────────────────────────────

export const AIPageSchema = z.object({
  id: z.string(),
  name: z.string().default("页面"),
  width: z.number().positive().default(375),
  height: z.number().positive().default(812),
  backgroundColor: AIColorSchema.default("#ffffff"),
  nodes: z.array(AINodeSchema),
});

export type AIPage = z.infer<typeof AIPageSchema>;

// ─── 应用 ─────────────────────────────────────────────────────────────────────

export const AIAppSchema = z.object({
  id: z.string(),
  name: z.string(),
  pages: z.array(AIPageSchema).min(1),
  version: z.string().default("1.0.0"),
});

export type AIApp = z.infer<typeof AIAppSchema>;
