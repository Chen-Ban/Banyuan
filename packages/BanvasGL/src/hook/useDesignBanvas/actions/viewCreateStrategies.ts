/**
 * View 创建策略表
 *
 * 将每种 viewType / graphType 的构建逻辑抽离为独立策略函数，
 * 通过 Map 注册，供 viewActions.create 查表调用，消除 if-else 链。
 *
 * 扩展方式：
 *   - 新增 graphType → 在 graphCreatorStrategies 中添加一条记录
 *   - 新增 viewType  → 在 viewCreatorStrategies 中添加一条记录
 */

import { Point3 } from '@/core/math'
import { Style } from '@/core/style'
import {
    Line,
    Circle,
    RoundedRect,
    CubicBezier,
    QuadraticBezier,
    ImageElement,
    TextParagraph,
    TextFields,
    Graph,
} from '@/core/graph'
import {
    View,
    GraphView,
    TextView,
    ImageView,
} from '@/core/views'
import { VIEWTYPE, GRAPHTYPE } from '@/core/constants'
import type { IComponentTemplate } from '@/core/interfaces'

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** 从 template.defaultProps 中提取的创建参数 */
type DefaultProps = NonNullable<IComponentTemplate['defaultProps']>

/**
 * Graph 创建策略：接收 defaultProps，返回对应的 Graph 实例。
 */
type GraphCreatorStrategy = (defaultProps: DefaultProps) => Graph

/**
 * View 创建策略：接收 defaultProps 和放置坐标，返回对应的 View 实例。
 */
type ViewCreatorStrategy = (
    defaultProps: DefaultProps,
    x: number,
    y: number,
) => View

// ─────────────────────────────────────────────
// Graph 创建策略表（GRAPHVIEW 内层）
// ─────────────────────────────────────────────

export const graphCreatorStrategies = new Map<string, GraphCreatorStrategy>([
    [
        GRAPHTYPE.LINE,
        (_props) =>
            new Line(
                new Point3(0, 0, 0),
                new Point3(50, 50, 0),
                Style.DEFAULT,
            ),
    ],
    [
        GRAPHTYPE.CIRCLE,
        (props) => {
            const radius = (props.radius as number | undefined) ?? 50
            return new Circle(new Point3(radius, radius, 0), radius, Style.DEFAULT)
        },
    ],
    [
        GRAPHTYPE.ROUNDED_RECT,
        (props) => {
            const width  = (props.width  as number | undefined) ?? 100
            const height = (props.height as number | undefined) ?? 100
            const radii  = (props.radii  as any)                ?? 12
            return new RoundedRect(0, 0, width, height, radii, Style.DEFAULT)
        },
    ],
    [
        GRAPHTYPE.CUBIC_BEZIER,
        (props) => {
            const len = (props.length as number | undefined) ?? 120
            return new CubicBezier(
                new Point3(0,           0,          0),
                new Point3(len * 0.33, -len * 0.4,  0),
                new Point3(len * 0.67,  len * 0.4,  0),
                new Point3(len,         0,           0),
            )
        },
    ],
    [
        GRAPHTYPE.QUADRATIC_BEZIER,
        (props) => {
            const len = (props.length as number | undefined) ?? 120
            return new QuadraticBezier(
                new Point3(0,          0,          0),
                new Point3(len * 0.5, -len * 0.5,  0),
                new Point3(len,        0,           0),
            )
        },
    ],
])

// ─────────────────────────────────────────────
// View 创建策略表（外层 viewType）
// ─────────────────────────────────────────────

export const viewCreatorStrategies = new Map<string, ViewCreatorStrategy>([
    [
        VIEWTYPE.GRAPHVIEW,
        (props, x, y) => {
            const graphType = props._graphType as string | undefined
            if (!graphType) {
                throw new Error('[BanvasGL] GRAPHVIEW 策略缺少 _graphType 参数')
            }

            const graphStrategy = graphCreatorStrategies.get(graphType)
            if (!graphStrategy) {
                throw new Error(
                    `[BanvasGL] actions.view.create: 未知 graphType "${graphType}"，已跳过`,
                )
            }

            const graph = graphStrategy(props)
            return new GraphView(graph, {
                style: {
                    width:  graph.bounds.width,
                    height: graph.bounds.height,
                },
            }).translate(x, y, 0)
        },
    ],
    [
        VIEWTYPE.TEXTVIEW,
        (props, x, y) => {
            const text         = (props.text as string | undefined) ?? '文本'
            const textParagraph = TextParagraph.simple(text)
            const textFields    = new TextFields([textParagraph])
            return new TextView(textFields, {
                style: { width: 200, height: 24 },
            }).translate(x, y, 0)
        },
    ],
    [
        VIEWTYPE.IMAGEVIEW,
        (props, x, y) => {
            const imageSrc = (props.imageSrc as string | undefined) ?? ''
            const width    = (props.width   as number | undefined) ?? 200
            const height   = (props.height  as number | undefined) ?? 300
            const imageElement = new ImageElement(imageSrc, 0, 0, width, height, Style.DEFAULT)
            return new ImageView(imageElement, {
                style: { width, height },
            }).translate(x, y, 0)
        },
    ],
])
