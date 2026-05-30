import Scene from '@/engine/Scene'
import App from '@/engine/App'
import { version as BANVASGL_VERSION } from '@/version.js'
import { migrationRegistry } from '@/engine/migrations/index.js'
import Matrix4 from '@/foundation/math/Matrix4'
import { Point3, Vector3 } from '@/foundation/math'
import Style from '@/foundation/style/Style'

// 样式子类型
import Color from '@/foundation/style/Color'
import FillStyle from '@/foundation/style/FillStyle'
import StrokeStyle from '@/foundation/style/StrokeStyle'
import ShadowStyle from '@/foundation/style/ShadowStyle'
import { LinearGradient, RadialGradient, ConicGradient } from '@/foundation/style/gradient/index'
import ImagePattern from '@/foundation/style/Image'
import VideoPattern from '@/foundation/style/Video'
import Bounds from '@/graph/base/Bounds'

// 图形类型
import CombinedGraph from '@/graph/combined/CombinedGraph'
import Line from '@/graph/analytic/Line'
import Circle from '@/graph/analytic/Circle'
import Arc from '@/graph/analytic/Arc'
import QuadraticBezier from '@/graph/analytic/QuadraticBezier'
import CubicBezier from '@/graph/analytic/CubicBezier'
import Polygon from '@/graph/combined/Polygon/Polygon'
import Triangle from '@/graph/combined/Polygon/Triangle'
import Rectangle from '@/graph/combined/Polygon/Rectangle'
import RegularPolygon from '@/graph/combined/Polygon/RegularPolygon'
import RoundedRect from '@/graph/combined/RoundedRect'

// Media / Text 图形类型
import ImageElement from '@/graph/media/ImageElement'
import VideoElement from '@/graph/media/VideoElement'
import TextFields from '@/graph/text/TextFields'
import TextParagraph from '@/graph/text/TextParagraph'
import {
    PrintableTextElement,
    NonPrintableTextElement,
} from '@/graph/text/TextElement'
import DenseTrajectory from '@/graph/trajectory/DenseTrajectory'

// 容器类型
import CombinedView from '@/view/CombinedViews'
import GraphView from '@/view/GraphViews'
import TextView from '@/view/TextView'
import ImageView from '@/view/MediaViews/ImageView'
import VideoView from '@/view/MediaViews/VideoView'

// 流程图视图类型
import { NodeView, EdgeView, PortView } from '@/view/FlowViews/index.js'

// 相机类型
import BaseCamera from '@/engine/camera/BaseCamera'
import OrthographicCamera from '@/engine/camera/OrthographicCamera'
import PerspectiveCamera from '@/engine/camera/PerspectiveCamera'

// ISerializable
import type { ISerializable, ISerializableClass } from '@/types'
import { AppType, MathType, StyleType, GraphType, ViewType, SceneType, CameraType } from '@/foundation/constants'

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
        ctor: ISerializableClass
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
        this.registerSerializable(MathType.MATRIX4, Matrix4)
        this.registerSerializable(MathType.POINT3, Point3 as any)
        this.registerSerializable(MathType.VECTOR3, Vector3 as any)
        this.registerSerializable(MathType.BOUNDS, Bounds as any)
        // 样式
        this.registerSerializable(StyleType.COLOR, Color as any)
        this.registerSerializable(StyleType.LINEAR_GRADIENT, LinearGradient as any)
        this.registerSerializable(StyleType.RADIAL_GRADIENT, RadialGradient as any)
        this.registerSerializable(StyleType.CONIC_GRADIENT, ConicGradient as any)
        this.registerSerializable(StyleType.IMAGE_PATTERN, ImagePattern as any)
        this.registerSerializable(StyleType.VIDEO_PATTERN, VideoPattern as any)
        this.registerSerializable(StyleType.FILL_STYLE, FillStyle as any)
        this.registerSerializable(StyleType.STROKE_STYLE, StrokeStyle as any)
        this.registerSerializable(StyleType.SHADOW_STYLE, ShadowStyle as any)
        this.registerSerializable(StyleType.STYLE, Style as any)
        // 图形
        this.registerSerializable(GraphType.LINE, Line as any)
        this.registerSerializable(GraphType.ARC, Arc as any)
        this.registerSerializable(GraphType.CIRCLE, Circle as any)
        this.registerSerializable(GraphType.QUADRATIC_BEZIER, QuadraticBezier as any)
        this.registerSerializable(GraphType.CUBIC_BEZIER, CubicBezier as any)
        this.registerSerializable(GraphType.COMBINED_GRAPH, CombinedGraph as any)
        this.registerSerializable(GraphType.POLYGON, Polygon as any)
        this.registerSerializable(GraphType.TRIANGLE, Triangle as any)
        this.registerSerializable(GraphType.RECTANGLE, Rectangle as any)
        this.registerSerializable(GraphType.REGULAR_POLYGON, RegularPolygon as any)
        this.registerSerializable(GraphType.ROUNDED_RECT, RoundedRect as any)
        this.registerSerializable(GraphType.IMAGE, ImageElement as any)
        this.registerSerializable(GraphType.VIDEO, VideoElement as any)
        this.registerSerializable(GraphType.TEXTFIELDS, TextFields as any)
        this.registerSerializable(GraphType.TEXTPARAGRAPH, TextParagraph as any)
        this.registerSerializable(
            GraphType.PRINTABLE_TEXTELEMENT,
            PrintableTextElement as any
        )
        this.registerSerializable(
            GraphType.NONPRINTABLE_TEXTELEMENT,
            NonPrintableTextElement as any
        )
        this.registerSerializable(GraphType.DENSETRAJECTORY, DenseTrajectory as any)
        // 容器
        this.registerSerializable(ViewType.COMBINEDVIEW, CombinedView as any)
        this.registerSerializable(ViewType.GRAPHVIEW, GraphView as any)
        this.registerSerializable(ViewType.TEXTVIEW, TextView as any)
        this.registerSerializable(ViewType.IMAGEVIEW, ImageView as any)
        this.registerSerializable(ViewType.VIDEOVIEW, VideoView as any)
        // 流程图视图
        this.registerSerializable(ViewType.NODEVIEW, NodeView as any)
        this.registerSerializable(ViewType.EDGEVIEW, EdgeView as any)
        this.registerSerializable(ViewType.PORTVIEW, PortView as any)
        // 应用
        this.registerType(AppType.APP, App, {
            serialize: (app: App) => app.toJSON(),
            deserialize: (data: any) => App.fromJSON(data),
        })
        // 场景
        this.registerSerializable(SceneType.SCENE, Scene as any)
        // 相机
        this.registerSerializable(CameraType.BASE, BaseCamera as any)
        this.registerSerializable(CameraType.ORTHOGRAPHIC, OrthographicCamera as any)
        this.registerSerializable(CameraType.PERSPECTIVE, PerspectiveCamera as any)

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
            version: BANVASGL_VERSION,
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
     *
     * 调用链：JSON.parse → MigrationRegistry.migrate → deserializeValue
     */
    public deserialize<T = any>(
        json: string,
        options: Partial<SerializerOptions> = {}
    ): T {
        const opts = { ...this.defaultOptions, ...options }
        let serializedData: SerializedData = JSON.parse(json)

        if (!serializedData.type || !serializedData.data) {
            throw new Error('Invalid serialized data format')
        }

        // 数据格式迁移：将旧版本数据升级到当前引擎版本
        serializedData = migrationRegistry.migrate(serializedData)

        return this.deserializeValue(serializedData.data, opts) as T
    }

    /**
     * 从纯数据对象恢复实例（公共方法）
     *
     * 支持 { $type, $value } 包装格式和普通值。
     * 用于操作栈的 applyDiff 等场景，无需经过 JSON.stringify/parse。
     *
     * @param data - 纯数据对象（可能是旧版本格式）
     * @param fromVersion - 可选，数据的来源版本号。若提供且低于当前版本，
     *                      会将 data 包装为 SerializedData 经过迁移管线处理。
     */
    public revive<T = any>(data: any, fromVersion?: string): T {
        let resolvedData = data

        // 如果指定了来源版本且需要迁移，包装为 SerializedData 走迁移管线
        if (fromVersion) {
            const wrapped: SerializedData = {
                type: data?.$type ?? 'unknown',
                version: fromVersion,
                data,
            }
            const migrated = migrationRegistry.migrate(wrapped)
            resolvedData = migrated.data
        }

        return this.deserializeValue(resolvedData, this.defaultOptions) as T
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
                // 先递归反序列化 $value 内部的嵌套结构，再交给 fromJSON
                const resolvedValue = this.deserializeValue(value.$value, options)
                return typeInfo.deserializer(resolvedValue)
            }
            // 未注册的 $type 原样返回 $value
            return this.deserializeValue(value.$value, options)
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
