/**
 * 相地 · 组装器
 *
 * 如同园林中「因借体宜」—— 各处景致虽独立营造，
 * 最终需统一于一园之中，山水相映，路径贯通。
 *
 * Assembler 负责：
 * 1. 根据 AssemblyPlan 将各 SubAgent 的本地坐标节点转换到全局坐标
 * 2. 将所有容器节点合并为一个完整的 AIPage
 * 3. 验证数据绑定和事件连线的端口匹配
 * 4. 生成最终的页面结构
 */

import type { AINode, AIPage } from "../schema/AISchema.js";
import type {
  SubAgentResult,
  AssemblyPlan,
  ContainerPlacement,
  DataBinding,
  EventWiring,
} from "./types.js";

// ─── 组装错误 ────────────────────────────────────────────────────────────────

export class AssemblyError extends Error {
  constructor(
    message: string,
    public readonly details: AssemblyDiagnostic[]
  ) {
    super(message);
    this.name = "AssemblyError";
  }
}

export interface AssemblyDiagnostic {
  level: "error" | "warning";
  taskId?: string;
  message: string;
}

// ─── Assembler ───────────────────────────────────────────────────────────────

export class Assembler {
  /**
   * 执行页面组装
   *
   * @param plan 组装计划（由 OrchestratorAgent 生成）
   * @param results 所有 SubAgent 的结果
   * @returns 组装后的完整 AIPage
   * @throws AssemblyError 当存在不可恢复的组装错误时
   */
  assemble(plan: AssemblyPlan, results: SubAgentResult[]): AIPage {
    const diagnostics: AssemblyDiagnostic[] = [];

    // 1. 验证所有 placement 都有对应的 result
    this.validateCompleteness(plan, results, diagnostics);

    // 2. 验证数据绑定端口匹配
    this.validateDataBindings(plan.dataBindings, results, diagnostics);

    // 3. 验证事件连线端口匹配
    this.validateEventWirings(plan.eventWirings, results, diagnostics);

    // 检查是否有 error 级别诊断
    const errors = diagnostics.filter((d) => d.level === "error");
    if (errors.length > 0) {
      throw new AssemblyError(
        `组装失败：${errors.length} 个错误`,
        diagnostics
      );
    }

    // 4. 坐标转换 + 合并节点
    const allNodes = this.transformAndMerge(plan.placements, results);

    // 5. 构建最终 AIPage
    const page: AIPage = {
      id: plan.page.id,
      name: plan.page.name,
      width: plan.page.width,
      height: plan.page.height,
      backgroundColor: plan.page.backgroundColor,
      nodes: allNodes,
    };

    return page;
  }

  /**
   * 验证完整性：每个 placement 都有对应的成功结果
   */
  private validateCompleteness(
    plan: AssemblyPlan,
    results: SubAgentResult[],
    diagnostics: AssemblyDiagnostic[]
  ): void {
    for (const placement of plan.placements) {
      const result = results.find((r) => r.taskId === placement.taskId);
      if (!result) {
        diagnostics.push({
          level: "error",
          taskId: placement.taskId,
          message: `容器 ${placement.taskId} 无对应的 SubAgent 结果`,
        });
      } else if (result.status === "failed") {
        diagnostics.push({
          level: "error",
          taskId: placement.taskId,
          message: `容器 ${placement.taskId} 生成失败: ${result.error}`,
        });
      } else if (result.status === "partial") {
        diagnostics.push({
          level: "warning",
          taskId: placement.taskId,
          message: `容器 ${placement.taskId} 仅部分生成`,
        });
      }
    }
  }

  /**
   * 验证数据绑定：源端口和目标端口都存在且类型兼容
   */
  private validateDataBindings(
    bindings: DataBinding[],
    results: SubAgentResult[],
    diagnostics: AssemblyDiagnostic[]
  ): void {
    for (const binding of bindings) {
      // 检查源端口
      const sourceResult = results.find(
        (r) => r.taskId === binding.source.taskId
      );
      if (!sourceResult) {
        diagnostics.push({
          level: "error",
          message: `数据绑定 ${binding.id}：源容器 ${binding.source.taskId} 不存在`,
        });
        continue;
      }

      const sourcePort = sourceResult.ports.data.find(
        (p) => p.id === binding.source.portId
      );
      if (!sourcePort) {
        diagnostics.push({
          level: "warning",
          taskId: binding.source.taskId,
          message: `数据绑定 ${binding.id}：源端口 ${binding.source.portId} 不存在`,
        });
      }

      // 检查目标端口
      const targetResult = results.find(
        (r) => r.taskId === binding.target.taskId
      );
      if (!targetResult) {
        diagnostics.push({
          level: "error",
          message: `数据绑定 ${binding.id}：目标容器 ${binding.target.taskId} 不存在`,
        });
        continue;
      }

      const targetPort = targetResult.ports.data.find(
        (p) => p.id === binding.target.portId
      );
      if (!targetPort) {
        diagnostics.push({
          level: "warning",
          taskId: binding.target.taskId,
          message: `数据绑定 ${binding.id}：目标端口 ${binding.target.portId} 不存在`,
        });
      }

      // 类型兼容性检查
      if (sourcePort && targetPort && sourcePort.dataType !== targetPort.dataType) {
        diagnostics.push({
          level: "warning",
          message: `数据绑定 ${binding.id}：类型不匹配 (${sourcePort.dataType} → ${targetPort.dataType})`,
        });
      }
    }
  }

  /**
   * 验证事件连线：emitter 和 listener 都存在
   */
  private validateEventWirings(
    wirings: EventWiring[],
    results: SubAgentResult[],
    diagnostics: AssemblyDiagnostic[]
  ): void {
    for (const wiring of wirings) {
      const emitterResult = results.find(
        (r) => r.taskId === wiring.emitter.taskId
      );
      if (!emitterResult) {
        diagnostics.push({
          level: "error",
          message: `事件连线 ${wiring.id}：触发方容器 ${wiring.emitter.taskId} 不存在`,
        });
        continue;
      }

      const emitPort = emitterResult.ports.events.find(
        (e) => e.id === wiring.emitter.eventId
      );
      if (!emitPort) {
        diagnostics.push({
          level: "warning",
          taskId: wiring.emitter.taskId,
          message: `事件连线 ${wiring.id}：触发事件 ${wiring.emitter.eventId} 不存在`,
        });
      }

      const listenerResult = results.find(
        (r) => r.taskId === wiring.listener.taskId
      );
      if (!listenerResult) {
        diagnostics.push({
          level: "error",
          message: `事件连线 ${wiring.id}：监听方容器 ${wiring.listener.taskId} 不存在`,
        });
        continue;
      }

      const listenPort = listenerResult.ports.events.find(
        (e) => e.id === wiring.listener.eventId
      );
      if (!listenPort) {
        diagnostics.push({
          level: "warning",
          taskId: wiring.listener.taskId,
          message: `事件连线 ${wiring.id}：监听事件 ${wiring.listener.eventId} 不存在`,
        });
      }
    }
  }

  /**
   * 坐标转换并合并所有容器节点
   *
   * 将每个容器的本地坐标节点根据 placement 转换到页面全局坐标系，
   * 然后按 zIndex 排序合并。
   */
  private transformAndMerge(
    placements: ContainerPlacement[],
    results: SubAgentResult[]
  ): AINode[] {
    // 按 zIndex 排序 placements
    const sortedPlacements = [...placements].sort(
      (a, b) => a.zIndex - b.zIndex
    );

    const allNodes: AINode[] = [];

    for (const placement of sortedPlacements) {
      const result = results.find((r) => r.taskId === placement.taskId);
      if (!result || result.nodes.length === 0) continue;

      // 对容器内的每个顶层节点进行坐标偏移
      const transformedNodes = result.nodes.map((node) =>
        this.offsetNode(node, placement.position.x, placement.position.y)
      );

      allNodes.push(...transformedNodes);
    }

    return allNodes;
  }

  /**
   * 对节点及其子节点递归进行坐标偏移
   */
  private offsetNode(node: AINode, dx: number, dy: number): AINode {
    // 浅拷贝节点
    const shifted = { ...node };

    // 偏移 transform.position
    shifted.transform = {
      ...node.transform,
      position: {
        x: node.transform.position.x + dx,
        y: node.transform.position.y + dy,
      },
    };

    // 如果是 group，递归处理子节点
    // 注意：group 的 children 使用相对于 group 的本地坐标，
    // 所以只需要偏移 group 本身，不需要递归偏移 children
    if (shifted.type === "group" && "children" in shifted) {
      shifted.children = [...(shifted as { children: AINode[] }).children];
    }

    return shifted as AINode;
  }
}
