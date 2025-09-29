import { useState, useCallback } from 'react'
import { CombinedView, TextView, ImageView, GraphView } from 'banvasgl'
import { Texts, TextElement, TextParagraph, TextOptions, ParagraphOptions } from 'banvasgl'
import { ImageElement } from 'banvasgl'
import { Rectangle } from 'banvasgl'
import { Rectangle as LayoutRectangle } from 'banvasgl'
import { Style, Color } from 'banvasgl'

export const useCombinedViewExample = () => {
  const [combinedView, setCombinedView] = useState<CombinedView | null>(null)

  const createCombinedView = useCallback(() => {
    // 创建文本视图
    const textElement = new TextElement('T', new TextOptions().setSize(20).setColor(Color.BLACK))
    const paragraph = new TextParagraph(new ParagraphOptions())
    paragraph.addTextElement(textElement)
    const texts = new Texts([paragraph])
    const textView = new TextView(texts, {
      layoutArea: new LayoutRectangle(0, 0, 100, 50),
      style: new Style().setPaddingAll(5)
    })

    // 创建图片视图
    const imageElement = new ImageElement(0, 0, 'https://via.placeholder.com/80x60/FF5722/FFFFFF?text=IMG')
    const imageView = new ImageView(imageElement, {
      style: new Style().setPaddingAll(5)
    })

    // 创建图形视图
    const rectangle = new Rectangle(0, 0, 60, 40)
    rectangle.style.setFillColor(Color.GREEN)
    const graphView = new GraphView(rectangle, {
      style: new Style().setPaddingAll(5)
    })

    // 创建组合视图
    const view = new CombinedView([textView, imageView, graphView], {
      style: new Style().setPaddingAll(10).setMarginAll(5)
    })

    setCombinedView(view)
    return view
  }, [])

  const addChildView = useCallback((childView: any) => {
    if (combinedView) {
      combinedView.addChild(childView)
    }
  }, [combinedView])

  const removeChildView = useCallback((childView: any) => {
    if (combinedView) {
      combinedView.removeChild(childView)
    }
  }, [combinedView])

  const clearChildren = useCallback(() => {
    if (combinedView) {
      combinedView.clear()
    }
  }, [combinedView])

  const getChildCount = useCallback(() => {
    return combinedView ? combinedView.getChildCount() : 0
  }, [combinedView])

  return {
    combinedView,
    createCombinedView,
    addChildView,
    removeChildView,
    clearChildren,
    getChildCount
  }
}
