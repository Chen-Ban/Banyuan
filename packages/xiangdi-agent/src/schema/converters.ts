/**
 * 相地 · 双向转换器
 *
 * AISchema ←→ BanvasGL 原生 JSON
 *
 * 此模块是 XiangDi 与 BanvasGL 之间的桥梁。
 * 转换器设计为纯函数，无副作用，便于测试和组合。
 *
 * 注意：BanvasGL 原生格式以 `unknown` 类型接收，
 * 避免在此包中强依赖 BanvasGL 的类型定义。
 * 实际项目中可通过泛型或类型断言进一步收窄。
 */

import type { AIApp, AIPage, AINode, AIFlexNode } from "./AISchema.js";

// ─── AISchema → BanvasGL ──────────────────────────────────────────────────────

/**
 * 将 AISchema 应用描述转换为 BanvasGL 可消费的原生 JSON
 */
export function aiAppToBanvas(app: AIApp): unknown {
  return {
    id: app.id,
    name: app.name,
    version: app.version,
    pages: app.pages.map(aiPageToBanvas),
  };
}

function aiPageToBanvas(page: AIPage): unknown {
  return {
    id: page.id,
    name: page.name,
    width: page.width,
    height: page.height,
    background: { type: "solid", color: page.backgroundColor },
    views: page.nodes.map(aiNodeToBanvas),
  };
}

function aiNodeToBanvas(node: AINode): unknown {
  const base = {
    id: node.id,
    name: node.name ?? node.type,
    x: node.transform.position.x,
    y: node.transform.position.y,
    width: node.transform.size.width,
    height: node.transform.size.height,
    rotation: node.transform.rotation,
    opacity: node.transform.opacity,
    zIndex: node.zIndex,
    locked: node.locked,
  };

  switch (node.type) {
    case "rect":
      return {
        ...base,
        type: "Rectangle",
        fill: node.fill,
        stroke: node.stroke ?? null,
        cornerRadius: node.cornerRadius,
      };

    case "text":
      return {
        ...base,
        type: "Text",
        content: node.content,
        fontSize: node.style.fontSize,
        fontWeight: node.style.fontWeight,
        color: node.style.color,
        textAlign: node.style.align,
        lineHeight: node.style.lineHeight,
      };

    case "image":
      return {
        ...base,
        type: "Image",
        src: node.src,
        objectFit: node.objectFit,
      };

    case "cubic_bezier": {
      // BanvasGL 原生格式：GraphView，content 嵌套 CubicBezier
      // 控制点坐标是相对于 view 自身坐标系的局部坐标
      const [p0, p1, p2, p3] = node.controlPoints;
      return {
        ...base,
        type: "GRAPHVIEW",
        content: {
          $type: "CUBIC_BEZIER",
          $value: {
            type: "CUBIC_BEZIER",
            controlPoints: [
              { x: p0.x, y: p0.y, z: 0 },
              { x: p1.x, y: p1.y, z: 0 },
              { x: p2.x, y: p2.y, z: 0 },
              { x: p3.x, y: p3.y, z: 0 },
            ],
            style: node.stroke
              ? { strokeStyle: { color: node.stroke.color, width: node.stroke.width, style: node.stroke.style } }
              : {},
          },
        },
      };
    }

    case "quadratic_bezier": {
      const [p0, p1, p2] = node.controlPoints;
      return {
        ...base,
        type: "GRAPHVIEW",
        content: {
          $type: "QUADRATIC_BEZIER",
          $value: {
            type: "QUADRATIC_BEZIER",
            controlPoints: [
              { x: p0.x, y: p0.y, z: 0 },
              { x: p1.x, y: p1.y, z: 0 },
              { x: p2.x, y: p2.y, z: 0 },
            ],
            style: node.stroke
              ? { strokeStyle: { color: node.stroke.color, width: node.stroke.width, style: node.stroke.style } }
              : {},
          },
        },
      };
    }

    case "group":
      return {
        ...base,
        type: "Group",
        children: node.children.map(aiNodeToBanvas),
      };

    case "flex":
      return {
        ...base,
        type: "FLEXVIEW",
        flexStyle: node.flexStyle,
        children: node.children.map((child) => {
          const banvasChild = aiNodeToBanvas(child) as Record<string, unknown>;
          // 将 layoutParams 从 AINode 传递到 BanvasGL 子节点
          if (child.layoutParams) {
            banvasChild["layoutParams"] = child.layoutParams;
          }
          return banvasChild;
        }),
      };

    default:
      return base;
  }
}

// ─── BanvasGL → AISchema ──────────────────────────────────────────────────────

/**
 * 将 BanvasGL 原生 JSON 转换为 AISchema 格式
 * 便于 LLM 读取和修改现有应用
 */
export function banvasToAIApp(raw: unknown): AIApp {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r["id"] ?? ""),
    name: String(r["name"] ?? ""),
    version: String(r["version"] ?? "1.0.0"),
    pages: (Array.isArray(r["pages"]) ? r["pages"] : []).map(banvasToAIPage),
  };
}

function banvasToAIPage(raw: unknown): AIPage {
  const r = raw as Record<string, unknown>;
  const bg = r["background"] as Record<string, unknown> | undefined;
  return {
    id: String(r["id"] ?? ""),
    name: String(r["name"] ?? "页面"),
    width: Number(r["width"] ?? 375),
    height: Number(r["height"] ?? 812),
    backgroundColor: String(bg?.["color"] ?? "#ffffff"),
    nodes: (Array.isArray(r["views"]) ? r["views"] : [])
      .map(banvasToAINode)
      .filter((n): n is AINode => n !== null),
  };
}

function banvasToAINode(raw: unknown): AINode | null {
  const r = raw as Record<string, unknown>;
  const base = {
    id: String(r["id"] ?? ""),
    name: String(r["name"] ?? ""),
    transform: {
      position: { x: Number(r["x"] ?? 0), y: Number(r["y"] ?? 0) },
      size: {
        width: Number(r["width"] ?? 100),
        height: Number(r["height"] ?? 100),
      },
      rotation: Number(r["rotation"] ?? 0),
      opacity: Number(r["opacity"] ?? 1),
    },
    zIndex: Number(r["zIndex"] ?? 0),
    locked: Boolean(r["locked"] ?? false),
  };

  const type = String(r["type"] ?? "");

  // GraphView 需要二次判断 content.$type 来区分具体图形类型
  if (type === "GRAPHVIEW") {
    const content = r["content"] as Record<string, unknown> | undefined;
    const graphType = (content?.["$type"] ?? content?.["type"]) as string | undefined;
    const gv = (content?.["$value"] ?? content) as Record<string, unknown>;
    const rawPoints = Array.isArray(gv["controlPoints"]) ? gv["controlPoints"] as Record<string, unknown>[] : [];

    if (graphType === "CUBIC_BEZIER" && rawPoints.length >= 4) {
      return {
        ...base,
        type: "cubic_bezier" as const,
        controlPoints: [
          { x: Number(rawPoints[0]["x"] ?? 0), y: Number(rawPoints[0]["y"] ?? 0) },
          { x: Number(rawPoints[1]["x"] ?? 0), y: Number(rawPoints[1]["y"] ?? 0) },
          { x: Number(rawPoints[2]["x"] ?? 0), y: Number(rawPoints[2]["y"] ?? 0) },
          { x: Number(rawPoints[3]["x"] ?? 0), y: Number(rawPoints[3]["y"] ?? 0) },
        ] as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }],
      };
    }

    if (graphType === "QUADRATIC_BEZIER" && rawPoints.length >= 3) {
      return {
        ...base,
        type: "quadratic_bezier" as const,
        controlPoints: [
          { x: Number(rawPoints[0]["x"] ?? 0), y: Number(rawPoints[0]["y"] ?? 0) },
          { x: Number(rawPoints[1]["x"] ?? 0), y: Number(rawPoints[1]["y"] ?? 0) },
          { x: Number(rawPoints[2]["x"] ?? 0), y: Number(rawPoints[2]["y"] ?? 0) },
        ] as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }],
      };
    }

    // 其他 GraphView 类型（LINE、CIRCLE 等）：记录警告并跳过（返回 null，由调用方过滤）
    // 不静默降级为矩形，避免 AI 对画布的理解与实际渲染不一致
    console.warn(
      `[converters] banvasToAINode: unsupported GRAPHVIEW subtype "${graphType ?? 'unknown'}", ` +
      `node id="${base.id}" will be skipped. ` +
      `Please add a converter for this type in converters.ts.`
    );
    return null;
  }

  switch (type) {
    case "Rectangle":
      return {
        ...base,
        type: "rect",
        fill: (r["fill"] as AINode extends { fill: infer F } ? F : never) ?? {
          type: "solid",
          color: "#ffffff",
        },
        stroke: r["stroke"] as AINode extends { stroke?: infer S } ? S : never,
        cornerRadius: Number(r["cornerRadius"] ?? 0),
      };

    case "Text":
      return {
        ...base,
        type: "text",
        content: String(r["content"] ?? ""),
        style: {
          fontSize: Number(r["fontSize"] ?? 14),
          fontWeight: (r["fontWeight"] as "normal" | "bold") ?? "normal",
          color: String(r["color"] ?? "#000000"),
          align: (r["textAlign"] as "left" | "center" | "right") ?? "left",
          lineHeight: Number(r["lineHeight"] ?? 1.5),
        },
      };

    case "Image":
      return {
        ...base,
        type: "image",
        src: String(r["src"] ?? ""),
        objectFit:
          (r["objectFit"] as "fill" | "contain" | "cover") ?? "cover",
      };

    case "Group":
      return {
        ...base,
        type: "group",
        children: (Array.isArray(r["children"]) ? r["children"] : [])
          .map(banvasToAINode)
          .filter((n): n is AINode => n !== null),
      };

    case "FLEXVIEW": {
      const flexStyle = r["flexStyle"] as Record<string, unknown> | undefined;
      const flexNode: AIFlexNode = {
        ...base,
        type: "flex",
        flexStyle: {
          direction: (flexStyle?.["direction"] as "row" | "column") ?? "column",
          gap: Number(flexStyle?.["gap"] ?? 0),
          mainAxisAlignment: (flexStyle?.["mainAxisAlignment"] as AIFlexNode["flexStyle"]["mainAxisAlignment"]) ?? "start",
          crossAxisAlignment: (flexStyle?.["crossAxisAlignment"] as AIFlexNode["flexStyle"]["crossAxisAlignment"]) ?? "start",
          padding: (flexStyle?.["padding"] as number | [number, number, number, number]) ?? 0,
        },
        children: (Array.isArray(r["children"]) ? r["children"] : [])
          .map((child: unknown) => {
            const aiChild = banvasToAINode(child);
            if (!aiChild) return null;
            // 恢复 layoutParams
            const childRaw = child as Record<string, unknown>;
            const lp = childRaw["layoutParams"] as Record<string, unknown> | undefined;
            if (lp) {
              (aiChild as Record<string, unknown>)["layoutParams"] = {
                flex: lp["flex"] != null ? Number(lp["flex"]) : undefined,
                alignSelf: lp["alignSelf"] as string | undefined,
              };
            }
            return aiChild;
          })
          .filter((n): n is AINode => n !== null),
      };
      return flexNode;
    }

    default:
      // 未知类型：记录警告并跳过，不静默降级为矩形
      // 新增 BanvasGL 图形类型时，必须同步在此处添加转换逻辑
      console.warn(
        `[converters] banvasToAINode: unsupported node type "${type}", ` +
        `node id="${base.id}" will be skipped. ` +
        `Please add a converter for this type in converters.ts.`
      );
      return null;
  }
}
