/**
 * 相地 · ProjectSpec 加载器
 *
 * 从固定文件加载项目级规范（AGENTS.md / xiangdi.spec.md）。
 * 这是 SDD 中"宪法层"的读取入口。
 *
 * 文件格式约定（Markdown）：
 *
 * ```markdown
 * # Project: <name>
 *
 * <description>
 *
 * ## Conventions
 * - ...
 *
 * ## Prohibitions
 * - ...
 *
 * ## Agent Guidelines
 * - ...
 * ```
 *
 * 若文件不存在，返回 null，Harness 将跳过项目级约束注入。
 */

import type { ProjectSpec, ProjectSpecLoader, ProjectSpecRaw } from "./types.js";

// ─── 默认文件路径候选列表 ─────────────────────────────────────────────────────

/**
 * 按优先级顺序查找的规范文件名
 * 与 OpenSpec 的 AGENTS.md 惯例对齐
 */
export const DEFAULT_SPEC_FILE_CANDIDATES = [
  "AGENTS.md",
  "xiangdi.spec.md",
  "openspec/specs/project.md",
] as const;

// ─── FileProjectSpecLoader ────────────────────────────────────────────────────

export interface FileProjectSpecLoaderOptions {
  /**
   * 规范文件的绝对路径
   * 若不指定，将在 cwd 下按 DEFAULT_SPEC_FILE_CANDIDATES 顺序查找
   */
  filePath?: string;
  /**
   * 项目根目录，用于相对路径解析
   * 默认为 process.cwd()
   */
  cwd?: string;
}

/**
 * 从文件系统加载 ProjectSpec
 *
 * 使用示例：
 * ```ts
 * const loader = new FileProjectSpecLoader({ cwd: "/path/to/project" });
 * const spec = await loader.load();
 * if (spec) {
 *   console.log(spec.conventions);
 * }
 * ```
 */
export class FileProjectSpecLoader implements ProjectSpecLoader {
  private readonly options: Required<FileProjectSpecLoaderOptions>;

  constructor(options: FileProjectSpecLoaderOptions = {}) {
    this.options = {
      filePath: options.filePath ?? "",
      cwd: options.cwd ?? (typeof process !== "undefined" ? process.cwd() : "/"),
    };
  }

  async load(): Promise<ProjectSpec | null> {
    const filePath = await this.resolveFilePath();
    if (!filePath) return null;

    const content = await this.readFile(filePath);
    if (content === null) return null;

    const raw: ProjectSpecRaw = {
      filePath,
      content,
      loadedAt: Date.now(),
    };

    return parseProjectSpec(raw);
  }

  // ── 私有方法 ────────────────────────────────────────────────────────────────

  private async resolveFilePath(): Promise<string | null> {
    if (this.options.filePath) {
      return this.options.filePath;
    }

    // 在 cwd 下按候选列表顺序查找
    for (const candidate of DEFAULT_SPEC_FILE_CANDIDATES) {
      const fullPath = `${this.options.cwd}/${candidate}`;
      const exists = await this.fileExists(fullPath);
      if (exists) return fullPath;
    }

    return null;
  }

  private async fileExists(path: string): Promise<boolean> {
    // TODO: 在 Node.js 环境中使用 fs.access，在浏览器环境中始终返回 false
    // 此处为骨架实现，调用方可通过子类覆盖
    try {
      const { access } = await import("node:fs/promises");
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async readFile(path: string): Promise<string | null> {
    // TODO: 在 Node.js 环境中使用 fs.readFile
    try {
      const { readFile } = await import("node:fs/promises");
      return await readFile(path, "utf-8");
    } catch {
      return null;
    }
  }
}

// ─── 内存态 ProjectSpec 加载器（测试 / 嵌入式场景）────────────────────────────

/**
 * 直接从字符串内容加载 ProjectSpec，无需文件系统
 * 适用于测试、浏览器环境、或将规范内嵌到代码中的场景
 */
export class InlineProjectSpecLoader implements ProjectSpecLoader {
  constructor(private readonly content: string) {}

  async load(): Promise<ProjectSpec | null> {
    const raw: ProjectSpecRaw = {
      content: this.content,
      loadedAt: Date.now(),
    };
    return parseProjectSpec(raw);
  }
}

// ─── Markdown 解析器 ──────────────────────────────────────────────────────────

/**
 * 将 Markdown 格式的规范文件解析为结构化的 ProjectSpec
 *
 * 解析规则：
 * - `# Project: <name>` → projectName
 * - 第一个 `#` 标题之后、第一个 `##` 之前的段落 → description
 * - `## Conventions` 下的列表项 → conventions
 * - `## Prohibitions` 下的列表项 → prohibitions
 * - `## Agent Guidelines` 下的列表项 → agentGuidelines
 *
 * 若文件格式不符合约定，将尽力提取，不抛出错误。
 */
export function parseProjectSpec(raw: ProjectSpecRaw): ProjectSpec {
  const lines = raw.content.split("\n");

  let projectName = "Unknown Project";
  let description: string | undefined;
  const conventions: string[] = [];
  const prohibitions: string[] = [];
  const agentGuidelines: string[] = [];

  type Section = "none" | "description" | "conventions" | "prohibitions" | "guidelines";
  let currentSection: Section = "none";
  const descLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // 解析项目名称
    const projectMatch = trimmed.match(/^#\s+Project:\s*(.+)$/i);
    if (projectMatch) {
      projectName = projectMatch[1].trim();
      currentSection = "description";
      continue;
    }

    // 解析二级标题，切换 section
    if (trimmed.startsWith("## ")) {
      const heading = trimmed.slice(3).toLowerCase();
      if (heading.includes("convention")) {
        currentSection = "conventions";
      } else if (heading.includes("prohibition") || heading.includes("forbidden")) {
        currentSection = "prohibitions";
      } else if (heading.includes("agent") || heading.includes("guideline")) {
        currentSection = "guidelines";
      } else {
        currentSection = "none";
      }
      continue;
    }

    // 解析列表项
    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      const item = listMatch[1].trim();
      switch (currentSection) {
        case "conventions":
          conventions.push(item);
          break;
        case "prohibitions":
          prohibitions.push(item);
          break;
        case "guidelines":
          agentGuidelines.push(item);
          break;
        case "description":
          descLines.push(trimmed);
          break;
      }
      continue;
    }

    // 收集描述段落
    if (currentSection === "description" && trimmed.length > 0) {
      descLines.push(trimmed);
    }
  }

  if (descLines.length > 0) {
    description = descLines.join(" ");
  }

  return {
    projectName,
    description,
    conventions,
    prohibitions,
    agentGuidelines,
    raw,
  };
}
