import { Point3 } from "@/index.backend";
import View, { ViewContent } from "./View";
import { ViewAddonImpl } from "../addon/index";

export enum Cursor {
  // 基本值
  Auto = "auto",
  Default = "default",
  None = "none",

  // 链接和状态指示
  ContextMenu = "context-menu",
  Help = "help",
  Pointer = "pointer",
  Progress = "progress",
  Wait = "wait",

  // 选择
  Cell = "cell",
  Crosshair = "crosshair",
  Text = "text",
  VerticalText = "vertical-text",

  // 拖拽
  Alias = "alias",
  Copy = "copy",
  Move = "move",
  NoDrop = "no-drop",
  NotAllowed = "not-allowed",
  Grab = "grab",
  Grabbing = "grabbing",

  // 滚动
  AllScroll = "all-scroll",

  // 调整大小
  ColResize = "col-resize",
  RowResize = "row-resize",
  NResize = "n-resize",
  EResize = "e-resize",
  SResize = "s-resize",
  WResize = "w-resize",
  NeResize = "ne-resize",
  NwResize = "nw-resize",
  SeResize = "se-resize",
  SwResize = "sw-resize",
  EwResize = "ew-resize",
  NsResize = "ns-resize",
  NeswResize = "nesw-resize",
  NwseResize = "nwse-resize",

  // 缩放
  ZoomIn = "zoom-in",
  ZoomOut = "zoom-out",
}

export const cursorMap: Record<number, Cursor> = {
  0: Cursor.NwResize, // 西北
  1: Cursor.NResize, // 北
  2: Cursor.NeResize, // 东北
  3: Cursor.EResize, // 东
  4: Cursor.SeResize, // 东南
  5: Cursor.SResize, // 南
  6: Cursor.SwResize, // 西南
  7: Cursor.WResize, // 西
};
/**
 * 交互结果类型
 * 键值对类型，键是View，值是ViewContent或ViewAddonImpl
 */
export type InteractionMap = Map<View, { content: ViewContent | ViewAddonImpl; extraData: ExtraData }>;

export enum Action {
  MOVE,
  RESIZE,
  ROTATE,
  EDIT_POINT,
  EDIT_VIEWPORT,
  SELECT,
  SELECTION,
  NONE,
}
/**
 * 交互结果数据
 */
export type ExtraData<T extends Action = Action> = {
  cursorStyle: Cursor;
  action: T;
  editPoint?: T extends Action.EDIT_POINT ? Point3 : never;
  viewPortPoint?: T extends Action.EDIT_VIEWPORT ? Point3 : never;
  resizeFixedIndex?: T extends Action.RESIZE ? number : never;
  resizeDynamicIndex?: T extends Action.RESIZE ? number : never;
};
/**
 * 交互结果构建器
 * 提供便捷的方法来构建交互结果
 */
export class InteractionMapBuilder {
  private result: InteractionMap = new Map();

  get size() {
    return this.result.size;
  }

  /**
   * 添加视图和内容的映射
   * @param view 视图
   * @param content 内容（ViewContent或ViewAddonImpl）
   */
  public add(view: View, content: ViewContent | ViewAddonImpl, extraData: ExtraData): InteractionMapBuilder {
    this.result.set(view, { content, extraData });
    return this;
  }
  /**
   * 构建最终结果 - 返回最高层级的view和content对象
   */
  public build(): {
    view: View | null;
    content: ViewContent | ViewAddonImpl | null;
    extraData: ExtraData | null;
  } {
    if (this.result.size === 0) {
      return { view: null, content: null, extraData: null };
    }

    let highestView: View | null = null;
    let highestLayer = -1;
    let content: ViewContent | ViewAddonImpl | null = null;
    let extraData: ExtraData | null = null;

    for (const [view, { content: _content, extraData: _extraData }] of this.result) {
      if (view.layer > highestLayer) {
        highestLayer = view.layer;
        highestView = view;
        content = _content;
        extraData = _extraData;
      }
    }

    return { view: highestView, content, extraData };
  }
}
