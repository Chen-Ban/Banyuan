/**
 * NodeView —— 流程图节点（v2.0.0 slots 架构适配）
 *
 * 基于 category + kind 判别联合类型，通过 slots[] 访问所有业务数据。
 * 端口自动推导，外观策略按 category/kind 组合决定。
 */

import Point3 from "@/foundation/math/Point3.js";
import { ViewType } from "@/foundation/constants.js";
import ContainerView from "@/view/ContainerView/index.js";
import Rectangle from "@/graph/combined/Polygon/Rectangle.js";
import PortView from "./PortView.js";
import type {
  INodeView,
  PortDirection,
  IInteractResult,
  IContainerViewOptions,
  FlowNode,
} from "@/types/index.js";
import type { IDrawingContext } from '@/types/platform/context.js'

// 节点默认尺寸
const NODE_DEFAULT_WIDTH = 160;
const NODE_DEFAULT_HEIGHT = 80;

// ── 节点外观策略 ──

// ── 端口推导 ──

export interface PortDefinition {
  id: string;
  direction: PortDirection;
  index?: number;
  maxConnections?: number;
}

/**
 * 从 FlowNode 推导端口（v2.0.0 slots 架构）。
 *
 * 端口 ID 编码约定：`{nodeId}_{suffix}`
 * - 控制输入: `_in`
 * - 控制输出（默认）: `_out`
 * - 数据输出（source/compute）: `_value`
 * - 条件分支: `_{slotIndex}`（0, 1, 2, …）
 * - 函数参数: `_param_{name}`
 */
function derivePortsFromSchema(schema: FlowNode): PortDefinition[] {
  const ports: PortDefinition[] = [];
  const { id, category, kind } = schema;

  // source / compute: 仅数据输出端口（无控制流入口）
  if (category === "source" || category === "compute") {
    ports.push({
      id: `${id}_value`,
      direction: "output",
      maxConnections: Infinity,
    });
    return ports;
  }

  // control / action / function: 有控制输入
  ports.push({ id: `${id}_in`, direction: "input" });

  if (kind === "condition") {
    // 每个 slot 是一条条件分支，按索引生成输出端口
    for (let i = 0; i < schema.slots.length; i++) {
      ports.push({ id: `${id}_${i}`, direction: "output" });
    }
  } else if (kind === "return" || kind === "navigate") {
    // 终点节点：无出端口
  } else if (kind === "function") {
    // 函数节点：参数端口从 slots[0].input 的 key 推导
    const slot0 = schema.slots[0];
    if (slot0 && slot0.input) {
      for (const paramName of Object.keys(slot0.input)) {
        ports.push({
          id: `${id}_param_${paramName}`,
          direction: "input",
          maxConnections: Infinity,
        });
      }
    }
    ports.push({ id: `${id}_out`, direction: "output" });
  } else {
    // 默认：一个控制输出端口
    ports.push({ id: `${id}_out`, direction: "output" });
  }

  return ports;
}

// ── 标题推导 ──

/** 全量 25 种 kind → 中文标题 */
const KIND_TITLES: Record<string, string> = {
  // control
  condition: "条件分支",
  loop: "循环",
  parallel: "并行执行",
  return: "返回",
  // function
  function: "本地函数",
  // action
  setVariable: "设置变量",
  setViewData: "设置 View 数据",
  setViewVisible: "显隐控制",
  playAnimation: "播放动画",
  navigate: "跳转页面",
  cloudFunction: "云函数",
  httpRequest: "HTTP 请求",
  dbQuery: "数据库查询",
  dbInsert: "数据库插入",
  dbUpdate: "数据库更新",
  dbDelete: "数据库删除",
  // source
  literal: "字面量",
  context: "上下文",
  // compute
  math: "算术运算",
  compare: "比较运算",
  logic: "逻辑运算",
  concat: "拼接字符串",
  format: "格式化",
  get: "字段提取",
};

function deriveTitleFromSchema(schema: FlowNode): string {
  return KIND_TITLES[schema.kind] || schema.kind || "Node";
}


// ── NodeView 类 ──

export interface NodeViewOptions extends IContainerViewOptions {
  schema: FlowNode;
  nodeTitle?: string;
  ports?: PortDefinition[];
}

export default class NodeView extends ContainerView implements INodeView {
  public readonly type = ViewType.NODEVIEW;
  public nodeTitle: string;
  public schema: FlowNode;

  constructor(options: NodeViewOptions) {
    const w = options.style?.width ?? NODE_DEFAULT_WIDTH;
    const h = options.style?.height ?? NODE_DEFAULT_HEIGHT;

    super({
      ...options,
      id: options.schema.id,
      style: {
        width: w,
        height: h,
        overflow: "visible",
        ...(options.style ?? {}),
      },
      content: new Rectangle(0, 0, w as number, h as number),
    });

    this.schema = options.schema;
    this.nodeTitle = options.nodeTitle ?? deriveTitleFromSchema(options.schema);

    // 自动推导端口
    const ports = options.ports ?? derivePortsFromSchema(options.schema);
    this.createPorts(ports);
  }

  private createPorts(portDefs: PortDefinition[]): void {
    for (const def of portDefs) {
      const port = new PortView({
        id: def.id,
        portDirection: def.direction,
        portIndex: def.index,
        maxConnections: def.maxConnections,
      });
      this.addChild(port);
    }
  }

  protected override interactChildren(
    scrolledPoint: Point3,
    bufferCtx: IDrawingContext,
  ): IInteractResult {
    // 将 scrolledPoint 转回世界坐标传给 PortView 子节点
    const worldPoint = this.getMVPMatrix().multiply(scrolledPoint);
    // PortView 优先
    for (const child of this.children) {
      if (child instanceof PortView) {
        const result = child.interact(worldPoint, bufferCtx);
        if (result.view && result.content && result.extraData) return result;
      }
    }
    // 回退到默认子节点检测
    return super.interactChildren(scrolledPoint, bufferCtx);
  }

  public copy(): NodeView {
    return new NodeView({
      id: this.id,
      schema: this.schema,
      nodeTitle: this.nodeTitle,
      style: { ...this.style },
      matrix: this.matrix.copy(),
    });
  }

  // ── 序列化 ──

  public override toJSON(): any {
    return {
      ...super.toJSON(),
      schema: this.schema,
      nodeTitle: this.nodeTitle,
    }
  }

  public static fromJSON(data: any): NodeView {
    const node = new NodeView({
      schema: data.schema,
      nodeTitle: data.nodeTitle,
    })
    node.restoreCommonFields(data)
    return node
  }
}
