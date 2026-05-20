/**
 * View 创建策略表
 */

import {
  Point3,
  Style,
  Line,
  Circle,
  RoundedRect,
  CubicBezier,
  QuadraticBezier,
  ImageElement,
  TextParagraph,
  TextFields,
  Graph,
  View,
  GraphView,
  TextView,
  ImageView,
  VIEWTYPE,
  GRAPHTYPE,
} from '@banyuan/canvas'
import type { IComponentTemplate } from '@banyuan/canvas'

type DefaultProps = NonNullable<IComponentTemplate['defaultProps']>
type GraphCreatorStrategy = (defaultProps: DefaultProps) => Graph
type ViewCreatorStrategy = (defaultProps: DefaultProps, x: number, y: number) => View

export const graphCreatorStrategies = new Map<string, GraphCreatorStrategy>([
    [
        GRAPHTYPE.LINE,
        (_props) => new Line(new Point3(0, 0, 0), new Point3(50, 50, 0), Style.DEFAULT),
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

export const viewCreatorStrategies = new Map<string, ViewCreatorStrategy>([
    [
        VIEWTYPE.GRAPHVIEW,
        (props, x, y) => {
            const graphType = props._graphType as string | undefined
            if (!graphType) {
                throw new Error('[BanvasDesign] GRAPHVIEW 策略缺少 _graphType 参数')
            }

            const graphStrategy = graphCreatorStrategies.get(graphType)
            if (!graphStrategy) {
                throw new Error(`[BanvasDesign] 未知 graphType "${graphType}"`)
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
            const text = (props.text as string | undefined) ?? '文本'
            const textParagraph = TextParagraph.simple(text)
            const textFields = new TextFields([textParagraph])
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
