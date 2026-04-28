import Scene from '@/core/scene/Scene'
import Matrix4 from '@/core/math/Matrix4'
import { Point3, Vector3 } from '@/core/math'
import Style from '@/core/style/Style'

// 样式子类型
import Color from '@/core/style/Color'
import FillStyle from '@/core/style/FillStyle'
import StrokeStyle from '@/core/style/StrokeStyle'
import ShadowStyle from '@/core/style/ShadowStyle'
import Gradient from '@/core/style/Gradient'
import ImagePattern from '@/core/style/Image'
import VideoPattern from '@/core/style/Video'
import Bounds from '@/core/graph/base/Bounds'

// 图形类型
import CombinedGraph from '@/core/graph/combined/CombinedGraph'
import Line from '@/core/graph/analytic/Line'
import Circle from '@/core/graph/analytic/Circle'
import Arc from '@/core/graph/analytic/Arc'
import QuadraticBezier from '@/core/graph/analytic/QuadraticBezier'
import CubicBezier from '@/core/graph/analytic/CubicBezier'
import Polygon from '@/core/graph/combined/Polygon/Polygon'
import Triangle from '@/core/graph/combined/Polygon/Triangle'
import Rectangle from '@/core/graph/combined/Polygon/Rectangle'
import RegularPolygon from '@/core/graph/combined/Polygon/RegularPolygon'

// Media / Text 图形类型
import ImageElement from '@/core/graph/media/ImageElement'
import VideoElement from '@/core/graph/media/VideoElement'
import TextFields from '@/core/graph/text/TextFields'
import TextParagraph from '@/core/graph/text/TextParagraph'
import {
    PrintableTextElement,
    NonPrintableTextElement,
} from '@/core/graph/text/TextElement'
import DenseTrajectory from '@/core/graph/trajectory/DenseTrajectory'

// 容器类型
import CombinedView from '@/core/views/CombinedViews'
import GraphView from '@/core/views/GraphViews'
import TextView from '@/core/views/TextView'
import ImageView from '@/core/views/MediaViews/ImageView'
import VideoView from '@/core/views/MediaViews/VideoView'

// 相机类型
import OrthographicCamera from '@/core/camera/OrthographicCamera'
import PerspectiveCamera from '@/core/camera/PerspectiveCamera'

// ISerializable
import type { ISerializable, SerializableStatic } from '@/core/interfaces'
import { MATHTYPE, STYLETYPE, GRAPHTYPE, VIEWTYPE, SCENETYPE } from '@/core/constants'

/**
 * 序列化配置选项
 */
export interface SerializerOptions {
    /** 是否包含函数 */
    includeFunctions?: boolean
    /** 是否包含私有属性 */
    includePrivate?: boolean
    /** 是否处理循环引用 */
    handleCircularRefs?: boolean
    /** 最大序列化深度 */
    maxDepth?: number
    /** 自定义序列化器映射 */
    customSerializers?: Map<string, (obj: any) => any>
    /** 自定义反序列化器映射 */
    customDeserializers?: Map<string, (data: any) => any>
}

/**
 * 序列化数据接口
 */
export interface SerializedData {
    /** 类型标识 */
    type: string
    /** 版本号 */
    version: string
    /** 数据内容 */
    data: any
    /** 元数据 */
    metadata?: {
        timestamp: number
        source: string
        [key: string]: any
    }
}

/**
 * 类型注册信息
 */
interface TypeRegistry {
    type: string
    constructor: new (...args: any[]) => any
    serializer?: (obj: any) => any
    deserializer?: (data: any) => any
}

/**
 * 核心对象序列化工具类
 *
 * 实现了 ISerializable 的类会自动使用 toJSON()/fromJSON() 进行序列化。
 * 也支持通过 registerType() 注册自定义序列化器（用于 Operation/Diff 等特殊类型）。
 */
export default class Serializer {
    private static instance: Serializer
    private typeRegistry: Map<string, TypeRegistry> = new Map()
    private circularRefs: Map<any, string> = new Map()
    private refCounter: number = 0
    private defaultOptions: SerializerOptions = {
        includeFunctions: false,
        includePrivate: false,
        handleCircularRefs: true,
        maxDepth: 29,
    }

    private constructor() {
        this.registerDefaultTypes()
    }

    /**
     * 获取单例实例
     */
    public static getInstance(): Serializer {
        if (!Serializer.instance) {
            Serializer.instance = new Serializer()
        }
        return Serializer.instance
    }

    // ========== 类型注册 ==========

    /**
     * 注册实现了 ISerializable 的类（自动使用 toJSON/fromJSON）
     */
    private registerSerializable(
        typeName: string,
        ctor: SerializableStatic
    ): void {
        this.typeRegistry.set(typeName, {
            type: typeName,
            constructor: ctor,
            serializer: (obj: ISerializable) => obj.toJSON(),
            deserializer: (data: any) => ctor.fromJSON(data),
        })
    }

    /**
     * 注册自定义序列化器（用于没有实现 ISerializable 的类或需要特殊处理的类型）
     */
    public registerType(
        typeName: string,
        constructor: new (...args: any[]) => any,
        handlers?: {
            serialize?: (obj: any) => any
            deserialize?: (data: any) => any
        }
    ): void {
        this.typeRegistry.set(typeName, {
            type: typeName,
            constructor,
            serializer: handlers?.serialize,
            deserializer: handlers?.deserialize,
        })
    }

    /**
     * 注册所有默认类型。
     * 实现了 ISerializable 的类用 registerSerializable 一行注册；
     * 需要特殊处理的类型用 registerType + 自定义 handlers。
     */
    private registerDefaultTypes(): void {
        // ===== ISerializable 类型 =====
        // key 使用各类的 type 枚举值，与实例上的 type 属性一一对应

        // 数学
        this.registerSerializable(MATHTYPE.MATRIX4, Matrix4)
        this.registerSerializable(MATHTYPE.POINT3, Point3 as any)
        this.registerSerializable(MATHTYPE.VECTOR3, Vector3 as any)
        this.registerSerializable(MATHTYPE.BOUNDS, Bounds as any)
        // 样式
        this.registerSerializable(STYLETYPE.COLOR, Color as any)
        this.registerSerializable(STYLETYPE.GRADIENT, Gradient as any)
        this.registerSerializable(STYLETYPE.IMAGE_PATTERN, ImagePattern as any)
        this.registerSerializable(STYLETYPE.VIDEO_PATTERN, VideoPattern as any)
        this.registerSerializable(STYLETYPE.FILL_STYLE, FillStyle as any)
        this.registerSerializable(STYLETYPE.STROKE_STYLE, StrokeStyle as any)
        this.registerSerializable(STYLETYPE.SHADOW_STYLE, ShadowStyle as any)
        this.registerSerializable(STYLETYPE.STYLE, Style as any)
        // 图形
        this.registerSerializable(GRAPHTYPE.LINE, Line as any)
        this.registerSerializable(GRAPHTYPE.ARC, Arc as any)
        this.registerSerializable(GRAPHTYPE.CIRCLE, Circle as any)
        this.registerSerializable(GRAPHTYPE.QUADRATIC_BEZIER, QuadraticBezier as any)
        this.registerSerializable(GRAPHTYPE.CUBIC_BEZIER, CubicBezier as any)
        this.registerSerializable(GRAPHTYPE.COMBINED_GRAPH, CombinedGraph as any)
        this.registerSerializable(GRAPHTYPE.POLYGON, Polygon as any)
        this.registerSerializable(GRAPHTYPE.TRIANGLE, Triangle as any)
        this.registerSerializable(GRAPHTYPE.RECTANGLE, Rectangle as any)
        this.registerSerializable(GRAPHTYPE.REGULAR_POLYGON, RegularPolygon as any)
        this.registerSerializable(GRAPHTYPE.IMAGE, ImageElement as any)
        this.registerSerializable(GRAPHTYPE.VIDEO, VideoElement as any)
        this.registerSerializable(GRAPHTYPE.TEXTFIELDS, TextFields as any)
        this.registerSerializable(GRAPHTYPE.TEXTPARAGRAPH, TextParagraph as any)
        this.registerSerializable(
            GRAPHTYPE.PRINTABLE_TEXTELEMENT,
            PrintableTextElement as any
        )
        this.registerSerializable(
            GRAPHTYPE.NONPRINTABLE_TEXTELEMENT,
            NonPrintableTextElement as any
        )
        this.registerSerializable(GRAPHTYPE.DENSETRAJECTORY, DenseTrajectory as any)
        // 容器
        this.registerSerializable(VIEWTYPE.COMBINEDVIEW, CombinedView as any)
        this.registerSerializable(VIEWTYPE.GRAPHVIEW, GraphView as any)
        this.registerSerializable(VIEWTYPE.TEXTVIEW, TextView as any)
        this.registerSerializable(VIEWTYPE.IMAGEVIEW, ImageView as any)
        this.registerSerializable(VIEWTYPE.VIDEOVIEW, VideoView as any)
        // 场景
        this.registerSerializable(SCENETYPE.SCENE, Scene as any)
        // 相机
        this.registerSerializable(SCENETYPE.ORTHOGRAPHIC_CAMERA, OrthographicCamera as any)
        this.registerSerializable(SCENETYPE.PERSPECTIVE_CAMERA, PerspectiveCamera as any)

    }

    // ========== 核心序列化/反序列化 ==========

    /**
     * 序列化对象为JSON字符串
     */
    public serialize(
        obj: any,
        options: Partial<SerializerOptions> = {}
    ): string {
        const opts = { ...this.defaultOptions, ...options }
        this.circularRefs.clear()
        this.refCounter = 0

        const serializedData: SerializedData = {
            type: this.getObjectType(obj),
            version: '1.0.0',
            data: this.serializeValue(obj, opts, 0),
            metadata: {
                timestamp: Date.now(),
                source: 'BanvasGL Serializer',
            },
        }

        return JSON.stringify(serializedData, null, 2)
    }

    /**
     * 反序列化JSON字符串为对象
     */
    public deserialize<T = any>(
        json: string,
        options: Partial<SerializerOptions> = {}
    ): T {
        const opts = { ...this.defaultOptions, ...options }
        const serializedData: SerializedData = JSON.parse(json)

        if (!serializedData.type || !serializedData.data) {
            throw new Error('Invalid serialized data format')
        }

        return this.deserializeValue(serializedData.data, opts) as T
    }

    /**
     * 序列化值（递归核心）
     */
    private serializeValue(
        value: any,
        options: SerializerOptions,
        depth: number
    ): any {
        if (depth > options.maxDepth!) {
            return '[Max Depth Reached]'
        }

        if (value === null || value === undefined) {
            return value
        }

        // 处理循环引用
        if (
            options.handleCircularRefs &&
            typeof value === 'object' &&
            this.circularRefs.has(value)
        ) {
            return { $ref: this.circularRefs.get(value) }
        }

        // 基本类型
        if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        ) {
            return value
        }

        // 数组
        if (Array.isArray(value)) {
            if (options.handleCircularRefs) {
                this.circularRefs.set(value, `ref_${++this.refCounter}`)
            }
            return value.map((item) =>
                this.serializeValue(item, options, depth + 1)
            )
        }

        // Date
        if (value instanceof Date) {
            return { $type: 'Date', $value: value.toISOString() }
        }

        // 函数 — 默认跳过
        if (typeof value === 'function') {
            return undefined
        }

        // 已注册的类型（优先使用注册的 serializer）
        const typeName = this.getObjectType(value)
        const typeInfo = this.typeRegistry.get(typeName)
        if (typeInfo && typeInfo.serializer) {
            if (options.handleCircularRefs) {
                this.circularRefs.set(value, `ref_${++this.refCounter}`)
            }
            return {
                $type: typeName,
                $value: typeInfo.serializer(value),
            }
        }

        // 实现了 ISerializable 但未注册的对象（兜底）
        if (typeof value === 'object' && typeof value.toJSON === 'function') {
            if (options.handleCircularRefs) {
                this.circularRefs.set(value, `ref_${++this.refCounter}`)
            }
            return {
                $type: typeName,
                $value: value.toJSON(),
            }
        }

        // 普通对象 — 浅遍历 entries
        if (typeof value === 'object') {
            if (options.handleCircularRefs) {
                this.circularRefs.set(value, `ref_${++this.refCounter}`)
            }

            const result: any = {}
            for (const [key, val] of Object.entries(value)) {
                if (!options.includePrivate && key.startsWith('_')) {
                    continue
                }
                const serializedVal = this.serializeValue(
                    val,
                    options,
                    depth + 1
                )
                if (serializedVal !== undefined) {
                    result[key] = serializedVal
                }
            }
            return result
        }

        return value
    }

    /**
     * 反序列化值（递归核心）
     */
    private deserializeValue(value: any, options: SerializerOptions): any {
        if (value === null || value === undefined) {
            return value
        }

        // 循环引用占位
        if (value.$ref) {
            return value
        }

        // $type/$value 包装
        if (value.$type) {
            if (value.$type === 'Date') {
                return new Date(value.$value)
            }

            const typeInfo = this.typeRegistry.get(value.$type)
            if (typeInfo && typeInfo.deserializer) {
                return typeInfo.deserializer(value.$value)
            }
            // 未注册的 $type 原样返回 $value
            return value.$value
        }

        // 数组
        if (Array.isArray(value)) {
            return value.map((item) => this.deserializeValue(item, options))
        }

        // 对象 — 递归属性
        if (typeof value === 'object') {
            const result: any = {}
            for (const [key, val] of Object.entries(value)) {
                result[key] = this.deserializeValue(val, options)
            }
            return result
        }

        return value
    }

    /**
     * 获取对象类型名
     * 优先使用对象的 type 枚举属性（稳定标识），回退到 constructor.name
     */
    private getObjectType(obj: any): string {
        if (obj === null || obj === undefined) return 'null'
        if (typeof obj.type === 'string' && obj.type) return obj.type
        if (obj.constructor && obj.constructor.name) return obj.constructor.name
        return typeof obj
    }

}
