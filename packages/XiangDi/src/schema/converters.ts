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

import type { AIApp, AIPage, AINode } from "./AISchema.js";

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

    case "group":
      return {
        ...base,
        type: "Group",
        children: node.children.map(aiNodeToBanvas),
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
    nodes: (Array.isArray(r["views"]) ? r["views"] : []).map(banvasToAINode),
  };
}

function banvasToAINode(raw: unknown): AINode {
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
        children: (Array.isArray(r["children"]) ? r["children"] : []).map(
          banvasToAINode
        ),
      };

    default:
      // 未知类型降级为矩形
      return {
        ...base,
        type: "rect",
        fill: { type: "solid", color: "#cccccc" },
        cornerRadius: 0,
      };
  }
}
