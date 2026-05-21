/**
 * generate-knowledge.ts
 *
 * 从 AISchema 的 Zod 定义自动生成知识种子 JSON 文件。
 * 输出到 packages/XiangDi/src/knowledge/seeds/schema/ 目录。
 *
 * 运行方式：npx tsx packages/BanvasGL/scripts/generate-knowledge.ts
 *
 * 此脚本是 BanvasGL 的 postbuild 钩子，每次构建后自动运行，
 * 确保知识种子与 AISchema 定义保持同步。
 */

import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AIRectNodeSchema,
  AITextNodeSchema,
  AIImageNodeSchema,
  AICubicBezierNodeSchema,
  AIQuadraticBezierNodeSchema,
  AIGroupNodeSchema,
  AIFlexNodeSchema,
  AIPageSchema,
  AIAppSchema,
} from "../../../packages/XiangDi/src/schema/AISchema.js";

import type { SeedFile } from "../../../packages/XiangDi/src/knowledge/seeds/index.js";

// ─── 输出目录 ────────────────────────────────────────────────────────────────

// 兼容 ESM 和 tsx CJS 模式的目录解析
const __scriptDir = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

const OUTPUT_DIR = path.resolve(
  __scriptDir,
  "../../../packages/XiangDi/src/knowledge/seeds/schema"
);

// ─── Zod Schema 描述提取工具 ─────────────────────────────────────────────────

interface PropertyInfo {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  description?: string;
}

/**
 * 从 Zod schema 中提取属性信息
 */
function extractProperties(schema: z.ZodTypeAny): PropertyInfo[] {
  const properties: PropertyInfo[] = [];
  const shape = getShape(schema);

  if (!shape) return properties;

  for (const [key, fieldSchema] of Object.entries(shape)) {
    const info = analyzeField(key, fieldSchema as z.ZodTypeAny);
    properties.push(info);
  }

  return properties;
}

/**
 * 获取 ZodObject 的 shape（处理 extend 等情况）
 */
function getShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> | null {
  if (schema instanceof z.ZodObject) {
    return schema.shape as Record<string, z.ZodTypeAny>;
  }
  // 处理 ZodType<T>（如 AIGroupNodeSchema）—— 尝试访问内部 shape
  const def = (schema as unknown as { _def: { shape?: () => Record<string, z.ZodTypeAny>; typeName?: string } })._def;
  if (def && typeof def.shape === "function") {
    return def.shape();
  }
  return null;
}

/**
 * 分析单个字段的类型信息
 */
function analyzeField(name: string, schema: z.ZodTypeAny): PropertyInfo {
  let required = true;
  let defaultValue: unknown = undefined;
  let description: string | undefined = undefined;
  let currentSchema = schema;

  // 逐层解包 ZodOptional / ZodDefault / ZodEffects
  while (true) {
    if (currentSchema instanceof z.ZodOptional) {
      required = false;
      currentSchema = currentSchema.unwrap();
    } else if (currentSchema instanceof z.ZodDefault) {
      defaultValue = currentSchema._def.defaultValue();
      currentSchema = currentSchema._def.innerType;
    } else if (currentSchema instanceof z.ZodEffects) {
      currentSchema = currentSchema._def.schema;
    } else {
      break;
    }
  }

  description = currentSchema._def.description ?? schema._def.description;

  const type = describeType(currentSchema);

  return { name, type, required, defaultValue, description };
}

/**
 * 将 Zod 类型转换为人类可读的类型描述
 */
function describeType(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodLiteral) return `"${schema._def.value}"`;
  if (schema instanceof z.ZodEnum) {
    return schema._def.values.map((v: string) => `"${v}"`).join(" | ");
  }
  if (schema instanceof z.ZodUnion) {
    const options = schema._def.options as z.ZodTypeAny[];
    return options.map((o) => describeType(o)).join(" | ");
  }
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const options = [...schema._def.options.values()] as z.ZodTypeAny[];
    return options.map((o) => describeType(o)).join(" | ");
  }
  if (schema instanceof z.ZodArray) {
    return `Array<${describeType(schema._def.type)}>`;
  }
  if (schema instanceof z.ZodTuple) {
    const items = schema._def.items as z.ZodTypeAny[];
    return `[${items.map((i) => describeType(i)).join(", ")}]`;
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const fields = Object.entries(shape)
      .map(([k, v]) => `${k}: ${describeType(v as z.ZodTypeAny)}`)
      .join("; ");
    return `{ ${fields} }`;
  }
  if (schema instanceof z.ZodLazy) {
    return "AINode (recursive)";
  }
  if (schema instanceof z.ZodDefault) {
    return describeType(schema._def.innerType);
  }
  if (schema instanceof z.ZodOptional) {
    return describeType(schema.unwrap());
  }

  return "unknown";
}

// ─── 最小示例生成 ────────────────────────────────────────────────────────────

/**
 * 为每个节点类型生成最小可用示例
 */
function generateMinimalExample(nodeType: string): Record<string, unknown> {
  const baseTransform = {
    position: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    rotation: 0,
    opacity: 1,
  };

  switch (nodeType) {
    case "rect":
      return {
        id: "rect-001",
        type: "rect",
        transform: baseTransform,
        fill: { type: "solid", color: "#ffffff" },
        cornerRadius: 0,
      };
    case "text":
      return {
        id: "text-001",
        type: "text",
        transform: baseTransform,
        content: "Hello World",
        style: {
          fontSize: 14,
          fontWeight: "normal",
          color: "#000000",
          align: "left",
          lineHeight: 1.5,
        },
      };
    case "image":
      return {
        id: "image-001",
        type: "image",
        transform: { ...baseTransform, size: { width: 200, height: 150 } },
        src: "https://example.com/image.png",
        objectFit: "cover",
      };
    case "cubic_bezier":
      return {
        id: "cubic-bezier-001",
        type: "cubic_bezier",
        transform: { ...baseTransform, size: { width: 200, height: 100 } },
        controlPoints: [
          { x: 0, y: 0 },
          { x: 50, y: -30 },
          { x: 150, y: -30 },
          { x: 200, y: 0 },
        ],
      };
    case "quadratic_bezier":
      return {
        id: "quadratic-bezier-001",
        type: "quadratic_bezier",
        transform: { ...baseTransform, size: { width: 200, height: 100 } },
        controlPoints: [
          { x: 0, y: 0 },
          { x: 100, y: -50 },
          { x: 200, y: 0 },
        ],
      };
    case "group":
      return {
        id: "group-001",
        type: "group",
        transform: baseTransform,
        children: [
          {
            id: "child-rect-001",
            type: "rect",
            transform: {
              position: { x: 0, y: 0 },
              size: { width: 80, height: 40 },
              rotation: 0,
              opacity: 1,
            },
            fill: { type: "solid", color: "#e0e0e0" },
            cornerRadius: 4,
          },
        ],
      };
    case "flex":
      return {
        id: "flex-001",
        type: "flex",
        transform: { ...baseTransform, size: { width: 375, height: 400 } },
        flexStyle: {
          direction: "column",
          gap: 12,
          mainAxisAlignment: "start",
          crossAxisAlignment: "stretch",
          padding: 16,
        },
        children: [
          {
            id: "child-rect-001",
            type: "rect",
            transform: {
              position: { x: 0, y: 0 },
              size: { width: 343, height: 60 },
              rotation: 0,
              opacity: 1,
            },
            fill: { type: "solid", color: "#f0f0f0" },
            cornerRadius: 8,
            layoutParams: { flex: 0 },
          },
          {
            id: "child-rect-002",
            type: "rect",
            transform: {
              position: { x: 0, y: 0 },
              size: { width: 343, height: 100 },
              rotation: 0,
              opacity: 1,
            },
            fill: { type: "solid", color: "#e0e0ff" },
            cornerRadius: 8,
            layoutParams: { flex: 1 },
          },
        ],
      };
    case "page":
      return {
        id: "page-001",
        name: "首页",
        width: 375,
        height: 812,
        backgroundColor: "#ffffff",
        nodes: [],
      };
    case "app":
      return {
        id: "app-001",
        name: "我的应用",
        pages: [
          {
            id: "page-001",
            name: "首页",
            width: 375,
            height: 812,
            backgroundColor: "#ffffff",
            nodes: [],
          },
        ],
        version: "1.0.0",
      };
    default:
      return {};
  }
}

// ─── 内容生成 ────────────────────────────────────────────────────────────────

interface NodeTypeConfig {
  schemaName: string;
  nodeType: string;
  typeLiteral: string;
  schema: z.ZodTypeAny;
  description: string;
}

const NODE_TYPES: NodeTypeConfig[] = [
  {
    schemaName: "AIRectNodeSchema",
    nodeType: "AIRectNode",
    typeLiteral: "rect",
    schema: AIRectNodeSchema,
    description: "矩形节点，最基础的图形容器。可用于背景色块、按钮底板、卡片容器等。",
  },
  {
    schemaName: "AITextNodeSchema",
    nodeType: "AITextNode",
    typeLiteral: "text",
    schema: AITextNodeSchema,
    description: "文本节点，用于显示文字内容。支持字号、字重、颜色、对齐方式等样式。",
  },
  {
    schemaName: "AIImageNodeSchema",
    nodeType: "AIImageNode",
    typeLiteral: "image",
    schema: AIImageNodeSchema,
    description: "图片节点，通过 URL 引用外部图片资源。支持 fill/contain/cover 三种适配模式。",
  },
  {
    schemaName: "AICubicBezierNodeSchema",
    nodeType: "AICubicBezierNode",
    typeLiteral: "cubic_bezier",
    schema: AICubicBezierNodeSchema,
    description:
      "三次贝塞尔曲线节点，由 4 个控制点定义（起点、控制点1、控制点2、终点）。用于绘制平滑曲线、装饰线条等。",
  },
  {
    schemaName: "AIQuadraticBezierNodeSchema",
    nodeType: "AIQuadraticBezierNode",
    typeLiteral: "quadratic_bezier",
    schema: AIQuadraticBezierNodeSchema,
    description:
      "二次贝塞尔曲线节点，由 3 个控制点定义（起点、控制点、终点）。比三次贝塞尔更简单，适合简单弧线。",
  },
  {
    schemaName: "AIGroupNodeSchema",
    nodeType: "AIGroupNode",
    typeLiteral: "group",
    schema: AIGroupNodeSchema,
    description:
      "分组节点，可包含多个子节点（children）。用于将相关节点组合为一个整体，便于统一移动、缩放。children 支持递归嵌套。",
  },
  {
    schemaName: "AIFlexNodeSchema",
    nodeType: "AIFlexNode",
    typeLiteral: "flex",
    schema: AIFlexNodeSchema,
    description:
      "Flex 布局容器节点。子元素位置由 flexStyle 自动计算（方向、间距、对齐），无需手动指定坐标。适用于列表、卡片网格、导航栏等需要自动排列的场景。子节点可通过 layoutParams.flex 指定弹性权重。",
  },
  {
    schemaName: "AIPageSchema",
    nodeType: "AIPage",
    typeLiteral: "page",
    schema: AIPageSchema,
    description:
      "页面，是节点的顶层容器。每个页面有独立的尺寸和背景色，包含一组节点（nodes）。一个应用由多个页面组成。",
  },
  {
    schemaName: "AIAppSchema",
    nodeType: "AIApp",
    typeLiteral: "app",
    schema: AIAppSchema,
    description:
      "应用，是最顶层的结构。包含一个或多个页面（pages），以及应用名称和版本号。",
  },
];

/**
 * 生成 LLM 友好的属性描述文本
 */
function generateContent(config: NodeTypeConfig): string {
  const lines: string[] = [];

  lines.push(`# ${config.nodeType}`);
  lines.push("");
  lines.push(`类型标识: type = "${config.typeLiteral}"`);
  lines.push("");
  lines.push(`## 描述`);
  lines.push("");
  lines.push(config.description);
  lines.push("");
  lines.push(`## 属性列表`);
  lines.push("");

  const properties = extractProperties(config.schema);

  for (const prop of properties) {
    let line = `- **${prop.name}**`;
    line += ` (${prop.type})`;
    line += prop.required ? " [必填]" : " [可选]";
    if (prop.defaultValue !== undefined) {
      line += ` 默认值: ${JSON.stringify(prop.defaultValue)}`;
    }
    if (prop.description) {
      line += ` — ${prop.description}`;
    }
    lines.push(line);
  }

  // 补充子类型说明
  if (config.typeLiteral === "rect") {
    lines.push("");
    lines.push("## 补充说明");
    lines.push("");
    lines.push("### fill 属性详解");
    lines.push(
      '- solid 填充: { type: "solid", color: "#hex" }'
    );
    lines.push(
      '- 渐变填充: { type: "gradient", direction: "horizontal"|"vertical"|"diagonal", stops: [{ offset: 0-1, color: "#hex" }] }'
    );
    lines.push('- 无填充: { type: "none" }');
    lines.push("");
    lines.push("### stroke 属性详解");
    lines.push(
      '- { color: "#hex", width: number, style: "solid"|"dashed"|"dotted" }'
    );
  }

  if (config.typeLiteral === "text") {
    lines.push("");
    lines.push("## 补充说明");
    lines.push("");
    lines.push("### style 属性详解");
    lines.push("- fontSize: 字号（正数），默认 14");
    lines.push('- fontWeight: "normal" | "bold"，默认 "normal"');
    lines.push('- color: 文字颜色（hex），默认 "#000000"');
    lines.push('- align: "left" | "center" | "right"，默认 "left"');
    lines.push("- lineHeight: 行高倍数（正数），默认 1.5");
  }

  lines.push("");
  lines.push("## 最小可用示例");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(generateMinimalExample(config.typeLiteral), null, 2));
  lines.push("```");

  // 通用 transform 说明（节点类型才有）
  if (
    ["rect", "text", "image", "cubic_bezier", "quadratic_bezier", "group", "flex"].includes(
      config.typeLiteral
    )
  ) {
    lines.push("");
    lines.push("## transform 属性详解");
    lines.push("");
    lines.push("所有节点共享的空间变换属性：");
    lines.push("- position: { x: number, y: number } — 左上角为原点的像素坐标");
    lines.push("- size: { width: number(>0), height: number(>0) } — 宽高（像素）");
    lines.push("- rotation: number — 旋转角度（度），默认 0");
    lines.push("- opacity: number(0-1) — 透明度，默认 1");
  }

  return lines.join("\n");
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

function main(): void {
  console.log("🌱 generate-knowledge: 开始生成 Schema 层知识种子...");

  // 确保输出目录存在
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const generatedFiles: string[] = [];

  for (const config of NODE_TYPES) {
    const content = generateContent(config);
    const id = `schema-${config.typeLiteral.replace(/_/g, "-")}`;
    const fileName = `${config.typeLiteral.replace(/_/g, "-")}.json`;

    const seedFile: SeedFile = {
      id,
      content,
      source: "auto-generated",
      metadata: {
        category: "schema",
        nodeType: config.nodeType,
        typeLiteral: config.typeLiteral,
        schemaName: config.schemaName,
        version: "0.1.0",
      },
    };

    const outputPath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(outputPath, JSON.stringify(seedFile, null, 2) + "\n", "utf-8");
    generatedFiles.push(fileName);
    console.log(`  ✅ ${fileName} (${config.nodeType})`);
  }

  console.log("");
  console.log(
    `🎉 generate-knowledge: 完成！共生成 ${generatedFiles.length} 个种子文件到:`
  );
  console.log(`   ${OUTPUT_DIR}/`);
}

main();
