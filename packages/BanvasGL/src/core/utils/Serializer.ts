import { VIEWTYPE, GRAPHTYPE } from '../../constants'
import View, { ViewOptions } from '../views/View'
import Scene from '../scene/Scene'
import Matrix4 from '../math/Matrix4'
import { Point3, Vector3 } from '../math'
import Style from '../style/Style'
import { Graph } from '../graph'
import { Operation,Diff } from '../scene/utils/OperationStack'

// 导入可实例化图形类型
import CombinedGraph from '../graph/combined/CombinedGraph'
import ComplexGraph from '../graph/combined/ComplexGraph/ComplexGraph'
import Line from '../graph/analytic/Line'
import Circle from '../graph/analytic/Circle'
import Arc from '../graph/analytic/Arc'
import QuadraticBezier from '../graph/analytic/QuadraticBezier'
import CubicBezier from '../graph/analytic/CubicBezier'

// 导入可实例化容器类型
import CombinedView from '../views/CombinedView'
import GraphView from '../views/GraphView'
import TextView from '../views/TextView'
import ImageView from '../views/ImageView'
import VideoView from '../views/VideoView'

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
 * 支持View、Scene、Matrix4、Style、Graph等核心对象的序列化和反序列化
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
    maxDepth: 29
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

  /**
   * 注册默认类型
   */
  private registerDefaultTypes(): void {

    // 注册Scene类型
    this.registerType('Scene', Scene, {
      serialize: (scene: Scene) => this.serializeScene(scene),
      deserialize: (data: any) => this.deserializeScene(data)
    })

    // 注册Matrix4类型
    this.registerType('Matrix4', Matrix4, {
      serialize: (matrix: Matrix4) => this.serializeMatrix4(matrix),
      deserialize: (data: any) => this.deserializeMatrix4(data)
    })

    // 注册Point3类型
    this.registerType('Point3', Point3, {
      serialize: (point: Point3) => this.serializePoint3(point),
      deserialize: (data: any) => this.deserializePoint3(data)
    })

    // 注册Vector3类型
    this.registerType('Vector3', Vector3, {
      serialize: (vector: Vector3) => this.serializeVector3(vector),
      deserialize: (data: any) => this.deserializeVector3(data)
    })

    // 注册Style类型
    this.registerType('Style', Style, {
      serialize: (style: Style) => this.serializeStyle(style),
      deserialize: (data: any) => this.deserializeStyle(data)
    })


    // 注册Operation类型
    this.registerType('Operation', Operation, {
      serialize: (operation: Operation) => this.serializeOperation(operation),
      deserialize: (data: any) => this.deserializeOperation(data)
    })

    this.registerType("Diff",Diff,{
      serialize:(diffs:Diff[])=> this.serializeDiffs(diffs),
      deserialize:(data:any)=>this.deserializeDiffs(data)
    })

    // 注册可实例化图形类型
    this.registerType('CombinedGraph', CombinedGraph, {
      serialize: (graph: CombinedGraph) => this.serializeCombinedGraph(graph),
      deserialize: (data: any) => this.deserializeCombinedGraph(data)
    })

    this.registerType('ComplexGraph', ComplexGraph, {
      serialize: (graph: ComplexGraph) => this.serializeComplexGraph(graph),
      deserialize: (data: any) => this.deserializeComplexGraph(data)
    })

    this.registerType('Line', Line, {
      serialize: (line: Line) => this.serializeLine(line),
      deserialize: (data: any) => this.deserializeLine(data)
    })

    this.registerType('Circle', Circle, {
      serialize: (circle: Circle) => this.serializeCircle(circle),
      deserialize: (data: any) => this.deserializeCircle(data)
    })

    this.registerType('Arc', Arc, {
      serialize: (arc: Arc) => this.serializeArc(arc),
      deserialize: (data: any) => this.deserializeArc(data)
    })


    this.registerType('QuadraticBezier', QuadraticBezier, {
      serialize: (bezier: QuadraticBezier) => this.serializeQuadraticBezier(bezier),
      deserialize: (data: any) => this.deserializeQuadraticBezier(data)
    })

    this.registerType('CubicBezier', CubicBezier, {
      serialize: (bezier: CubicBezier) => this.serializeCubicBezier(bezier),
      deserialize: (data: any) => this.deserializeCubicBezier(data)
    })

    // 注册可实例化容器类型
    this.registerType('CombinedView', CombinedView, {
      serialize: (view: CombinedView) => this.serializeCombinedView(view),
      deserialize: (data: any) => this.deserializeCombinedView(data)
    })

    this.registerType('GraphView', GraphView, {
      serialize: (view: GraphView) => this.serializeGraphView(view),
      deserialize: (data: any) => this.deserializeGraphView(data)
    })

    this.registerType('TextView', TextView, {
      serialize: (view: TextView) => this.serializeTextView(view),
      deserialize: (data: any) => this.deserializeTextView(data)
    })

    this.registerType('ImageView', ImageView, {
      serialize: (view: ImageView) => this.serializeImageView(view),
      deserialize: (data: any) => this.deserializeImageView(data)
    })

    this.registerType('VideoView', VideoView, {
      serialize: (view: VideoView) => this.serializeVideoView(view),
      deserialize: (data: any) => this.deserializeVideoView(data)
    })
  }

  /**
   * 注册类型
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
      deserializer: handlers?.deserialize
    })
  }

  /**
   * 序列化对象为JSON
   */
  public serialize(obj: any, options: Partial<SerializerOptions> = {}): string {
    const opts = { ...this.defaultOptions, ...options }
    this.circularRefs.clear()
    this.refCounter = 0

    const serializedData: SerializedData = {
      type: this.getObjectType(obj),
      version: '1.0.0',
      data: this.serializeValue(obj, opts, 0),
      metadata: {
        timestamp: Date.now(),
        source: 'BanvasGL Serializer'
      }
    }

    return JSON.stringify(serializedData, null, 2)
  }

  /**
   * 反序列化JSON为对象
   */
  public deserialize<T = any>(json: string, options: Partial<SerializerOptions> = {}): T {
    const opts = { ...this.defaultOptions, ...options }
    const serializedData: SerializedData = JSON.parse(json)

    if (!serializedData.type || !serializedData.data) {
      throw new Error('Invalid serialized data format')
    }

    return this.deserializeValue(serializedData.data, opts) as T
  }

  /**
   * 序列化值
   */
  private serializeValue(value: any, options: SerializerOptions, depth: number): any {
    if (depth > options.maxDepth!) {
      return '[Max Depth Reached]'
    }

    if (value === null || value === undefined) {
      return value
    }

    // 处理循环引用
    if (options.handleCircularRefs && this.circularRefs.has(value)) {
      return { $ref: this.circularRefs.get(value) }
    }

    // 处理基本类型
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value
    }

    // 处理数组
    if (Array.isArray(value)) {
      if (options.handleCircularRefs) {
        this.circularRefs.set(value, `ref_${++this.refCounter}`)
      }
      return value.map(item => this.serializeValue(item, options, depth + 1))
    }

    // 处理Date对象
    if (value instanceof Date) {
      return { $type: 'Date', $value: value.toISOString() }
    }

    // 处理函数
    if (typeof value === 'function') {
      if (options.includeFunctions) {
        return { $type: 'Function', $value: value.toString() }
      }
      return undefined
    }

    // 处理注册的类型
    const typeName = this.getObjectType(value)
    const typeInfo = this.typeRegistry.get(typeName)
    if (typeInfo && typeInfo.serializer) {
      if (options.handleCircularRefs) {
        this.circularRefs.set(value, `ref_${++this.refCounter}`)
      }
      return {
        $type: typeName,
        $value: typeInfo.serializer(value)
      }
    }

    // 处理普通对象
    if (typeof value === 'object') {
      if (options.handleCircularRefs) {
        this.circularRefs.set(value, `ref_${++this.refCounter}`)
      }

      const result: any = {}
      for (const [key, val] of Object.entries(value)) {
        // 跳过私有属性
        if (!options.includePrivate && key.startsWith('_')) {
          continue
        }

        const serializedVal = this.serializeValue(val, options, depth + 1)
        if (serializedVal !== undefined) {
          result[key] = serializedVal
        }
      }
      return result
    }

    return value
  }

  /**
   * 反序列化值
   */
  private deserializeValue(value: any, options: SerializerOptions): any {
    if (value === null || value === undefined) {
      return value
    }

    // 处理引用
    if (value.$ref) {
      // 这里需要更复杂的引用解析逻辑
      return value
    }

    // 处理特殊类型
    if (value.$type) {
      switch (value.$type) {
        case 'Date':
          return new Date(value.$value)
        case 'Function':
          if (options.includeFunctions) {
            return new Function('return ' + value.$value)()
          }
          return undefined
        default:
          // 处理注册的类型
          const typeInfo = this.typeRegistry.get(value.$type)
          if (typeInfo && typeInfo.deserializer) {
            return typeInfo.deserializer(value.$value)
          }
          break
      }
    }

    // 处理数组
    if (Array.isArray(value)) {
      return value.map(item => this.deserializeValue(item, options))
    }

    // 处理对象
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
   * 获取对象类型
   */
  private getObjectType(obj: any): string {
    if (obj === null || obj === undefined) {
      return 'null'
    }

    if (obj.constructor && obj.constructor.name) {
      return obj.constructor.name
    }

    return typeof obj
  }

  // ========== 具体类型的序列化方法 ==========

  /**
   * 序列化View对象
   */
  private serializeView(view: View): any {
    switch(view.type){
      case VIEWTYPE.VIEW :{
        break
      }
      default:{
        throw new Error("unknown view type")
      }
    }
  }

  /**
   * 反序列化View对象
   */
  private deserializeView(data: any): any {
    switch(data.$type){
      case VIEWTYPE.VIEW :{
        break
      }
      default:{
        throw new Error("unknown view type")
      }
    }
  }

  /**
   * 序列化Scene对象
   */
  private serializeScene(scene: Scene): any {
    const result: any = {
      id: scene.id,
      children: scene.children.map(child => this.serializeView(child)),
      data: this.serializeValue(scene.data, this.defaultOptions, 0),
      camera: this.serializeValue(scene.camera, this.defaultOptions, 0)
    }

    // 序列化生命周期回调函数
    const lifecycleCallbacks: any = {}
    if ((scene as any)._onLoad) {
      lifecycleCallbacks.onLoad = (scene as any)._onLoad.toString()
    }
    if ((scene as any)._onUnload) {
      lifecycleCallbacks.onUnload = (scene as any)._onUnload.toString()
    }
    if ((scene as any)._onShow) {
      lifecycleCallbacks.onShow = (scene as any)._onShow.toString()
    }
    if ((scene as any)._onHide) {
      lifecycleCallbacks.onHide = (scene as any)._onHide.toString()
    }

    if (Object.keys(lifecycleCallbacks).length > 0) {
      result.lifecycleCallbacks = lifecycleCallbacks
    }

    return result
  }

  /**
   * 反序列化Scene对象
   */
  private deserializeScene(data: any): Scene {
    const scene = new Scene(this.deserializeValue(data.camera, this.defaultOptions))
    scene.id = data.id
    scene.data = this.deserializeValue(data.data, this.defaultOptions)
    scene.children = data.children.map((childData: any) => 
      this.deserializeValue(childData, this.defaultOptions)
    )

    // 反序列化生命周期回调函数
    if (data.lifecycleCallbacks) {
      Object.keys(data.lifecycleCallbacks).forEach(callbackName => {
        try {
          const callbackString = data.lifecycleCallbacks[callbackName]
          if (typeof callbackString === 'string') {
            const callback = new Function('return ' + callbackString)()
            switch (callbackName) {
              case 'onLoad':
                scene.onLoad = callback
                break
              case 'onUnload':
                scene.onUnload = callback
                break
              case 'onShow':
                scene.onShow = callback
                break
              case 'onHide':
                scene.onHide = callback
                break
            }
          }
        } catch (error) {
          console.warn(`Failed to deserialize lifecycle callback ${callbackName}:`, error)
        }
      })
    }

    return scene
  }

  /**
   * 序列化Matrix4对象
   */
  private serializeMatrix4(matrix: Matrix4): any {
    return {
      transform: matrix.transform
    }
  }

  /**
   * 反序列化Matrix4对象
   */
  private deserializeMatrix4(data: any): Matrix4 {
    return new Matrix4(data.transform)
  }

  /**
   * 序列化Point3对象
   */
  private serializePoint3(point: Point3): any {
    return {
      x: point.x,
      y: point.y,
      z: point.z
    }
  }

  /**
   * 反序列化Point3对象
   */
  private deserializePoint3(data: any): Point3 {
    return new Point3(data.x, data.y, data.z)
  }

  /**
   * 序列化Vector3对象
   */
  private serializeVector3(vector: Vector3): any {
    return {
      x: vector.x,
      y: vector.y,
      z: vector.z
    }
  }

  /**
   * 反序列化Vector3对象
   */
  private deserializeVector3(data: any): Vector3 {
    return new Vector3(data.x, data.y, data.z)
  }

  /**
   * 序列化Style对象
   */
  private serializeStyle(style: Style): any {
    return {
      fillStyle: this.serializeValue(style.fillStyle, this.defaultOptions, 0),
      strokeStyle: this.serializeValue(style.strokeStyle, this.defaultOptions, 0),
      shadowStyle: this.serializeValue(style.shadowStyle, this.defaultOptions, 0)
    }
  }

  /**
   * 反序列化Style对象
   */
  private deserializeStyle(data: any): Style {
    const style = new Style()
    style.fillStyle = this.deserializeValue(data.fillStyle, this.defaultOptions)
    style.strokeStyle = this.deserializeValue(data.strokeStyle, this.defaultOptions)
    style.shadowStyle = this.deserializeValue(data.shadowStyle, this.defaultOptions)
    return style
  }

  /**
   * 序列化Graph对象
   */
  private serializeGraph(graph: Graph): any {
    return {
      id: graph.id,
      type: graph.type,
      controlPoints: this.serializeValue(graph.controlPoints, this.defaultOptions, 0),
      style: this.serializeValue(graph.style, this.defaultOptions, 0),
      bounds: graph.getBounds() ? this.serializeValue(graph.getBounds(), this.defaultOptions, 0) : null
    }
  }

  /**
   * 反序列化Graph对象
   */
  private deserializeGraph(data: any): any {
    // 根据类型创建对应的图形对象
    switch (data.type) {
      case GRAPHTYPE.LINE:
        return this.deserializeLine(data)
      case GRAPHTYPE.CIRCLE:
        return this.deserializeCircle(data)
      case GRAPHTYPE.ARC:
        return this.deserializeArc(data)
      case GRAPHTYPE.BEZIER:
        // Bezier是抽象类，根据具体类型处理
        console.warn('Bezier is abstract class, use specific subclasses instead')
        return null
      case GRAPHTYPE.QUADRATIC_BEZIER:
        return this.deserializeQuadraticBezier(data)
      case GRAPHTYPE.CUBIC_BEZIER:
        return this.deserializeCubicBezier(data)
      case GRAPHTYPE.COMBINED_GRAPH:
        return this.deserializeCombinedGraph(data)
      case GRAPHTYPE.COMPLEX_GRAPH:
        return this.deserializeComplexGraph(data)
      default:
        console.warn(`Unknown graph type: ${data.type}`)
        return null
    }
  }

  /**
   * 序列化Operation对象
   */
  private serializeOperation(operation: Operation): any {
    return {
      diffs:this.serializeDiffs(operation.diffs),
      timestamp:operation.timestamp
    }
  }

  /**
   * 反序列化Operation对象
   */
  private deserializeOperation(data: any): Operation {
    return {
      diffs:this.deserializeDiffs(data.diffs),
      timestamp:data.timestamp
    }
  }

  private serializeDiffs(diffs:Diff[]):any{
    return diffs.map(diff =>({
      parentId: diff.parentId,
      id: diff.id,
      type: diff.type,
      content:this.serializeView(diff.content)
    }))
  }

  private deserializeDiffs(data:any[]):Diff[]{
    return data.map(diffJson=>({
      parentId:diffJson.parentId,
      id:diffJson.id,
      type:diffJson.type,
      content:this.deserializeView(diffJson.content)
    }))
  }

  // ========== 便捷方法 ==========

  /**
   * 序列化View为JSON字符串
   */
  public static serializeView(view: View, options?: Partial<SerializerOptions>): string {
    return Serializer.getInstance().serialize(view, options)
  }

  /**
   * 反序列化JSON字符串为View
   */
  public static deserializeView(json: string, options?: Partial<SerializerOptions>): View {
    return Serializer.getInstance().deserialize<View>(json, options)
  }

  /**
   * 序列化Scene为JSON字符串
   */
  public static serializeScene(scene: Scene, options?: Partial<SerializerOptions>): string {
    return Serializer.getInstance().serialize(scene, options)
  }

  /**
   * 反序列化JSON字符串为Scene
   */
  public static deserializeScene(json: string, options?: Partial<SerializerOptions>): Scene {
    return Serializer.getInstance().deserialize<Scene>(json, options)
  }

  /**
   * 序列化任意对象为JSON字符串
   */
  public static serialize(obj: any, options?: Partial<SerializerOptions>): string {
    return Serializer.getInstance().serialize(obj, options)
  }

  /**
   * 反序列化JSON字符串为任意对象
   */
  public static deserialize<T = any>(json: string, options?: Partial<SerializerOptions>): T {
    return Serializer.getInstance().deserialize<T>(json, options)
  }

  /**
   * 序列化CombinedGraph为JSON字符串
   */
  public static serializeCombinedGraph(graph: CombinedGraph, options?: Partial<SerializerOptions>): string {
    return Serializer.getInstance().serialize(graph, options)
  }

  /**
   * 反序列化JSON字符串为CombinedGraph
   */
  public static deserializeCombinedGraph(json: string, options?: Partial<SerializerOptions>): CombinedGraph {
    return Serializer.getInstance().deserialize<CombinedGraph>(json, options)
  }

  /**
   * 序列化ComplexGraph为JSON字符串
   */
  public static serializeComplexGraph(graph: ComplexGraph, options?: Partial<SerializerOptions>): string {
    return Serializer.getInstance().serialize(graph, options)
  }

  /**
   * 反序列化JSON字符串为ComplexGraph
   */
  public static deserializeComplexGraph(json: string, options?: Partial<SerializerOptions>): ComplexGraph {
    return Serializer.getInstance().deserialize<ComplexGraph>(json, options)
  }

  /**
   * 序列化Line为JSON字符串
   */
  public static serializeLine(line: Line, options?: Partial<SerializerOptions>): string {
    return Serializer.getInstance().serialize(line, options)
  }

  /**
   * 反序列化JSON字符串为Line
   */
  public static deserializeLine(json: string, options?: Partial<SerializerOptions>): Line {
    return Serializer.getInstance().deserialize<Line>(json, options)
  }

  /**
   * 序列化Circle为JSON字符串
   */
  public static serializeCircle(circle: Circle, options?: Partial<SerializerOptions>): string {
    return Serializer.getInstance().serialize(circle, options)
  }

  /**
   * 反序列化JSON字符串为Circle
   */
  public static deserializeCircle(json: string, options?: Partial<SerializerOptions>): Circle {
    return Serializer.getInstance().deserialize<Circle>(json, options)
  }

  /**
   * 序列化CombinedView为JSON字符串
   */
  public static serializeCombinedView(view: CombinedView, options?: Partial<SerializerOptions>): string {
    return Serializer.getInstance().serialize(view, options)
  }

  /**
   * 反序列化JSON字符串为CombinedView
   */
  public static deserializeCombinedView(json: string, options?: Partial<SerializerOptions>): CombinedView {
    return Serializer.getInstance().deserialize<CombinedView>(json, options)
  }

  /**
   * 序列化GraphView为JSON字符串
   */
  public static serializeGraphView(view: GraphView, options?: Partial<SerializerOptions>): string {
    return Serializer.getInstance().serialize(view, options)
  }

  /**
   * 反序列化JSON字符串为GraphView
   */
  public static deserializeGraphView(json: string, options?: Partial<SerializerOptions>): GraphView {
    return Serializer.getInstance().deserialize<GraphView>(json, options)
  }


  // ========== 可实例化图形的序列化方法 =========
  /**
   * 序列化CombinedGraph对象
   */
  private serializeCombinedGraph(graph: CombinedGraph): any {
    return {
      id: graph.id,
      type: graph.type,
      graphs: graph.graphs.map(g => this.serializeValue(g, this.defaultOptions, 0)),
      style: this.serializeValue(graph.style, this.defaultOptions, 0),
      controlPoints: this.serializeValue(graph.controlPoints, this.defaultOptions, 0),
      bounds: graph.getBounds() ? this.serializeValue(graph.getBounds(), this.defaultOptions, 0) : null
    }
  }

  /**
   * 反序列化CombinedGraph对象
   */
  private deserializeCombinedGraph(data: any): CombinedGraph {
    const graphs = data.graphs.map((graphData: any) => 
      this.deserializeValue(graphData, this.defaultOptions)
    )
    const style = this.deserializeValue(data.style, this.defaultOptions)
    const graph = new CombinedGraph(graphs, style)
    graph.id = data.id
    return graph
  }

  /**
   * 序列化ComplexGraph对象
   */
  private serializeComplexGraph(graph: ComplexGraph): any {
    return {
      id: graph.id,
      type: graph.type,
      graphs: graph.graphs.map(g => this.serializeValue(g, this.defaultOptions, 0)),
      style: this.serializeValue(graph.style, this.defaultOptions, 0),
      controlPoints: this.serializeValue(graph.controlPoints, this.defaultOptions, 0),
      bounds: graph.getBounds() ? this.serializeValue(graph.getBounds(), this.defaultOptions, 0) : null
    }
  }

  /**
   * 反序列化ComplexGraph对象
   */
  private deserializeComplexGraph(data: any): ComplexGraph {
    const graphs = data.graphs.map((graphData: any) => 
      this.deserializeValue(graphData, this.defaultOptions)
    )
    const style = this.deserializeValue(data.style, this.defaultOptions)
    const graph = new ComplexGraph()
    graph.graphs = graphs
    graph.style = style
    graph.id = data.id
    return graph
  }

  /**
   * 序列化Line对象
   */
  private serializeLine(line: Line): any {
    return {
      id: line.id,
      type: line.type,
      controlPoints: this.serializeValue(line.controlPoints, this.defaultOptions, 0),
      style: this.serializeValue(line.style, this.defaultOptions, 0),
      bounds: line.getBounds() ? this.serializeValue(line.getBounds(), this.defaultOptions, 0) : null
    }
  }

  /**
   * 反序列化Line对象
   */
  private deserializeLine(data: any): Line {
    const controlPoints = this.deserializeValue(data.controlPoints, this.defaultOptions)
    const style = this.deserializeValue(data.style, this.defaultOptions)
    const line = new Line(controlPoints[0], controlPoints[1], style)
    line.id = data.id
    return line
  }

  /**
   * 序列化Circle对象
   */
  private serializeCircle(circle: Circle): any {
    return {
      id: circle.id,
      type: circle.type,
      center: this.serializeValue(circle.center, this.defaultOptions, 0),
      radius: circle.radius,
      style: this.serializeValue(circle.style, this.defaultOptions, 0),
      controlPoints: this.serializeValue(circle.controlPoints, this.defaultOptions, 0),
      bounds: circle.getBounds() ? this.serializeValue(circle.getBounds(), this.defaultOptions, 0) : null
    }
  }

  /**
   * 反序列化Circle对象
   */
  private deserializeCircle(data: any): Circle {
    const center = this.deserializeValue(data.center, this.defaultOptions)
    const style = this.deserializeValue(data.style, this.defaultOptions)
    const circle = new Circle(center, data.radius, style)
    circle.id = data.id
    return circle
  }

  /**
   * 序列化Arc对象
   */
  private serializeArc(arc: Arc): any {
    return {
      id: arc.id,
      type: arc.type,
      center: this.serializeValue(arc.center, this.defaultOptions, 0),
      radius: arc.radius,
      startAngle: arc.startAngle,
      endAngle: arc.endAngle,
      clockwise: arc.clockwise,
      style: this.serializeValue(arc.style, this.defaultOptions, 0),
      controlPoints: this.serializeValue(arc.controlPoints, this.defaultOptions, 0),
      bounds: arc.getBounds() ? this.serializeValue(arc.getBounds(), this.defaultOptions, 0) : null
    }
  }

  /**
   * 反序列化Arc对象
   */
  private deserializeArc(data: any): Arc {
    const center = this.deserializeValue(data.center, this.defaultOptions)
    const style = this.deserializeValue(data.style, this.defaultOptions)
    const arc = new Arc(center, data.radius, data.startAngle, data.endAngle, data.clockwise, style)
    arc.id = data.id
    return arc
  }

  // 注意：Bezier是抽象类，不能直接实例化，只处理具体子类

  /**
   * 序列化QuadraticBezier对象
   */
  private serializeQuadraticBezier(bezier: QuadraticBezier): any {
    return {
      id: bezier.id,
      type: bezier.type,
      controlPoints: this.serializeValue(bezier.controlPoints, this.defaultOptions, 0),
      style: this.serializeValue(bezier.style, this.defaultOptions, 0),
      bounds: bezier.getBounds() ? this.serializeValue(bezier.getBounds(), this.defaultOptions, 0) : null
    }
  }

  /**
   * 反序列化QuadraticBezier对象
   */
  private deserializeQuadraticBezier(data: any): QuadraticBezier {
    const controlPoints = this.deserializeValue(data.controlPoints, this.defaultOptions)
    const style = this.deserializeValue(data.style, this.defaultOptions)
    const bezier = new QuadraticBezier(controlPoints[0], controlPoints[1], controlPoints[2], style)
    bezier.id = data.id
    return bezier
  }

  /**
   * 序列化CubicBezier对象
   */
  private serializeCubicBezier(bezier: CubicBezier): any {
    return {
      id: bezier.id,
      type: bezier.type,
      controlPoints: this.serializeValue(bezier.controlPoints, this.defaultOptions, 0),
      style: this.serializeValue(bezier.style, this.defaultOptions, 0),
      bounds: bezier.getBounds() ? this.serializeValue(bezier.getBounds(), this.defaultOptions, 0) : null
    }
  }

  /**
   * 反序列化CubicBezier对象
   */
  private deserializeCubicBezier(data: any): CubicBezier {
    const controlPoints = this.deserializeValue(data.controlPoints, this.defaultOptions)
    const style = this.deserializeValue(data.style, this.defaultOptions)
    const bezier = new CubicBezier(controlPoints[0], controlPoints[1], controlPoints[2], controlPoints[3], style)
    bezier.id = data.id
    return bezier
  }

  // ========== 可实例化容器的序列化方法 ==========

  /**
   * 序列化CombinedView对象
   */
  private serializeCombinedView(view: CombinedView): any {
    const result: any = {
      id: view.id,
      type: view.type,
      layer: view.layer,
      properties: this.serializeValue(view.properties, this.defaultOptions, 0),
      data: this.serializeValue(view.data, this.defaultOptions, 0),
      style: this.serializeValue(view.style, this.defaultOptions, 0),
      selected: view.selected,
      actived: view.actived,
      freezed: view.freezed,
      visible: view.visible,
      matrix: this.serializeValue(view.matrix, this.defaultOptions, 0),
      viewport: view.viewport,
      controlPoints: view.controlPoints,
      boundingBox: view.boundingBox,
      content: view.content.map(child => this.serializeValue(child, this.defaultOptions, 0))
    }

    // 序列化生命周期回调函数
    const lifecycleCallbacks: any = {}
    if (view.onCreate) {
      lifecycleCallbacks.onCreate = view.onCreate.toString()
    }
    if (view.onAttach) {
      lifecycleCallbacks.onAttach = view.onAttach.toString()
    }
    if (view.onDestroy) {
      lifecycleCallbacks.onDestroy = view.onDestroy.toString()
    }

    if (Object.keys(lifecycleCallbacks).length > 0) {
      result.lifecycleCallbacks = lifecycleCallbacks
    }

    return result
  }

  /**
   * 反序列化CombinedView对象
   */
  private deserializeCombinedView(data: any): CombinedView {
    const content = data.content.map((childData: any) => 
      this.deserializeValue(childData, this.defaultOptions)
    )
    const view = new CombinedView(content)
    
    // 设置基本属性
    view.id = data.id
    view.layer = data.layer
    view.properties = this.deserializeValue(data.properties, this.defaultOptions)
    view.data = this.deserializeValue(data.data, this.defaultOptions)
    view.style = this.deserializeValue(data.style, this.defaultOptions)
    view.selected = data.selected
    view.actived = data.actived
    view.freezed = data.freezed
    view.visible = data.visible
    view.matrix = this.deserializeValue(data.matrix, this.defaultOptions)
    view.viewport = data.viewport
    view.controlPoints = data.controlPoints
    view.boundingBox = data.boundingBox

    // 反序列化生命周期回调函数
    if (data.lifecycleCallbacks) {
      Object.keys(data.lifecycleCallbacks).forEach(callbackName => {
        try {
          const callbackString = data.lifecycleCallbacks[callbackName]
          if (typeof callbackString === 'string') {
            const callback = new Function('return ' + callbackString)()
            switch (callbackName) {
              case 'onCreate':
                view.onCreate = callback
                break
              case 'onAttach':
                view.onAttach = callback
                break
              case 'onDestroy':
                view.onDestroy = callback
                break
            }
          }
        } catch (error) {
          console.warn(`Failed to deserialize lifecycle callback ${callbackName}:`, error)
        }
      })
    }

    return view
  }

  /**
   * 序列化GraphView对象
   */
  private serializeGraphView(view: GraphView): any {
    const result: any = {
      id: view.id,
      type: view.type,
      layer: view.layer,
      properties: this.serializeValue(view.properties, this.defaultOptions, 0),
      data: this.serializeValue(view.data, this.defaultOptions, 0),
      style: this.serializeValue(view.style, this.defaultOptions, 0),
      selected: view.selected,
      actived: view.actived,
      freezed: view.freezed,
      visible: view.visible,
      matrix: this.serializeValue(view.matrix, this.defaultOptions, 0),
      viewport: view.viewport,
      controlPoints: view.controlPoints,
      boundingBox: view.boundingBox,
      content: this.serializeValue(view.content, this.defaultOptions, 0)
    }

    // 序列化生命周期回调函数
    const lifecycleCallbacks: any = {}
    if (view.onCreate) {
      lifecycleCallbacks.onCreate = view.onCreate.toString()
    }
    if (view.onAttach) {
      lifecycleCallbacks.onAttach = view.onAttach.toString()
    }
    if (view.onDestroy) {
      lifecycleCallbacks.onDestroy = view.onDestroy.toString()
    }

    if (Object.keys(lifecycleCallbacks).length > 0) {
      result.lifecycleCallbacks = lifecycleCallbacks
    }

    return result
  }

  /**
   * 反序列化GraphView对象
   */
  private deserializeGraphView(data: any): GraphView {
    const content = this.deserializeValue(data.content, this.defaultOptions)
    const view = new GraphView(content)
    
    // 设置基本属性
    view.id = data.id
    view.layer = data.layer
    view.properties = this.deserializeValue(data.properties, this.defaultOptions)
    view.data = this.deserializeValue(data.data, this.defaultOptions)
    view.style = this.deserializeValue(data.style, this.defaultOptions)
    view.selected = data.selected
    view.actived = data.actived
    view.freezed = data.freezed
    view.visible = data.visible
    view.matrix = this.deserializeValue(data.matrix, this.defaultOptions)
    view.viewport = data.viewport
    view.controlPoints = data.controlPoints
    view.boundingBox = data.boundingBox

    // 反序列化生命周期回调函数
    if (data.lifecycleCallbacks) {
      Object.keys(data.lifecycleCallbacks).forEach(callbackName => {
        try {
          const callbackString = data.lifecycleCallbacks[callbackName]
          if (typeof callbackString === 'string') {
            const callback = new Function('return ' + callbackString)()
            switch (callbackName) {
              case 'onCreate':
                view.onCreate = callback
                break
              case 'onAttach':
                view.onAttach = callback
                break
              case 'onDestroy':
                view.onDestroy = callback
                break
            }
          }
        } catch (error) {
          console.warn(`Failed to deserialize lifecycle callback ${callbackName}:`, error)
        }
      })
    }

    return view
  }

  /**
   * 序列化TextView对象
   */
  private serializeTextView(view: TextView): any {
    const result: any = {
      id: view.id,
      type: view.type,
      layer: view.layer,
      properties: this.serializeValue(view.properties, this.defaultOptions, 0),
      data: this.serializeValue(view.data, this.defaultOptions, 0),
      style: this.serializeValue(view.style, this.defaultOptions, 0),
      selected: view.selected,
      actived: view.actived,
      freezed: view.freezed,
      visible: view.visible,
      matrix: this.serializeValue(view.matrix, this.defaultOptions, 0),
      viewport: view.viewport,
      controlPoints: view.controlPoints,
      boundingBox: view.boundingBox,
      content: this.serializeValue(view.content, this.defaultOptions, 0)
    }

    // 序列化生命周期回调函数
    const lifecycleCallbacks: any = {}
    if (view.onCreate) {
      lifecycleCallbacks.onCreate = view.onCreate.toString()
    }
    if (view.onAttach) {
      lifecycleCallbacks.onAttach = view.onAttach.toString()
    }
    if (view.onDestroy) {
      lifecycleCallbacks.onDestroy = view.onDestroy.toString()
    }

    if (Object.keys(lifecycleCallbacks).length > 0) {
      result.lifecycleCallbacks = lifecycleCallbacks
    }

    return result
  }

  /**
   * 反序列化TextView对象
   */
  private deserializeTextView(data: any): TextView {
    const content = this.deserializeValue(data.content, this.defaultOptions)
    const view = new TextView(content)
    
    // 设置基本属性
    view.id = data.id
    view.layer = data.layer
    view.properties = this.deserializeValue(data.properties, this.defaultOptions)
    view.data = this.deserializeValue(data.data, this.defaultOptions)
    view.style = this.deserializeValue(data.style, this.defaultOptions)
    view.selected = data.selected
    view.actived = data.actived
    view.freezed = data.freezed
    view.visible = data.visible
    view.matrix = this.deserializeValue(data.matrix, this.defaultOptions)
    view.viewport = data.viewport
    view.controlPoints = data.controlPoints
    view.boundingBox = data.boundingBox

    // 反序列化生命周期回调函数
    if (data.lifecycleCallbacks) {
      Object.keys(data.lifecycleCallbacks).forEach(callbackName => {
        try {
          const callbackString = data.lifecycleCallbacks[callbackName]
          if (typeof callbackString === 'string') {
            const callback = new Function('return ' + callbackString)()
            switch (callbackName) {
              case 'onCreate':
                view.onCreate = callback
                break
              case 'onAttach':
                view.onAttach = callback
                break
              case 'onDestroy':
                view.onDestroy = callback
                break
            }
          }
        } catch (error) {
          console.warn(`Failed to deserialize lifecycle callback ${callbackName}:`, error)
        }
      })
    }

    return view
  }

  /**
   * 序列化ImageView对象
   */
  private serializeImageView(view: ImageView): any {
    const result: any = {
      id: view.id,
      type: view.type,
      layer: view.layer,
      properties: this.serializeValue(view.properties, this.defaultOptions, 0),
      data: this.serializeValue(view.data, this.defaultOptions, 0),
      style: this.serializeValue(view.style, this.defaultOptions, 0),
      selected: view.selected,
      actived: view.actived,
      freezed: view.freezed,
      visible: view.visible,
      matrix: this.serializeValue(view.matrix, this.defaultOptions, 0),
      viewport: view.viewport,
      controlPoints: view.controlPoints,
      boundingBox: view.boundingBox,
      content: this.serializeValue(view.content, this.defaultOptions, 0)
    }

    // 序列化生命周期回调函数
    const lifecycleCallbacks: any = {}
    if (view.onCreate) {
      lifecycleCallbacks.onCreate = view.onCreate.toString()
    }
    if (view.onAttach) {
      lifecycleCallbacks.onAttach = view.onAttach.toString()
    }
    if (view.onDestroy) {
      lifecycleCallbacks.onDestroy = view.onDestroy.toString()
    }

    if (Object.keys(lifecycleCallbacks).length > 0) {
      result.lifecycleCallbacks = lifecycleCallbacks
    }

    return result
  }

  /**
   * 反序列化ImageView对象
   */
  private deserializeImageView(data: any): ImageView {
    const content = this.deserializeValue(data.content, this.defaultOptions)
    const view = new ImageView(content)
    
    // 设置基本属性
    view.id = data.id
    view.layer = data.layer
    view.properties = this.deserializeValue(data.properties, this.defaultOptions)
    view.data = this.deserializeValue(data.data, this.defaultOptions)
    view.style = this.deserializeValue(data.style, this.defaultOptions)
    view.selected = data.selected
    view.actived = data.actived
    view.freezed = data.freezed
    view.visible = data.visible
    view.matrix = this.deserializeValue(data.matrix, this.defaultOptions)
    view.viewport = data.viewport
    view.controlPoints = data.controlPoints
    view.boundingBox = data.boundingBox

    // 反序列化生命周期回调函数
    if (data.lifecycleCallbacks) {
      Object.keys(data.lifecycleCallbacks).forEach(callbackName => {
        try {
          const callbackString = data.lifecycleCallbacks[callbackName]
          if (typeof callbackString === 'string') {
            const callback = new Function('return ' + callbackString)()
            switch (callbackName) {
              case 'onCreate':
                view.onCreate = callback
                break
              case 'onAttach':
                view.onAttach = callback
                break
              case 'onDestroy':
                view.onDestroy = callback
                break
            }
          }
        } catch (error) {
          console.warn(`Failed to deserialize lifecycle callback ${callbackName}:`, error)
        }
      })
    }

    return view
  }

  /**
   * 序列化VideoView对象
   */
  private serializeVideoView(view: VideoView): any {
    const result: any = {
      id: view.id,
      type: view.type,
      layer: view.layer,
      properties: this.serializeValue(view.properties, this.defaultOptions, 0),
      data: this.serializeValue(view.data, this.defaultOptions, 0),
      style: this.serializeValue(view.style, this.defaultOptions, 0),
      selected: view.selected,
      actived: view.actived,
      freezed: view.freezed,
      visible: view.visible,
      matrix: this.serializeValue(view.matrix, this.defaultOptions, 0),
      viewport: view.viewport,
      controlPoints: view.controlPoints,
      boundingBox: view.boundingBox,
      content: this.serializeValue(view.content, this.defaultOptions, 0)
    }

    // 序列化生命周期回调函数
    const lifecycleCallbacks: any = {}
    if (view.onCreate) {
      lifecycleCallbacks.onCreate = view.onCreate.toString()
    }
    if (view.onAttach) {
      lifecycleCallbacks.onAttach = view.onAttach.toString()
    }
    if (view.onDestroy) {
      lifecycleCallbacks.onDestroy = view.onDestroy.toString()
    }

    if (Object.keys(lifecycleCallbacks).length > 0) {
      result.lifecycleCallbacks = lifecycleCallbacks
    }

    return result
  }

  /**
   * 反序列化VideoView对象
   */
  private deserializeVideoView(data: any): VideoView {
    const content = this.deserializeValue(data.content, this.defaultOptions)
    const view = new VideoView(content)
    
    // 设置基本属性
    view.id = data.id
    view.layer = data.layer
    view.properties = this.deserializeValue(data.properties, this.defaultOptions)
    view.data = this.deserializeValue(data.data, this.defaultOptions)
    view.style = this.deserializeValue(data.style, this.defaultOptions)
    view.selected = data.selected
    view.actived = data.actived
    view.freezed = data.freezed
    view.visible = data.visible
    view.matrix = this.deserializeValue(data.matrix, this.defaultOptions)
    view.viewport = data.viewport
    view.controlPoints = data.controlPoints
    view.boundingBox = data.boundingBox

    // 反序列化生命周期回调函数
    if (data.lifecycleCallbacks) {
      Object.keys(data.lifecycleCallbacks).forEach(callbackName => {
        try {
          const callbackString = data.lifecycleCallbacks[callbackName]
          if (typeof callbackString === 'string') {
            const callback = new Function('return ' + callbackString)()
            switch (callbackName) {
              case 'onCreate':
                view.onCreate = callback
                break
              case 'onAttach':
                view.onAttach = callback
                break
              case 'onDestroy':
                view.onDestroy = callback
                break
            }
          }
        } catch (error) {
          console.warn(`Failed to deserialize lifecycle callback ${callbackName}:`, error)
        }
      })
    }

    return view
  }
}
