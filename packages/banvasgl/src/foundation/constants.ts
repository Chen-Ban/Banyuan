/**
 * 图形基元类型枚举
 *
 * 标识 BanvasGL 中所有图形基元的类型，用于 Serializer 注册和 type 字段判断。
 * 每个 Graph 子类通过 type 属性持有对应的 GRAPHTYPE 值。
 *
 * @example
 * ```ts
 * import { GRAPHTYPE } from '@banyuan/banvasgl'
 *
 * if (graph.type === GRAPHTYPE.RECTANGLE) {
 *   // 处理矩形图形
 * }
 * ```
 */
export enum GRAPHTYPE {
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
 * 使用 string 而非 enum，允许业务层通过 ViewRegistry 动态注册自定义视图类型。
 * 内置类型定义在 VIEWTYPE 常量对象中，自定义类型可为任意字符串。
 *
 * @example
 * ```ts
 * const myType: ViewType = 'MY_CUSTOM_VIEW'
 * ViewRegistry.register(myType, MyCustomView)
 * ```
 */
export type ViewType = string

/**
 * 内置视图类型常量
 *
 * 定义 BanvasGL 引擎内置的所有视图类型标识符。
 * 业务层可通过 ViewRegistry.register 注册额外的视图类型。
 *
 * @example
 * ```ts
 * import { VIEWTYPE } from '@banyuan/banvasgl'
 *
 * if (view.viewType === VIEWTYPE.TEXTVIEW) {
 *   // 处理文本视图
 * }
 * ```
 */
export const VIEWTYPE = {
    VIEW: 'VIEW',
    TEXTVIEW: 'TEXTVIEW',
    GRAPHVIEW: 'GRAPHVIEW',
    IMAGEVIEW: 'IMAGEVIEW',
    VIDEOVIEW: 'VIDEOVIEW',
    COMBINEDVIEW: 'COMBINEDVIEW',
    FLEXVIEW: 'FLEXVIEW',
    SELECTBOXVIEW: 'SELECTBOXVIEW',
    INPUT: 'INPUT',
    EDITABLETEXT: 'EDITABLETEXT',
} as const

/**
 * 数学对象类型枚举
 *
 * 用于 Serializer 注册和 type 字段标识数学对象的具体类型。
 * Point3、Vector3、Matrix4、Bounds 各对应一个值。
 *
 * @example
 * ```ts
 * import { MATHTYPE } from '@banyuan/banvasgl'
 *
 * if (obj.type === MATHTYPE.POINT3) {
 *   const point = obj as Point3
 * }
 * ```
 */
export enum MATHTYPE {
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
 * import { STYLETYPE } from '@banyuan/banvasgl'
 *
 * switch (styleObj.type) {
 *   case STYLETYPE.COLOR:
 *     // 处理纯色
 *     break
 *   case STYLETYPE.LINEAR_GRADIENT:
 *     // 处理线性渐变
 *     break
 * }
 * ```
 */
export enum STYLETYPE {
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
 * 场景类型枚举
 *
 * 标识场景对象的类型，用于 Serializer 注册。当前仅有默认场景类型。
 *
 * @example
 * ```ts
 * if (obj.type === SCENETYPE.SCENE) {
 *   // 处理场景对象
 * }
 * ```
 */
export enum SCENETYPE {
    SCENE = 'SCENE',
}

/**
 * 相机类型枚举
 *
 * 标识引擎中不同投影模式的相机类型：基础相机、正交投影相机、透视投影相机。
 *
 * @example
 * ```ts
 * import { CAMERATYPE } from '@banyuan/banvasgl'
 *
 * const camera = scene.getCamera()
 * if (camera.type === CAMERATYPE.ORTHOGRAPHIC) {
 *   // 正交投影模式
 * }
 * ```
 */
export enum CAMERATYPE {
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
 * import { ADDONTYPE } from '@banyuan/banvasgl'
 *
 * if (addon.type === ADDONTYPE.BOUNDING_BOX) {
 *   // 处理包围盒插件
 * }
 * ```
 */
export enum ADDONTYPE {
    BOUNDING_BOX = 'BOUNDING_BOX',
    VERTEX = 'VERTEX',
    BOX_DECORATION = 'BOX_DECORATION',
}

/**
 * 垂直对齐方式枚举
 *
 * 用于文本、容器视图等场景中的垂直方向对齐配置。
 *
 * @example
 * ```ts
 * import { VERTICALALIGN } from '@banyuan/banvasgl'
 *
 * textView.setVerticalAlign(VERTICALALIGN.MIDDLE)
 * ```
 */
export enum VERTICALALIGN {
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
 * import { HORIZONTALALIGN } from '@banyuan/banvasgl'
 *
 * textView.setHorizontalAlign(HORIZONTALALIGN.CENTER)
 * ```
 */
export enum HORIZONTALALIGN {
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
