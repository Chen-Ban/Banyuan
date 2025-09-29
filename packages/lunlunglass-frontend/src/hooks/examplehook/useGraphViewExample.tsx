import { useState, useCallback } from 'react'
import { GraphView } from 'banvasgl'
import { Rectangle, Circle, Line } from 'banvasgl'
import { Style, Color, Point3 } from 'banvasgl'

export const useGraphViewExample = () => {
  const [graphView, setGraphView] = useState<GraphView | null>(null)

  const createGraphView = useCallback(() => {
    // 创建图形元素
    const rectangle = new Rectangle(50, 50, 100, 80)
    const circle = new Circle(new Point3(200, 100, 0), 50)
    const line = new Line(new Point3(0, 0, 0), new Point3(300, 150, 0))

    // 设置样式
    rectangle.style.setFillColor(Color.BLUE)
    circle.style.setFillColor(Color.RED)
    line.style.setStrokeColor(Color.GREEN).setStrokeWidth(3)

    // 创建图形视图（使用矩形作为主图形）
    const view = new GraphView(rectangle, {
      style: new Style().setPaddingAll(10).setMarginAll(5)
    })

    setGraphView(view)
    return view
  }, [])

  const createCircleView = useCallback(() => {
    const circle = new Circle(new Point3(100, 100, 0), 60)
    circle.style.setFillColor(Color.PURPLE)

    const view = new GraphView(circle, {
      style: new Style().setPaddingAll(10).setMarginAll(5)
    })

    setGraphView(view)
    return view
  }, [])

  const createLineView = useCallback(() => {
    const line = new Line(new Point3(0, 0, 0), new Point3(200, 100, 0))
    line.style.setStrokeColor(Color.ORANGE).setStrokeWidth(5)

    const view = new GraphView(line, {
      style: new Style().setPaddingAll(10).setMarginAll(5)
    })

    setGraphView(view)
    return view
  }, [])

  const updateGraphStyle = useCallback((color: Color) => {
    if (graphView && graphView.content) {
      graphView.content.style.setFillColor(color)
    }
  }, [graphView])

  return {
    graphView,
    createGraphView,
    createCircleView,
    createLineView,
    updateGraphStyle
  }
}
