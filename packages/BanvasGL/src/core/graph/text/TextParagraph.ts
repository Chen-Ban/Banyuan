import { GRAPHTYPE, HORIZONTALALIGN } from "@/core/constants";
import Graph from "@/core/graph/base/Graph";
import { Point3 } from "@/core/math";
import { Style, Color } from "@/core/style";
import TextElement from "./TextElement";
import ParagraphOptions from "./ParagraphOptions";
import Bounds from "../base/Bounds";
import TextOptions from "./TextOptions";

/**
 * 文字段落类
 * 表示一个段落，包含多个文字元素
 */
export default class TextParagraph extends Graph {
  public type: GRAPHTYPE = GRAPHTYPE.TEXTPARAGRAPH;
  public controlPoints: Point3[];
  public style: Style;
  public options: ParagraphOptions;
  public texts: TextElement[];
  public isLayouted: boolean = false;

  constructor(options: ParagraphOptions = ParagraphOptions.DEFAULT, style: Style = Style.DEFAULT) {
    super();
    this.options = options;
    this.style = style;
    this.texts = [];
    // 初始化时不设置控制点和包围盒，等待布局时设置
    this.controlPoints = [];
  }

  // 计算文字段落的包围盒
  protected calculateBounds(): Bounds {
    // 计算所有文字元素的包围盒
    const bounds = this.texts.map((text) => text.getBounds());
    if (bounds.length === 0) {
      return Bounds.empty();
    }
    const { preHeight, preWidth, postHeight } = this.options;
    const unionBounds = Bounds.union(...bounds);
    unionBounds.x -= preWidth;
    unionBounds.y -= preHeight;
    unionBounds.height += preHeight + postHeight;
    unionBounds.width += preWidth;
    return unionBounds;
  }

  /**
   * 添加文字元素
   */
  addTextElement(textElement: TextElement): TextParagraph {
    this.texts.push(textElement);
    return this;
  }

  /**
   * 移除文字元素
   */
  removeTextElement(textElement: TextElement): TextParagraph {
    const index = this.texts.indexOf(textElement);
    if (index > -1) {
      this.texts.splice(index, 1);
    }
    return this;
  }

  /**
   * 清空所有文字元素
   */
  clearTextElements(): TextParagraph {
    this.texts = [];
    return this;
  }

  /**
   * 添加文字内容（创建新的TextElement）
   */
  addText(content: string, index: number = this.texts.length, options?: TextOptions): this {
    const textOptions = options || this.texts[Math.max(0, index - 1)].options;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];
      const textElement = new TextElement(char, textOptions.copy());
      this.texts.splice(index + i, 0, textElement);
    }
    return this;
  }

  public renderPath(ctx: CanvasRenderingContext2D, dependent: Boolean): void {
    dependent && ctx.beginPath();
    const bounds = this.getBounds();
    ctx.moveTo(bounds.x, bounds.y);
    ctx.lineTo(bounds.x + bounds.width, bounds.y);
    ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
    ctx.lineTo(bounds.x, bounds.y + bounds.height);
    ctx.lineTo(bounds.x, bounds.y);
  }
  /**
   * 渲染段落
   */
  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    // 应用样式
    const bounds = this.getBounds();
    this.style.applyToContext(ctx, bounds.width, bounds.height);
    this.renderPath(ctx, true);
    ctx.strokeStyle = "#bfa";
    ctx.setLineDash([1, 1]);
    ctx.lineWidth = 5;
    ctx.stroke();

    // 渲染所有文字元素
    for (const textElement of this.texts) {
      textElement.render(ctx);
    }
    ctx.restore();
  }

  /**
   * 复制段落
   */
  public copy(): this {
    const newParagraph = new TextParagraph(this.options.copy(), this.style.copy());

    // 复制所有文字元素
    for (const textElement of this.texts) {
      newParagraph.addTextElement(textElement.copy());
    }

    // 如果原对象已经布局，则设置position
    if (this.isLayouted) {
      newParagraph.layout(this.controlPoints[0].copy());
    }

    return newParagraph as this;
  }

  /**
   * 布局方法 - 在TextView中调用时设置位置和计算包围盒
   */
  public layout(position: Point3): TextParagraph {
    this.isLayouted = true;
    this.controlPoints = [position.copy()];
    // 计算包围盒
    this.setBounds(this.calculateBounds());
    return this;
  }

  /**
   * 静态工厂方法 - 创建简单段落
   */
  static simple(content: string, options?: ParagraphOptions): TextParagraph {
    const paragraph = new TextParagraph(options);
    paragraph.addText(content, 0, TextOptions.DEFAULT);
    return paragraph;
  }

  /**
   * 静态工厂方法 - 创建居中对齐段落
   */
  static center(content: string): TextParagraph {
    const options = ParagraphOptions.center();
    const paragraph = new TextParagraph(options);
    paragraph.addText(content);
    return paragraph;
  }
}
