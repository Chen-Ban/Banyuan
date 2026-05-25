/**
 * 相地 · Spec 加载节点
 *
 * 将 ProjectSpec 加载并注入到 system prompt 中。
 * 可选地从用户消息推导 ChangeSpec。
 */
import type { ProjectSpec, ProjectSpecLoader } from "../../spec/types.js";

export interface SpecNodeConfig {
  specLoader: ProjectSpecLoader;
}

/**
 * Create a spec loading function that can be composed into graph nodes.
 * This is a utility, not a standalone node - it's called from harnessGraph's agentNode.
 */
export function buildSpecSystemPrompt(spec: ProjectSpec): string {
  const lines: string[] = [];
  lines.push(`# 项目规范：${spec.projectName}`);
  if (spec.description) lines.push("", spec.description);
  if (spec.conventions && spec.conventions.length > 0) {
    lines.push("", "## 编码惯例");
    for (const c of spec.conventions) lines.push(`- ${c}`);
  }
  if (spec.prohibitions && spec.prohibitions.length > 0) {
    lines.push("", "## 禁止事项");
    for (const p of spec.prohibitions) lines.push(`- ${p}`);
  }
  if (spec.agentGuidelines && spec.agentGuidelines.length > 0) {
    lines.push("", "## Agent 行为指引");
    for (const g of spec.agentGuidelines) lines.push(`- ${g}`);
  }
  if (spec.designTokens) {
    lines.push("", "## 设计规范");
    const dt = spec.designTokens;
    if (dt.colors && Object.keys(dt.colors).length > 0) {
      lines.push("", "### 颜色");
      for (const [k, v] of Object.entries(dt.colors)) lines.push(`- ${k}: ${v}`);
    }
    if (dt.typography && Object.keys(dt.typography).length > 0) {
      lines.push("", "### 字体");
      for (const [k, v] of Object.entries(dt.typography)) lines.push(`- ${k}: ${JSON.stringify(v)}`);
    }
    if (dt.spacing && Object.keys(dt.spacing).length > 0) {
      lines.push("", "### 间距");
      for (const [k, v] of Object.entries(dt.spacing)) lines.push(`- ${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

/**
 * Load spec and return the system prompt augmentation.
 * Returns empty string if loading fails.
 */
export async function loadSpecPrompt(specLoader: ProjectSpecLoader): Promise<string> {
  try {
    const spec = await specLoader.load();
    if (spec) {
      return buildSpecSystemPrompt(spec);
    }
  } catch {
    // Spec loading failure is non-fatal
  }
  return "";
}
