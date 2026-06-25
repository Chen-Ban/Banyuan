import { HorizontalAlign } from '@/foundation/constants'
import Graph from '@/graph/base/Graph'
import TextElement from './TextElement'

/**
 * 段落选项类
 * 包含段落级别的样式和布局配置
 */
export default class ParagraphOptions {
  public horizontalAlign: HorizontalAlign
  public leading: number
  public preHeight: number
  public postHeight: number
  public listItemDecoration: Graph | TextElement[] | undefined
  public indentation: number
  public preWidth: number

  constructor(
    horizontalAlign: HorizontalAlign = HorizontalAlign.LEFT,
    leading: number = 1.2,
    preHeight: number = 0,
    postHeight: number = 0,
    listItemDecoration: Graph | TextElement[] | undefined = undefined,
    indentation: number = 0,
    preWidth: number = 0,
  ) {
    this.horizontalAlign = horizontalAlign
    this.leading = leading
    this.preHeight = preHeight
    this.postHeight = postHeight
    this.listItemDecoration = listItemDecoration
    this.indentation = indentation
    this.preWidth = preWidth
  }

  /**
   * 复制选项
   */
  copy(): ParagraphOptions {
    return new ParagraphOptions(
      this.horizontalAlign,
      this.leading,
      this.preHeight,
      this.postHeight,
      this.listItemDecoration,
      this.indentation,
      this.preWidth,
    )
  }

  /**
   * 比较两个选项是否相等
   */
  equals(other: ParagraphOptions): boolean {
    return (
      this.horizontalAlign === other.horizontalAlign &&
      this.leading === other.leading &&
      this.preHeight === other.preHeight &&
      this.postHeight === other.postHeight &&
      this.indentation === other.indentation &&
      this.preWidth === other.preWidth
    )
  }

  /**
   * 静态工厂方法 - 创建居中对齐段落选项
   */
  static center(leading: number = 1.2): ParagraphOptions {
    return new ParagraphOptions(HorizontalAlign.CENTER, leading)
  }

  /**
   * 静态工厂方法 - 创建右对齐段落选项
   */
  static right(leading: number = 1.2): ParagraphOptions {
    return new ParagraphOptions(HorizontalAlign.RIGHT, leading)
  }

  // ── 序列化 ──
  toJSON(): any {
    return {
      horizontalAlign: this.horizontalAlign,
      leading: this.leading,
      preHeight: this.preHeight,
      postHeight: this.postHeight,
      indentation: this.indentation,
      preWidth: this.preWidth,
    }
  }

  static fromJSON(data: any): ParagraphOptions {
    return new ParagraphOptions(
      data.horizontalAlign,
      data.leading,
      data.preHeight,
      data.postHeight,
      undefined, // listItemDecoration not serialized
      data.indentation,
      data.preWidth,
    )
  }

  /**
   * 预定义段落选项
   */
  static readonly DEFAULT = new ParagraphOptions()
  static readonly CENTER = ParagraphOptions.center()
  static readonly RIGHT = ParagraphOptions.right()
}
