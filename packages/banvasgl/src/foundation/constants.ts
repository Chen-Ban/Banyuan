/**
 * 图形基元类型枚举
 *
 * 标识 BanvasGL 中所有图形基元的类型，用于 Serializer 注册和 type 字段判断。
 * 每个 Graph 子类通过 type 属性持有对应的 GraphType 值。
 *
 * @example
 * ```ts
 * import { GraphType } from '@banyuan/banvasgl'
 *
 * if (graph.type === GraphType.RECTANGLE) {
 *   // 处理矩形图形
 * }
 * ```
 */
export enum GraphType {
  GRAPH = 'GRAPH',
  ANALYTICGRAPH = 'ANALYTICGRAPH',
  DENSETRAJECTORY = 'DENSETRAJECTORY',
  SKETCH = 'SKETCH',
  LINE = 'LINE',
  ARC = 'ARC',
  CIRCLE = 'CIRCLE',
  BEZIER = 'BEZIER',
  QUADRATIC_BEZIER = 'QUADRATIC_BEZIER',
  CUBIC_BEZIER = 'CUBIC_BEZIER',
  COMBINED_GRAPH = 'COMBINED_GRAPH',
  POLYGON = 'POLYGON',
  TRIANGLE = 'TRIANGLE',
  QUADRILATERAL = 'QUADRILATERAL',
  RECTANGLE = 'RECTANGLE',
  REGULAR_POLYGON = 'REGULAR_POLYGON',
  ROUNDED_RECT = 'ROUNDED_RECT',
  COMPLEX_GRAPH = 'COMPLEX_GRAPH',
  MAGNIFYING_GLASS = 'MAGNIFYING_GLASS',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  TEXTS = 'TEXTS',
  TEXTPARAGRAPH = 'TEXTPARAGRAPH',
  TEXTELEMENT = 'TEXTELEMENT',
  PRINTABLE_TEXTELEMENT = 'PRINTABLE_TEXTELEMENT',
  NONPRINTABLE_TEXTELEMENT = 'NONPRINTABLE_TEXTELEMENT',
  TEXTFIELDS = 'TEXTFIELDS',
}

/**
 * 视图类型标识
 *
 * 使用 string 类型，内置类型定义在 ViewType 常量对象中。
 *
 * @example
 * ```ts
 * import { ViewType } from '@banyuan/banvasgl'
 *
 * if (view.type === ViewType.NODEVIEW) {
 *   // 处理流程图节点
 * }
 * ```
 */
export type ViewType = string

/**
 * 内置视图类型常量
 *
 * 定义 BanvasGL 引擎内置的所有视图类型标识符。
 *
 * @example
 * ```ts
 * import { ViewType } from '@banyuan/banvasgl'
 *
 * if (view.viewType === ViewType.TEXTVIEW) {
 *   // 处理文本视图
 * }
 * ```
 */
export const ViewType = {
  VIEW: 'VIEW',
  TEXTVIEW: 'TEXTVIEW',
  GRAPHVIEW: 'GRAPHVIEW',
  IMAGEVIEW: 'IMAGEVIEW',
  VIDEOVIEW: 'VIDEOVIEW',
  COMBINEDVIEW: 'COMBINEDVIEW',
  SELECTBOXVIEW: 'SELECTBOXVIEW',
  EDITABLETEXT: 'EDITABLETEXT',
  NODEVIEW: 'NODEVIEW',
  EDGEVIEW: 'EDGEVIEW',
  PORTVIEW: 'PORTVIEW',
} as const

/**
 * 数学对象类型枚举
 *
 * 用于 Serializer 注册和 type 字段标识数学对象的具体类型。
 * Point3、Vector3、Matrix4、Bounds 各对应一个值。
 *
 * @example
 * ```ts
 * import { MathType } from '@banyuan/banvasgl'
 *
 * if (obj.type === MathType.POINT3) {
 *   const point = obj as Point3
 * }
 * ```
 */
export enum MathType {
  POINT3 = 'POINT3',
  VECTOR3 = 'VECTOR3',
  MATRIX4 = 'MATRIX4',
  BOUNDS = 'BOUNDS',
}

/**
 * 样式对象类型枚举
 *
 * 用于 Serializer 注册和 type 字段标识样式对象的具体类型。
 * 涵盖颜色、三种渐变、图片/视频图案、填充/描边/阴影样式以及综合样式容器。
 *
 * @example
 * ```ts
 * import { StyleType } from '@banyuan/banvasgl'
 *
 * switch (styleObj.type) {
 *   case StyleType.COLOR:
 *     // 处理纯色
 *     break
 *   case StyleType.LINEAR_GRADIENT:
 *     // 处理线性渐变
 *     break
 * }
 * ```
 */
export enum StyleType {
  COLOR = 'COLOR',
  LINEAR_GRADIENT = 'LINEAR_GRADIENT',
  RADIAL_GRADIENT = 'RADIAL_GRADIENT',
  CONIC_GRADIENT = 'CONIC_GRADIENT',
  IMAGE_PATTERN = 'IMAGE_PATTERN',
  VIDEO_PATTERN = 'VIDEO_PATTERN',
  FILL_STYLE = 'FILL_STYLE',
  STROKE_STYLE = 'STROKE_STYLE',
  SHADOW_STYLE = 'SHADOW_STYLE',
  STYLE = 'STYLE',
}

/**
 * 应用类型枚举
 *
 * 标识 App 对象的类型，用于 Serializer 注册。
 */
export enum AppType {
  APP = 'APP',
}

/**
 * 场景类型枚举
 *
 * 标识场景对象的类型，用于 Serializer 注册。当前仅有默认场景类型。
 *
 * @example
 * ```ts
 * if (obj.type === SceneType.SCENE) {
 *   // 处理场景对象
 * }
 * ```
 */
export enum SceneType {
  SCENE = 'SCENE',
}

/**
 * 相机类型枚举
 *
 * 标识引擎中不同投影模式的相机类型：基础相机、正交投影相机、透视投影相机。
 *
 * @example
 * ```ts
 * import { CameraType } from '@banyuan/banvasgl'
 *
 * const camera = scene.getCamera()
 * if (camera.type === CameraType.ORTHOGRAPHIC) {
 *   // 正交投影模式
 * }
 * ```
 */
export enum CameraType {
  BASE = 'BASE_CAMERA',
  ORTHOGRAPHIC = 'ORTHOGRAPHIC_CAMERA',
  PERSPECTIVE = 'PERSPECTIVE_CAMERA',
}

/**
 * 插件类型枚举
 *
 * 标识 BanvasGL 中通过 mixin 模式附加的视图插件（Addon）类型。
 * 包括包围盒、顶点控制点和盒装饰三种类型。
 *
 * @example
 * ```ts
 * import { AddonType } from '@banyuan/banvasgl'
 *
 * if (addon.type === AddonType.BOUNDING_BOX) {
 *   // 处理包围盒插件
 * }
 * ```
 */
export enum AddonType {
  BOUNDING_BOX = 'BOUNDING_BOX',
  VERTEX = 'VERTEX',
  BOX_DECORATION = 'BOX_DECORATION',
  TEXT_SELECTION = 'TEXT_SELECTION',
  ANIMATION = 'ANIMATION',
}

/**
 * 垂直对齐方式枚举
 *
 * 用于文本、容器视图等场景中的垂直方向对齐配置。
 *
 * @example
 * ```ts
 * import { VerticalAlign } from '@banyuan/banvasgl'
 *
 * textView.setVerticalAlign(VerticalAlign.MIDDLE)
 * ```
 */
export enum VerticalAlign {
  TOP = 'TOP',
  MIDDLE = 'MIDDLE',
  BOTTOM = 'BOTTOM',
}

/**
 * 水平对齐方式枚举
 *
 * 用于文本、容器视图等场景中的水平方向对齐配置。
 *
 * @example
 * ```ts
 * import { HorizontalAlign } from '@banyuan/banvasgl'
 *
 * textView.setHorizontalAlign(HorizontalAlign.CENTER)
 * ```
 */
export enum HorizontalAlign {
  LEFT = 'LEFT',
  CENTER = 'CENTER',
  RIGHT = 'RIGHT',
}

/**
 * 字体样式枚举
 *
 * 定义文本渲染时的字体倾斜样式，对应 CSS font-style 属性值。
 *
 * @example
 * ```ts
 * import { FontStyle } from '@banyuan/banvasgl'
 *
 * textElement.setFontStyle(FontStyle.ITALIC)
 * ```
 */
export enum FontStyle {
  NORMAL = 'normal',
  ITALIC = 'italic',
  OBLIQUE = 'oblique',
}

/**
 * 字体粗细枚举
 *
 * 定义文本渲染时的字体粗细，对应 CSS font-weight 属性值。
 * 支持关键词（normal/bold/bolder/lighter）和数值（100-900）两种形式。
 *
 * @example
 * ```ts
 * import { FontWeight } from '@banyuan/banvasgl'
 *
 * textElement.setFontWeight(FontWeight.BOLD)
 * textElement.setFontWeight(FontWeight.WEIGHT_600)
 * ```
 */
export enum FontWeight {
  NORMAL = 'normal',
  BOLD = 'bold',
  BOLDER = 'bolder',
  LIGHTER = 'lighter',
  WEIGHT_100 = '100',
  WEIGHT_200 = '200',
  WEIGHT_300 = '300',
  WEIGHT_400 = '400',
  WEIGHT_500 = '500',
  WEIGHT_600 = '600',
  WEIGHT_700 = '700',
  WEIGHT_800 = '800',
  WEIGHT_900 = '900',
}

/**
 * Addon 职责标识
 *
 * 每个 addon 通过 capabilities 声明自己参与哪些管线：
 * - RENDER：参与渲染管线（renderPlugins 阶段调用 render()）
 * - INTERACT：参与交互管线（interactPlugins 阶段调用 interact()）
 * - LOGIC：参与逻辑计算（如 BoundingBox 在多选 resize 时提供几何数据，
 *   但不渲染也不交互）
 *
 * 一个 addon 可以同时声明多个职责，管线根据 capabilities 决定是否调用对应方法。
 */
export enum AddonCapability {
  /** 参与渲染管线 —— renderPlugins 阶段调用 render() */
  RENDER = 'RENDER',
  /** 参与交互管线 —— interactPlugins 阶段调用 interact() */
  INTERACT = 'INTERACT',
  /** 参与逻辑计算 —— 不渲染不交互，仅提供数据/计算能力 */
  LOGIC = 'LOGIC',
}

/**
 * 光标样式枚举
 *
 * 对应 CSS cursor 属性值，用于交互过程中设置鼠标光标外观。
 */
export enum Cursor {
  // 基本值
  Auto = 'auto',
  Default = 'default',
  None = 'none',

  // 链接和状态指示
  ContextMenu = 'context-menu',
  Help = 'help',
  Pointer = 'pointer',
  Progress = 'progress',
  Wait = 'wait',

  // 选择
  Cell = 'cell',
  Crosshair = 'crosshair',
  Text = 'text',
  VerticalText = 'vertical-text',

  // 拖拽
  Alias = 'alias',
  Copy = 'copy',
  Move = 'move',
  NoDrop = 'no-drop',
  NotAllowed = 'not-allowed',
  Grab = 'grab',
  Grabbing = 'grabbing',

  // 滚动
  AllScroll = 'all-scroll',

  // 调整大小
  ColResize = 'col-resize',
  RowResize = 'row-resize',
  NResize = 'n-resize',
  EResize = 'e-resize',
  SResize = 's-resize',
  WResize = 'w-resize',
  NeResize = 'ne-resize',
  NwResize = 'nw-resize',
  SeResize = 'se-resize',
  SwResize = 'sw-resize',
  EwResize = 'ew-resize',
  NsResize = 'ns-resize',
  NeswResize = 'nesw-resize',
  NwseResize = 'nwse-resize',

  // 缩放
  ZoomIn = 'zoom-in',
  ZoomOut = 'zoom-out',
}

/** BoundingBox 8 个缩放手柄索引 → 光标样式映射 */
export const cursorMap: Record<number, Cursor> = {
  0: Cursor.NwResize, // 西北
  1: Cursor.NResize, // 北
  2: Cursor.NeResize, // 东北
  3: Cursor.EResize, // 东
  4: Cursor.SeResize, // 东南
  5: Cursor.SResize, // 南
  6: Cursor.SwResize, // 西南
  7: Cursor.WResize, // 西
}

/**
 * 交互动作枚举
 *
 * 标识 View 交互结果（ExtraData）的动作类型，用于判别联合收窄。
 */
export enum Action {
  MOVE,
  RESIZE,
  ROTATE,
  EDIT_POINT,
  EDIT_VIEWPORT,
  SELECT,
  TEXT_SELECTION,
  CONNECT, // 端口连线
  NONE,
}

/** 吸附方向 */
export const enum SnapAxis {
  X = 0,
  Y = 1,
}
