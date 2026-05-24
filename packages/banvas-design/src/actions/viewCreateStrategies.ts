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
  Arc,
  Triangle,
  RegularPolygon,
  ImageElement,
  VideoElement,
  TextParagraph,
  TextFields,
  Graph,
  View,
  GraphView,
  TextView,
  ImageView,
  VideoView,
  Input,
  FlexView,
  ViewType,
  GraphType,
} from '@banyuan/banvasgl'
import type { IComponentTemplate } from '@banyuan/banvasgl'

type DefaultProps = NonNullable<IComponentTemplate['defaultProps']>
type GraphCreatorStrategy = (defaultProps: DefaultProps) => Graph
type ViewCreatorStrategy = (defaultProps: DefaultProps, x: number, y: number) => View

export const graphCreatorStrategies = new Map<string, GraphCreatorStrategy>([
    [
        GraphType.LINE,
        (_props) => new Line(new Point3(0, 0, 0), new Point3(50, 50, 0), Style.DEFAULT),
    ],
    [
        GraphType.CIRCLE,
        (props) => {
            const radius = (props.radius as number | undefined) ?? 50
            return new Circle(new Point3(radius, radius, 0), radius, Style.DEFAULT)
        },
    ],
    [
        GraphType.ROUNDED_RECT,
        (props) => {
            const width  = (props.width  as number | undefined) ?? 100
            const height = (props.height as number | undefined) ?? 100
            const radii  = (props.radii  as any)                ?? 12
            return new RoundedRect(0, 0, width, height, radii, Style.DEFAULT)
        },
    ],
    [
        GraphType.CUBIC_BEZIER,
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
        GraphType.QUADRATIC_BEZIER,
        (props) => {
            const len = (props.length as number | undefined) ?? 120
            return new QuadraticBezier(
                new Point3(0,          0,          0),
                new Point3(len * 0.5, -len * 0.5,  0),
                new Point3(len,        0,           0),
            )
        },
    ],
    [
        GraphType.TRIANGLE,
        (props) => {
            const size = (props.size as number | undefined) ?? 100
            const h = size * Math.sqrt(3) / 2
            return new Triangle(
                new Point3(size / 2, 0,    0),
                new Point3(size,     h,    0),
                new Point3(0,        h,    0),
                Style.DEFAULT,
            )
        },
    ],
    [
        GraphType.REGULAR_POLYGON,
        (props) => {
            const radius = (props.radius as number | undefined) ?? 50
            const sides  = (props.sides  as number | undefined) ?? 6
            return new RegularPolygon(
                new Point3(radius, radius, 0),
                radius,
                sides,
                0,
                Style.DEFAULT,
            )
        },
    ],
    [
        GraphType.ARC,
        (props) => {
            const radius = (props.radius as number | undefined) ?? 50
            return new Arc(
                new Point3(radius, radius, 0),
                radius,
                radius,
                0,
                Math.PI,
                2 * Math.PI,
                false,
                Style.DEFAULT,
            )
        },
    ],
])

export const viewCreatorStrategies = new Map<string, ViewCreatorStrategy>([
    [
        ViewType.GRAPHVIEW,
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
        ViewType.TEXTVIEW,
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
        ViewType.IMAGEVIEW,
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
    [
        ViewType.VIDEOVIEW,
        (props, x, y) => {
            const videoSrc = (props.videoSrc as string | undefined) ?? ''
            const width    = (props.width    as number | undefined) ?? 320
            const height   = (props.height   as number | undefined) ?? 180
            const videoElement = new VideoElement(videoSrc, 0, 0, width, height, Style.DEFAULT)
            return new VideoView(videoElement, {
                style: { width, height },
            }).translate(x, y, 0)
        },
    ],
    [
        ViewType.INPUT,
        (props, x, y) => {
            const text = (props.text as string | undefined) ?? ''
            const textParagraph = TextParagraph.simple(text)
            const textFields = new TextFields([textParagraph])
            return new Input(textFields, {
                style: { width: 200, height: 36 },
            }).translate(x, y, 0)
        },
    ],
    [
        ViewType.FLEXVIEW,
        (props, x, y) => {
            const width  = (props.width  as number | undefined) ?? 300
            const height = (props.height as number | undefined) ?? 100
            return new FlexView({
                style: { width, height },
            }).translate(x, y, 0)
        },
    ],
])
