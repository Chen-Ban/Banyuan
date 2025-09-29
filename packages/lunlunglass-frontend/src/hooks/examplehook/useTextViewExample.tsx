import { useState, useCallback } from 'react'
import { TextView } from 'banvasgl'
import { Texts, TextElement, TextParagraph, TextOptions, ParagraphOptions } from 'banvasgl'
import { Rectangle } from 'banvasgl'
import { Style, Color } from 'banvasgl'

export const useTextViewExample = () => {
  const [textView, setTextView] = useState<TextView | null>(null)

  const createTextView = useCallback(() => {
    // 创建文字元素
    const textElement1 = new TextElement('H', new TextOptions().setSize(24).setColor(Color.BLACK))
    const textElement2 = new TextElement('e', new TextOptions().setSize(24).setColor(Color.BLACK))
    const textElement3 = new TextElement('l', new TextOptions().setSize(24).setColor(Color.BLACK))
    const textElement4 = new TextElement('l', new TextOptions().setSize(24).setColor(Color.BLACK))
    const textElement5 = new TextElement('o', new TextOptions().setSize(24).setColor(Color.BLACK))
    const textElement6 = new TextElement(' ', new TextOptions().setSize(24).setColor(Color.BLACK))
    const textElement7 = new TextElement('W', new TextOptions().setSize(24).setColor(Color.BLACK))
    const textElement8 = new TextElement('o', new TextOptions().setSize(24).setColor(Color.BLACK))
    const textElement9 = new TextElement('r', new TextOptions().setSize(24).setColor(Color.BLACK))
    const textElement10 = new TextElement('l', new TextOptions().setSize(24).setColor(Color.BLACK))
    const textElement11 = new TextElement('d', new TextOptions().setSize(24).setColor(Color.BLACK))
    const textElement12 = new TextElement('!', new TextOptions().setSize(24).setColor(Color.BLACK))

    // 创建段落
    const paragraph = new TextParagraph(
      new ParagraphOptions().setIndentation(2).setLeading(1.5)
    )
    paragraph.addTextElement(textElement1)
    paragraph.addTextElement(textElement2)
    paragraph.addTextElement(textElement3)
    paragraph.addTextElement(textElement4)
    paragraph.addTextElement(textElement5)
    paragraph.addTextElement(textElement6)
    paragraph.addTextElement(textElement7)
    paragraph.addTextElement(textElement8)
    paragraph.addTextElement(textElement9)
    paragraph.addTextElement(textElement10)
    paragraph.addTextElement(textElement11)
    paragraph.addTextElement(textElement12)

    // 创建文字集合
    const texts = new Texts([paragraph])

    // 创建布局区域
    const layoutArea = new Rectangle(0, 0, 400, 200)

    // 创建文本视图
    const view = new TextView(texts, {
      layoutArea,
      style: new Style().setPaddingAll(10).setMarginAll(5)
    })

    setTextView(view)
    return view
  }, [])

  const updateText = useCallback((newText: string) => {
    if (textView && textView.content) {
      // 清空现有文字
      textView.content.paragraphs[0].texts = []
      
      // 添加新文字
      for (const char of newText) {
        const textElement = new TextElement(char, new TextOptions().setSize(24).setColor(Color.BLACK))
        textView.content.paragraphs[0].addTextElement(textElement)
      }
      
      // 触发重新布局
      textView.shouldLayout = true
    }
  }, [textView])

  return {
    textView,
    createTextView,
    updateText
  }
}
