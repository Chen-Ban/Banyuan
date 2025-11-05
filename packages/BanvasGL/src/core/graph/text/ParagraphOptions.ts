import { HORIZONTALALIGN } from "@/constants";
import Graph from "@/core/graph/base/Graph";
import TextElement from "./TextElement";

/**
 * 段落选项类
 * 包含段落级别的样式和布局配置
 */
export default class ParagraphOptions {
  public horizontalAlign: HORIZONTALALIGN;
  public leading: number;
  public preHeight: number;
  public postHeight: number;
  public listItemDecoration: Graph | TextElement[] | undefined;
  public indentation: number;
  public preWidth: number;

  constructor(
    horizontalAlign: HORIZONTALALIGN = HORIZONTALALIGN.LEFT,
    leading: number = 1.2,
    preHeight: number = 0,
    postHeight: number = 0,
    listItemDecoration: Graph | TextElement[] | undefined = undefined,
    indentation: number = 0,
    preWidth: number = 0
  ) {
    this.horizontalAlign = horizontalAlign;
    this.leading = leading;
    this.preHeight = preHeight;
    this.postHeight = postHeight;
    this.listItemDecoration = listItemDecoration;
    this.indentation = indentation;
    this.preWidth = preWidth;
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
      this.preWidth
    );
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
    );
  }

  /**
   * 静态工厂方法 - 创建居中对齐段落选项
   */
  static center(
    leading: number = 1.2,
    letterSpacing: number = 0
  ): ParagraphOptions {
    return new ParagraphOptions(HORIZONTALALIGN.CENTER, leading, letterSpacing);
  }

  /**
   * 静态工厂方法 - 创建右对齐段落选项
   */
  static right(
    leading: number = 1.2,
    letterSpacing: number = 0
  ): ParagraphOptions {
    return new ParagraphOptions(HORIZONTALALIGN.RIGHT, leading, letterSpacing);
  }

  /**
   * 预定义段落选项
   */
  static readonly DEFAULT = new ParagraphOptions();
  static readonly CENTER = ParagraphOptions.center();
  static readonly RIGHT = ParagraphOptions.right();
}
