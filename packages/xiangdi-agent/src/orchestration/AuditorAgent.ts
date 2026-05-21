/**
 * 相地 · 审计 Agent
 *
 * 如同园林营造中「品题」环节 —— 品评全园格局，
 * 审计 Agent 携带图形库第一层知识（基础规则），
 * 验证组装后的页面是否能正常展示。
 *
 * 职责：
 * 1. 节点边界检查：是否溢出页面范围
 * 2. 可见性检查：是否有不可见的节点（零尺寸、完全透明等）
 * 3. 布局合理性：是否有重叠或异常间距
 * 4. 数据绑定完整性：端口是否都已连接
 * 5. 兜底修复：对简单问题自动修正
 *
 * 设计决策：
 * - 审计分为「规则检查」（确定性）和「LLM 审查」（启发式）两阶段
 * - 规则检查不依赖 LLM，快速、可靠
 * - LLM 审查用于判断布局美观度和逻辑合理性（可选）
 */

import type { LLMClient } from "../core/AgentLoop.js";
import type { AINode, AIPage } from "../schema/AISchema.js";
import type {
  AuditRequest,
  AuditResult,
  AuditIssue,
  AuditSeverity,
  SubAgentResult,
  AssemblyPlan,
  OrchestrationConfig,
} from "./types.js";

// ─── AuditorAgent ───────────────────────────────────────────────────────────

export class AuditorAgent {
  private readonly config: OrchestrationConfig;

  constructor(config: OrchestrationConfig) {
    this.config = config;
  }

  /**
   * 执行审计
   *
   * @param client LLM 客户端（用于启发式审查，可选）
   * @param request 审计请求
   * @returns 审计结果
   */
  async audit(client: LLMClient, request: AuditRequest): Promise<AuditResult> {
    const issues: AuditIssue[] = [];

    // ── 阶段一：规则检查（确定性）──────────────────────────────────────────
    this.checkBounds(request.assembledPage, issues);
    this.checkVisibility(request.assembledPage, issues);
    this.checkOverlap(request.assembledPage, issues);
    this.checkDataBindings(request, issues);

    // ── 阶段二：LLM 启发式审查（可选）──────────────────────────────────────
    // 当前版本仅做规则检查，LLM 审查预留接口
    // TODO: 实现 LLM 审查（布局美观度、逻辑一致性）
    void client; // 预留参数，避免 lint 报错

    // ── 判定是否通过 ─────────────────────────────────────────────────────────
    const hasErrors = issues.some((i) => i.severity === "error");

    // ── 自动修复（如果配置启用）──────────────────────────────────────────────
    let fixedPage: AIPage | undefined;
    let fixSummary: string | undefined;

    if (hasErrors && this.config.autoFix) {
      const fixResult = this.attemptAutoFix(request.assembledPage, issues);
      if (fixResult) {
        fixedPage = fixResult.page;
        fixSummary = fixResult.summary;
      }
    }

    return {
      passed: !hasErrors,
      issues,
      fixedPage,
      fixSummary,
    };
  }

  // ─── 规则检查方法 ────────────────────────────────────────────────────────

  /**
   * 边界检查：节点是否超出页面范围
   */
  private checkBounds(page: AIPage, issues: AuditIssue[]): void {
    for (const node of page.nodes) {
      this.checkNodeBounds(node, page.width, page.height, issues);
    }
  }

  private checkNodeBounds(
    node: AINode,
    pageWidth: number,
    pageHeight: number,
    issues: AuditIssue[]
  ): void {
    const { position, size } = node.transform;
    const right = position.x + size.width;
    const bottom = position.y + size.height;

    // 完全超出页面
    if (position.x >= pageWidth || position.y >= pageHeight) {
      issues.push({
        severity: "error",
        nodeId: node.id,
        category: "overflow",
        message: `节点 "${node.name ?? node.id}" 完全超出页面范围 (x=${position.x}, y=${position.y})`,
        suggestion: `将节点移动到页面可见区域内`,
      });
    }
    // 部分超出
    else if (right > pageWidth || bottom > pageHeight) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        category: "overflow",
        message: `节点 "${node.name ?? node.id}" 部分超出页面 (右=${right}, 下=${bottom})`,
        suggestion: `调整位置或尺寸使其完全在页面内`,
      });
    }

    // 递归检查 group 子节点（使用 group 本地坐标系）
    if (node.type === "group" && "children" in node) {
      for (const child of (node as { children: AINode[] }).children) {
        // Group 内子节点的绝对位置需要加上 group 的位置
        this.checkNodeBoundsAbsolute(
          child,
          position.x,
          position.y,
          pageWidth,
          pageHeight,
          issues
        );
      }
    }
  }

  private checkNodeBoundsAbsolute(
    node: AINode,
    parentX: number,
    parentY: number,
    pageWidth: number,
    pageHeight: number,
    issues: AuditIssue[]
  ): void {
    const absX = parentX + node.transform.position.x;
    const absY = parentY + node.transform.position.y;
    const right = absX + node.transform.size.width;
    const bottom = absY + node.transform.size.height;

    if (absX >= pageWidth || absY >= pageHeight) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        category: "overflow",
        message: `子节点 "${node.name ?? node.id}" 绝对位置超出页面`,
      });
    } else if (right > pageWidth || bottom > pageHeight) {
      issues.push({
        severity: "info",
        nodeId: node.id,
        category: "overflow",
        message: `子节点 "${node.name ?? node.id}" 部分超出页面边界`,
      });
    }
  }

  /**
   * 可见性检查：节点是否实际可见
   */
  private checkVisibility(page: AIPage, issues: AuditIssue[]): void {
    for (const node of page.nodes) {
      this.checkNodeVisibility(node, issues);
    }
  }

  private checkNodeVisibility(node: AINode, issues: AuditIssue[]): void {
    const { size, opacity } = node.transform;

    // 零尺寸
    if (size.width <= 0 || size.height <= 0) {
      issues.push({
        severity: "warning",
        nodeId: node.id,
        category: "visibility",
        message: `节点 "${node.name ?? node.id}" 尺寸为零或负值 (${size.width}×${size.height})`,
        suggestion: `设置合理的正数尺寸`,
      });
    }

    // 完全透明
    if (opacity <= 0) {
      issues.push({
        severity: "info",
        nodeId: node.id,
        category: "visibility",
        message: `节点 "${node.name ?? node.id}" 完全透明 (opacity=${opacity})`,
      });
    }
  }

  /**
   * 重叠检查：检测严重的节点重叠
   */
  private checkOverlap(page: AIPage, issues: AuditIssue[]): void {
    const topLevelNodes = page.nodes;
    for (let i = 0; i < topLevelNodes.length; i++) {
      for (let j = i + 1; j < topLevelNodes.length; j++) {
        const a = topLevelNodes[i];
        const b = topLevelNodes[j];
        const overlap = this.computeOverlapRatio(a, b);

        // 超过 80% 重叠视为问题
        if (overlap > 0.8) {
          issues.push({
            severity: "warning",
            nodeId: a.id,
            category: "layout",
            message: `节点 "${a.name ?? a.id}" 与 "${b.name ?? b.id}" 重叠超过 80%`,
            suggestion: `检查定位是否正确，避免不必要的重叠`,
          });
        }
      }
    }
  }

  /**
   * 计算两个节点的重叠比例（基于较小面积）
   */
  private computeOverlapRatio(a: AINode, b: AINode): number {
    const ax1 = a.transform.position.x;
    const ay1 = a.transform.position.y;
    const ax2 = ax1 + a.transform.size.width;
    const ay2 = ay1 + a.transform.size.height;

    const bx1 = b.transform.position.x;
    const by1 = b.transform.position.y;
    const bx2 = bx1 + b.transform.size.width;
    const by2 = by1 + b.transform.size.height;

    const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
    const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
    const overlapArea = overlapX * overlapY;

    const areaA = a.transform.size.width * a.transform.size.height;
    const areaB = b.transform.size.width * b.transform.size.height;
    const smallerArea = Math.min(areaA, areaB);

    return smallerArea > 0 ? overlapArea / smallerArea : 0;
  }

  /**
   * 数据绑定检查
   */
  private checkDataBindings(
    request: AuditRequest,
    issues: AuditIssue[]
  ): void {
    const { assemblyPlan, subAgentResults } = request;

    // 检查所有 required in 端口是否已绑定
    for (const result of subAgentResults) {
      const requiredInPorts = result.ports.data.filter(
        (p) => p.direction === "in" && p.required
      );

      for (const port of requiredInPorts) {
        const isBound = assemblyPlan.dataBindings.some(
          (b) =>
            b.target.taskId === result.taskId &&
            b.target.portId === port.id
        );

        if (!isBound) {
          issues.push({
            severity: "warning",
            taskId: result.taskId,
            category: "data_binding",
            message: `容器 ${result.taskId} 的必需数据端口 "${port.name}" 未绑定`,
            suggestion: `连接一个数据源到此端口，或设置默认值`,
          });
        }
      }
    }
  }

  // ─── 自动修复 ────────────────────────────────────────────────────────────

  /**
   * 尝试自动修复简单问题
   */
  private attemptAutoFix(
    page: AIPage,
    issues: AuditIssue[]
  ): { page: AIPage; summary: string } | null {
    const fixableIssues = issues.filter(
      (i) =>
        i.severity === "error" &&
        (i.category === "overflow" || i.category === "visibility")
    );

    if (fixableIssues.length === 0) return null;

    // 深拷贝页面
    const fixedPage: AIPage = JSON.parse(JSON.stringify(page));
    const fixes: string[] = [];

    for (const issue of fixableIssues) {
      if (issue.category === "overflow" && issue.nodeId) {
        const node = fixedPage.nodes.find((n) => n.id === issue.nodeId);
        if (node) {
          // 将超出的节点拉回页面内
          const maxX = fixedPage.width - node.transform.size.width;
          const maxY = fixedPage.height - node.transform.size.height;
          node.transform.position.x = Math.max(0, Math.min(node.transform.position.x, maxX));
          node.transform.position.y = Math.max(0, Math.min(node.transform.position.y, maxY));
          fixes.push(`将节点 "${node.name ?? node.id}" 移回页面内`);
        }
      }
    }

    if (fixes.length === 0) return null;

    return {
      page: fixedPage,
      summary: `自动修复了 ${fixes.length} 个问题：${fixes.join("；")}`,
    };
  }
}
