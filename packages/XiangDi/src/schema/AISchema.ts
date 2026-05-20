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

// ─── Flex 布局 ────────────────────────────────────────────────────────────────

export const AIFlexStyleSchema = z.object({
  direction: z.enum(["row", "column"]).default("column").describe("主轴方向"),
  gap: z.number().nonnegative().default(0).describe("子元素间距，单位 px"),
  mainAxisAlignment: z
    .enum(["start", "center", "end", "space-between", "space-around"])
    .default("start")
    .describe("主轴对齐方式"),
  crossAxisAlignment: z
    .enum(["start", "center", "end", "stretch"])
    .default("start")
    .describe("交叉轴对齐方式"),
  padding: z
    .union([
      z.number().nonnegative(),
      z.tuple([z.number(), z.number(), z.number(), z.number()]),
    ])
    .default(0)
    .describe("内边距，单个数值或 [top, right, bottom, left]"),
});

export const AIFlexLayoutParamsSchema = z.object({
  flex: z.number().nonnegative().optional().describe("flex 权重（0 或缺省 = 固定尺寸，> 0 = 弹性分配）"),
  alignSelf: z.enum(["start", "center", "end", "stretch"]).optional().describe("覆盖容器的 crossAxisAlignment"),
});

// ─── 组件节点 ─────────────────────────────────────────────────────────────────

const AIBaseNodeSchema = z.object({
  id: z.string().describe("唯一标识符"),
  name: z.string().optional().describe("可读名称，便于引用"),
  transform: AITransformSchema,
  zIndex: z.number().int().default(0),
  locked: z.boolean().default(false),
  layoutParams: AIFlexLayoutParamsSchema.optional().describe("作为 flex 子元素时的布局参数"),
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

// 控制点：二维坐标（贝塞尔曲线用，z 轴固定为 0）
export const AIPoint2Schema = z.object({
  x: z.number().describe("水平坐标，单位 px"),
  y: z.number().describe("垂直坐标，单位 px"),
});

export const AICubicBezierNodeSchema = AIBaseNodeSchema.extend({
  type: z.literal("cubic_bezier"),
  /** 4 个控制点：[起点, 控制点1, 控制点2, 终点] */
  controlPoints: z.tuple([
    AIPoint2Schema,
    AIPoint2Schema,
    AIPoint2Schema,
    AIPoint2Schema,
  ]).describe("4 个控制点：[起点, 控制点1, 控制点2, 终点]"),
  stroke: AIStrokeSchema.optional(),
});

export const AIQuadraticBezierNodeSchema = AIBaseNodeSchema.extend({
  type: z.literal("quadratic_bezier"),
  /** 3 个控制点：[起点, 控制点, 终点] */
  controlPoints: z.tuple([
    AIPoint2Schema,
    AIPoint2Schema,
    AIPoint2Schema,
  ]).describe("3 个控制点：[起点, 控制点, 终点]"),
  stroke: AIStrokeSchema.optional(),
});

// ─── AINode 输出类型（parse 后的完整类型，所有 default 字段已填充）────────────

// AINode 类型必须先于 AIGroupNodeSchema / AIFlexNodeSchema 声明，因为 children 字段需要引用它
export type AINode =
  | z.infer<typeof AIRectNodeSchema>
  | z.infer<typeof AITextNodeSchema>
  | z.infer<typeof AIImageNodeSchema>
  | z.infer<typeof AICubicBezierNodeSchema>
  | z.infer<typeof AIQuadraticBezierNodeSchema>
  | AIGroupNode
  | AIFlexNode;

/**
 * AIGroupNode 类型显式声明，避免内联在 AINode union 中导致 TypeScript 循环推断失败。
 * children 字段类型为 AINode[]，与 AIGroupNodeSchema 中的 z.lazy 对应。
 */
export interface AIGroupNode {
  type: "group";
  id: string;
  name?: string;
  transform: z.infer<typeof AITransformSchema>;
  zIndex: number;
  locked: boolean;
  layoutParams?: z.infer<typeof AIFlexLayoutParamsSchema>;
  children: AINode[];
}

/**
 * AIFlexNode —— Flex 布局容器节点。
 * 子元素位置由 flexStyle 自动计算，不需要手动指定坐标。
 */
export interface AIFlexNode {
  type: "flex";
  id: string;
  name?: string;
  transform: z.infer<typeof AITransformSchema>;
  zIndex: number;
  locked: boolean;
  layoutParams?: z.infer<typeof AIFlexLayoutParamsSchema>;
  flexStyle: z.infer<typeof AIFlexStyleSchema>;
  children: AINode[];
}

// ─── AINode 输入类型（传给 parse 的类型，.default() 字段为 optional）──────────

/**
 * AINodeInput —— 所有带 .default() 的字段在输入侧是 optional 的。
 *
 * z.ZodType<Output, Def, Input> 要求 schema 的 _input 能赋值给 Input 泛型参数。
 * 由于 .default() 使得 _input 中对应字段为 T | undefined，
 * 而 AINode（output）中是必填的 T，所以需要单独声明 input 类型。
 */
export type AINodeInput =
  | z.input<typeof AIRectNodeSchema>
  | z.input<typeof AITextNodeSchema>
  | z.input<typeof AIImageNodeSchema>
  | z.input<typeof AICubicBezierNodeSchema>
  | z.input<typeof AIQuadraticBezierNodeSchema>
  | AIGroupNodeInput
  | AIFlexNodeInput;

export interface AIGroupNodeInput {
  type: "group";
  id: string;
  name?: string;
  transform: z.input<typeof AITransformSchema>;
  zIndex?: number;
  locked?: boolean;
  layoutParams?: z.input<typeof AIFlexLayoutParamsSchema>;
  children: AINodeInput[];
}

export interface AIFlexNodeInput {
  type: "flex";
  id: string;
  name?: string;
  transform: z.input<typeof AITransformSchema>;
  zIndex?: number;
  locked?: boolean;
  layoutParams?: z.input<typeof AIFlexLayoutParamsSchema>;
  flexStyle?: z.input<typeof AIFlexStyleSchema>;
  children: AINodeInput[];
}

/**
 * AIGroupNodeSchema 使用 z.lazy 实现递归引用，
 * 显式标注 ZodType<Output, Def, Input> 三个泛型参数，
 * 使 input 侧允许 default 字段缺失。
 */
export const AIGroupNodeSchema: z.ZodType<AIGroupNode, z.ZodTypeDef, AIGroupNodeInput> =
  AIBaseNodeSchema.extend({
    type: z.literal("group"),
    children: z.array(z.lazy(() => AINodeSchema)) as z.ZodType<AINode[], z.ZodTypeDef, AINodeInput[]>,
  }) as z.ZodType<AIGroupNode, z.ZodTypeDef, AIGroupNodeInput>;

/**
 * AIFlexNodeSchema —— Flex 布局容器。
 * 与 AIGroupNodeSchema 同模式：z.lazy 递归 + 显式泛型标注。
 */
export const AIFlexNodeSchema: z.ZodType<AIFlexNode, z.ZodTypeDef, AIFlexNodeInput> =
  AIBaseNodeSchema.extend({
    type: z.literal("flex"),
    flexStyle: AIFlexStyleSchema.default({}),
    children: z.array(z.lazy(() => AINodeSchema)) as z.ZodType<AINode[], z.ZodTypeDef, AINodeInput[]>,
  }) as z.ZodType<AIFlexNode, z.ZodTypeDef, AIFlexNodeInput>;

/**
 * AINodeSchema 显式标注 ZodType<AINode, ZodTypeDef, AINodeInput>，
 * 使用 z.union 替代 z.discriminatedUnion，
 * 因为 AIGroupNodeSchema 的返回类型是 ZodType<AIGroupNode>，
 * 不兼容 discriminatedUnion 要求的具体 ZodObject 类型。
 *
 * 关键修复：第三个泛型参数为 AINodeInput（input 类型），
 * 允许 .default() 字段在输入侧为 undefined，消除 TS2322。
 */
export const AINodeSchema: z.ZodType<AINode, z.ZodTypeDef, AINodeInput> = z.union([
  AIRectNodeSchema,
  AITextNodeSchema,
  AIImageNodeSchema,
  AICubicBezierNodeSchema,
  AIQuadraticBezierNodeSchema,
  AIGroupNodeSchema,
  AIFlexNodeSchema,
]);

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
