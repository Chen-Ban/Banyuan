import Serializer from './Serializer'
import { Point3 } from '../math'
import { Style } from '../style'
import { GRAPHTYPE } from '../../constants'
import CombinedGraph from '../graph/combined/CombinedGraph'
import Line from '../graph/analytic/Line'
import Circle from '../graph/analytic/Circle'
import CombinedView from '../views/CombinedView'
import GraphView from '../views/GraphView'

/**
 * 序列化工具使用示例
 * 展示如何序列化和反序列化可实例化图形和容器
 */
export class SerializerExample {
  
  /**
   * 演示可实例化图形的序列化
   */
  static demonstrateGraphSerialization(): void {
    console.log('=== 可实例化图形序列化示例 ===')
    
    // 创建一些图形
    const line = new Line(
      new Point3(0, 0, 0),
      new Point3(100, 100, 0),
      Style.DEFAULT
    )
    
    const circle = new Circle(
      new Point3(50, 50, 0),
      25,
      Style.DEFAULT
    )
    
    // 创建组合图形
    const combinedGraph = new CombinedGraph([line, circle], Style.DEFAULT)
    
    // 序列化组合图形
    const serializedGraph = Serializer.serializeCombinedGraph(combinedGraph)
    console.log('序列化的组合图形:', serializedGraph)
    
    // 反序列化组合图形
    const deserializedGraph = Serializer.deserializeCombinedGraph(serializedGraph)
    console.log('反序列化的组合图形:', deserializedGraph)
    console.log('图形数量:', deserializedGraph.getGraphCount())
  }
  
  /**
   * 演示可实例化容器的序列化
   */
  static demonstrateViewSerialization(): void {
    console.log('=== 可实例化容器序列化示例 ===')
    
    // 创建一些图形
    const line = new Line(
      new Point3(0, 0, 0),
      new Point3(100, 100, 0),
      Style.DEFAULT
    )
    
    const circle = new Circle(
      new Point3(50, 50, 0),
      25,
      Style.DEFAULT
    )
    
    // 创建图形视图
    const graphView1 = new GraphView(line)
    const graphView2 = new GraphView(circle)
    
    // 创建组合视图
    const combinedView = new CombinedView([graphView1, graphView2])
    
    // 序列化组合视图
    const serializedView = Serializer.serializeCombinedView(combinedView)
    console.log('序列化的组合视图:', serializedView)
    
    // 反序列化组合视图
    const deserializedView = Serializer.deserializeCombinedView(serializedView)
    console.log('反序列化的组合视图:', deserializedView)
    console.log('子视图数量:', deserializedView.getChildCount())
  }
  
  /**
   * 演示复杂嵌套结构的序列化
   */
  static demonstrateComplexSerialization(): void {
    console.log('=== 复杂嵌套结构序列化示例 ===')
    
    // 创建嵌套的组合图形
    const innerLine = new Line(
      new Point3(0, 0, 0),
      new Point3(50, 50, 0),
      Style.DEFAULT
    )
    
    const innerCircle = new Circle(
      new Point3(25, 25, 0),
      15,
      Style.DEFAULT
    )
    
    const innerCombined = new CombinedGraph([innerLine, innerCircle], Style.DEFAULT)
    
    const outerLine = new Line(
      new Point3(0, 0, 0),
      new Point3(100, 100, 0),
      Style.DEFAULT
    )
    
    const outerCombined = new CombinedGraph([innerCombined, outerLine], Style.DEFAULT)
    
    // 创建包含嵌套图形的视图
    const graphView = new GraphView(outerCombined)
    const combinedView = new CombinedView([graphView])
    
    // 序列化整个结构
    const serialized = Serializer.serialize(combinedView)
    console.log('序列化的复杂结构:', serialized)
    
    // 反序列化整个结构
    const deserialized = Serializer.deserialize(serialized)
    console.log('反序列化的复杂结构:', deserialized)
    
    // 验证嵌套结构
    const deserializedView = deserialized as CombinedView
    const deserializedGraphView = deserializedView.getChildren()[0] as GraphView
    const deserializedGraph = deserializedGraphView.content as CombinedGraph
    console.log('外层图形数量:', deserializedGraph.getGraphCount())
    
    const innerGraph = deserializedGraph.getGraphsByType(GRAPHTYPE.COMBINED_GRAPH)[0] as CombinedGraph
    console.log('内层图形数量:', innerGraph.getGraphCount())
  }
  
  /**
   * 运行所有示例
   */
  static runAllExamples(): void {
    this.demonstrateGraphSerialization()
    console.log('\n')
    this.demonstrateViewSerialization()
    console.log('\n')
    this.demonstrateComplexSerialization()
  }
}

// 导出示例类供外部使用
export default SerializerExample