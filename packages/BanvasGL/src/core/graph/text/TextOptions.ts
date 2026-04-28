import { Color } from "@/core/style";
import { FontStyle, FontWeight } from "@/core/constants";

/**
 * 文字元素选项类
 * 包含单个文字元素的样式配置
 */
export default class TextOptions {
  public color: Color;
  public family: string;
  public size: number;
  public letterSpacing: number;
  public style: FontStyle;
  public weight: FontWeight;

  constructor(
    color: Color = Color.BLACK,
    family: string = "Arial",
    size: number = 16,
    letterSpacing: number = 0,
    style: FontStyle = FontStyle.NORMAL,
    weight: FontWeight = FontWeight.NORMAL
  ) {
    this.color = color;
    this.family = family;
    this.letterSpacing = letterSpacing;
    this.size = size;
    this.style = style;
    this.weight = weight;
  }

  /**
   * 获取完整的字体字符串
   */
  get fontString(): string {
    return `${this.style} ${this.weight} ${this.size}px ${this.family}`;
  }

  /**
   * 复制选项
   */
  copy(): TextOptions {
    return new TextOptions(this.color.copy(), this.family, this.size, this.letterSpacing, this.style, this.weight);
  }

  /**
   * 比较两个选项是否相等
   */
  equals(other: TextOptions): boolean {
    return (
      this.color.equals(other.color) &&
      this.family === other.family &&
      this.size === other.size &&
      this.style === other.style &&
      this.weight === other.weight
    );
  }

  /**
   * 静态工厂方法 - 创建粗体文字选项
   */
  static bold(color: Color = Color.BLACK, family: string = "Arial", size: number = 16): TextOptions {
    return new TextOptions(color, family, size, 0, FontStyle.NORMAL, FontWeight.BOLD);
  }

  /**
   * 静态工厂方法 - 创建斜体文字选项
   */
  static italic(color: Color = Color.BLACK, family: string = "Arial", size: number = 16): TextOptions {
    return new TextOptions(color, family, size, 0, FontStyle.ITALIC, FontWeight.NORMAL);
  }

  /**
   * 静态工厂方法 - 创建标题文字选项
   */
  static title(color: Color = Color.BLACK, family: string = "Arial", size: number = 24): TextOptions {
    return new TextOptions(color, family, size, 0, FontStyle.NORMAL, FontWeight.BOLD);
  }

  /**
   * 静态工厂方法 - 创建小号文字选项
   */
  static small(color: Color = Color.BLACK, family: string = "Arial", size: number = 12): TextOptions {
    return new TextOptions(color, family, size, 0, FontStyle.NORMAL, FontWeight.NORMAL);
  }

  // ── 序列化 ──
  toJSON(): any {
    return {
      color: this.color.toJSON(),
      family: this.family,
      size: this.size,
      letterSpacing: this.letterSpacing,
      style: this.style,
      weight: this.weight,
    }
  }

  static fromJSON(data: any): TextOptions {
    return new TextOptions(
      Color.fromJSON(data.color),
      data.family,
      data.size,
      data.letterSpacing,
      data.style,
      data.weight,
    )
  }

  /**
   * 预定义文字选项
   */
  static readonly DEFAULT = new TextOptions();
  static readonly BOLD = TextOptions.bold();
  static readonly ITALIC = TextOptions.italic();
  static readonly TITLE = TextOptions.title();
  static readonly SMALL = TextOptions.small();
}
