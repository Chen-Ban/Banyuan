import { GraphType, HorizontalAlign, VerticalAlign } from "@/foundation/constants";
import Graph from "@/graph/base/Graph";
import { MathUtils, Point3, Vector3, Matrix4 } from "@/foundation/math";
import { Style } from "@/foundation/style";
import TextParagraph from "./TextParagraph";
import TextFieldsOptions from "./TextFieldsOptions";
import Bounds from "@/graph/base/Bounds";
import { Rectangle } from "@/graph/combined";
import TextElement from "./TextElement";
import TextOptions from "./TextOptions";
import { isGraphType } from '@/foundation/guards'
import type { ITextFields } from '@/types/graph/graph'
import type { ISerializable } from '@/types/foundation/serializable'
import type { IDrawingContext } from '@/types/platform/drawing.js'
import { generateId } from "@/foundation/utils";

//文本选区三元组： 段落号，字序号，字前｜字后
export type TextIndex = [number, number, 0 | 1];

/**
 * 文本域类
 * 表示一个文本域，包含多个段落
 * 是文本内容的最外层容器
 */
export default class TextFields
  extends Graph
  implements ITextFields, ISerializable
{
  public type: GraphType = GraphType.TEXTFIELDS;
  public controlPoints: Point3[];
  public options: TextFieldsOptions;
  public paragraphs: TextParagraph[];
  public bounds: Bounds;

  public isClosed(): boolean {
    return false;
  }

  constructor(
    paragraphs: TextParagraph[] = [],
    options: TextFieldsOptions = TextFieldsOptions.DEFAULT,
    _style?: Style,
  ) {
    super();
    this.options = options;
    this.paragraphs = paragraphs;
    this.controlPoints = [];
    this.bounds = Bounds.empty();
    this.id = generateId(this.type);
  }

  /**
   * 获取段落数量
   */
  get paragraphCount(): number {
    return this.paragraphs.length;
  }

  /**
   * 获取所有文本内容
   */
  get textContent(): string[] {
    return this.paragraphs.map((paragraph) =>
      paragraph.texts.map((text) => text.content).join(""),
    );
  }

  /**
   * 添加段落
   */
  addParagraph(paragraph: TextParagraph): TextFields {
    this.paragraphs.push(paragraph);
    return this;
  }

  /**
   * 在指定位置插入段落
   */
  insertParagraph(index: number, paragraph: TextParagraph): TextFields {
    this.paragraphs.splice(index, 0, paragraph);
    return this;
  }

  /**
   * 移除段落
   */
  removeParagraph(paragraph: TextParagraph): TextFields {
    const index = this.paragraphs.indexOf(paragraph);
    if (index > -1) {
      this.paragraphs.splice(index, 1);
    }
    return this;
  }

  /**
   * 根据索引移除段落
   */
  removeParagraphAt(index: number): TextFields {
    if (index >= 0 && index < this.paragraphs.length) {
      this.paragraphs.splice(index, 1);
    }
    return this;
  }

  /**
   * 清空所有段落
   */
  clearParagraphs(): TextFields {
    this.paragraphs = [];
    return this;
  }

  /**
   * 获取指定索引的段落
   */
  getParagraph(index: number): TextParagraph | undefined {
    return this.paragraphs[index];
  }

  /**
   * 根据文本索引获取文本选项
   * @param textIndex 文本索引 [段落号, 字序号, 字前|字后]
   * @returns 文本选项
   */
  getTextOptionsByIndex(textIndex: TextIndex): TextOptions {
    const [paragraphIndex, textIndexInParagraph, position] = textIndex;
    const paragraph = this.paragraphs[paragraphIndex];

    if (!paragraph) {
      return TextOptions.DEFAULT;
    }

    const insertIndex = textIndexInParagraph + position;

    if (insertIndex > 0 && paragraph.texts[insertIndex - 1]) {
      // 使用前一个文本元素的选项
      return paragraph.texts[insertIndex - 1].options.copy();
    } else if (paragraph.texts.length > 0 && paragraph.texts[0]) {
      // 使用第一个文本元素的选项
      return paragraph.texts[0].options.copy();
    } else {
      // 使用默认选项
      return TextOptions.DEFAULT;
    }
  }

  /**
   * 更新包围盒
   */
  public updateBounds(): Bounds {
    if (this.paragraphs.length === 0) {
      return Bounds.empty();
    }

    const paragraphBounds = this.paragraphs.map((p) => p.bounds);
    const contentBounds = Bounds.union(...paragraphBounds);

    return contentBounds;
  }

  /**
   * 布局文本域
   * @param constraintBounds 排版约束区域，由 View 传入，描述内容可排版的空间
   * @param measureCtx 可选的 IDrawingContext，用于延迟测量文字尺寸。
   *                   传入时避免依赖全局 CanvasContext（P1a：TextElement lazy measurement）
   */
  public layout(constraintBounds?: Bounds, measureCtx?: IDrawingContext): TextFields {
    // 批量确保所有文字元素尺寸已测量（延迟测量的执行点）
    // measureCtx 由渲染帧的 bufferCtx 传入；无 ctx 时跳过测量（保持 dirty，后续渲染时重新触发）
    for (const paragraph of this.paragraphs) {
      for (const text of paragraph.texts) {
        text.ensureMeasured(measureCtx)
      }
    }

    // 优先使用传入的约束，其次回退到自身已有 bounds
    const layoutArea = (constraintBounds ?? this.bounds ?? Bounds.empty()).copy();

    // 如果没有固定宽度则选择最长段落宽度作为布局宽度，让所有段落能够一行展示
    if (!this.options.fixedWidth) {
      const widths = this.paragraphs.map(
        (paragraph, i) =>
          paragraph.texts.reduce(
            (a, b) => a + b.width + b.options.letterSpacing,
            0,
          ) +
          paragraph.options.preWidth + // 段前宽度
          (i === 0 ? this.calculateIndentationWidth(paragraph) : 0), // 第一行需要加上缩进
      );
      const maxWidth = Math.max(...widths);
      layoutArea.width = Math.sign(layoutArea.width) * maxWidth;
    }
    // 执行深度优先布局
    this.layoutParagraphs(this.paragraphs, Rectangle.fromBounds(layoutArea));
    this.bounds = this.updateBounds();
    return this;
  }

  private layoutParagraphs(
    paragraphs: TextParagraph[],
    layoutArea: Rectangle,
  ): void {
    // 从layoutArea左上角开始布局
    let currentY = layoutArea.getTopLeft().y;

    // 遍历所有段落进行布局
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      this.layoutParagraph(
        paragraph,
        layoutArea.getTopLeft().x,
        currentY,
        layoutArea.width,
      );
      const paragraphBounds = paragraph.bounds;
      currentY += paragraphBounds.height;
      // 段落间距（最后一个段落后不加）
      if (i < paragraphs.length - 1) {
        currentY += this.options.paragraphSpacing;
      }
    }
    this.adjustParagraphVerticalAlignment(paragraphs, layoutArea);
  }

  /**
   * 布局TextParagraph - 处理单个段落
   */
  private layoutParagraph(
    paragraph: TextParagraph,
    startX: number,
    startY: number,
    maxWidth: number,
  ): void {
    // 计算基于首字符宽度的缩进
    const indentationWidth = this.calculateIndentationWidth(paragraph);

    // 考虑段落的前宽度，但不在这里加缩进(因为只有第一行有缩进)
    const actualStartX = startX + paragraph.options.preWidth;
    const actualMaxWidth = maxWidth - paragraph.options.preWidth;

    const actualStartY = startY + paragraph.options.preHeight;

    // 布局段落内的所有TextElement，传递缩进信息
    this.layoutTextElementsInParagraph(
      paragraph,
      actualStartX,
      actualStartY,
      actualMaxWidth,
      indentationWidth,
    );

    // 设置段落的布局状态（先设置位置，再调整对齐）
    paragraph.applyLayout(new Point3(startX, startY, 0));

    // 根据段落的水平对齐方式调整段落内元素位置
    this.adjustParagraphHorizontalAlignment(paragraph, maxWidth);
  }

  /**
   * 布局段落内的TextElement - 处理换行和字符间距
   */
  private layoutTextElementsInParagraph(
    paragraph: TextParagraph,
    startX: number,
    startY: number,
    maxWidth: number,
    indentationWidth: number = 0,
  ): void {
    // 第一步：根据字体宽度进行分行
    const lines = this.breakTextIntoLines(
      paragraph,
      startX,
      maxWidth,
      indentationWidth,
    );
    // 第二步：计算每行的行高和位置
    let currentY = startY;

    const lineHeight = Math.max(
      ...lines.map((line) =>
        this.calculateLineHeight(line, paragraph.options.leading),
      ),
    );

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      let currentX = line.startX;

      for (const textElement of line.elements) {
        const position = new Point3(
          currentX,
          currentY + lineHeight - textElement.height,
          0,
        );
        textElement.applyLayout(position, lineHeight);

        // 更新X位置
        currentX += textElement.width + textElement.options.letterSpacing;
      }

      // 更新Y位置到下一行
      currentY += lineHeight;
    }
  }

  /**
   * 将文本元素分行
   */
  private breakTextIntoLines(
    paragraph: TextParagraph,
    startX: number,
    maxWidth: number,
    indentationWidth: number = 0,
  ): Array<{ elements: TextElement[]; startX: number }> {
    const lines: Array<{ elements: TextElement[]; startX: number }> = [];

    // 边界条件：空段落
    if (paragraph.texts.length === 0) {
      return lines;
    }

    let currentLine: TextElement[] = [];
    let currentX = startX + indentationWidth; // 第一行加上缩进
    let isFirstLine = true;

    for (const textElement of paragraph.texts) {
      const actualWidth = textElement.width;

      // 边界条件：单个文字宽度超过布局区域
      // 如果当前行是空的，但文字宽度超过可用空间，仍然要添加这个文字
      if (currentLine.length === 0) {
        // 当前行为空，直接添加文字（即使超出边界）
        currentLine.push(textElement);
        currentX += actualWidth + textElement.options.letterSpacing;
      } else {
        // 当前行不为空，检查是否需要换行
        if (currentX + actualWidth > startX + maxWidth) {
          // 保存当前行
          lines.push({
            elements: currentLine,
            startX: isFirstLine ? startX + indentationWidth : startX,
          });

          // 开始新行
          currentLine = [textElement];
          currentX = startX + actualWidth + textElement.options.letterSpacing;
          isFirstLine = false;
        } else {
          // 添加到当前行
          currentLine.push(textElement);
          currentX += actualWidth + textElement.options.letterSpacing;
        }
      }
    }

    // 添加最后一行
    if (currentLine.length > 0) {
      lines.push({
        elements: currentLine,
        startX: isFirstLine ? startX + indentationWidth : startX,
      });
    }

    return lines;
  }

  /**
   * 调整段落的水平对齐
   */
  private adjustParagraphHorizontalAlignment(
    paragraph: TextParagraph,
    maxWidth: number,
  ): void {
    const paragraphBounds = paragraph.bounds;
    if (!paragraphBounds) return;

    let offsetX = 0;

    switch (paragraph.options.horizontalAlign) {
      case HorizontalAlign.CENTER:
        offsetX = (maxWidth - paragraphBounds.width) / 2;
        break;
      case HorizontalAlign.RIGHT:
        offsetX = maxWidth - paragraphBounds.width;
        break;
      case HorizontalAlign.LEFT:
      default:
        offsetX = 0;
        break;
    }
    const offsetVector = new Vector3(offsetX, 0, 0);

    // 调整段落内所有TextElement的位置
    for (const textElement of paragraph.texts) {
      textElement.controlPoints[0] =
        textElement.controlPoints[0].add(offsetVector);
      textElement.applyLayout(
        textElement.controlPoints[0],
        textElement.lineHeight,
      );
    }
  }

  /**
   * 调整Texts的垂直对齐
   */
  private adjustParagraphVerticalAlignment(
    paragraphs: TextParagraph[],
    layoutArea: Rectangle,
  ): void {
    const textsBounds = Bounds.union(
      ...paragraphs.map((paragraph) => paragraph.bounds),
    );
    if (!textsBounds) return;

    let offsetY = 0;
    switch (this.options.verticalAlign) {
      case VerticalAlign.MIDDLE:
        offsetY = (layoutArea.height - textsBounds.height) / 2;
        break;
      case VerticalAlign.BOTTOM:
        offsetY = layoutArea.height - textsBounds.height;
        break;
      case VerticalAlign.TOP:
      default:
        offsetY = 0;
        break;
    }

    if (offsetY === 0) return;

    const offsetVector = new Vector3(0, offsetY, 0);
    // 调整所有段落内文字元素的位置（统一偏移）
    for (const paragraph of paragraphs) {
      for (const textElement of paragraph.texts) {
        textElement.applyLayout(
          textElement.controlPoints[0].add(offsetVector),
          textElement.lineHeight,
        );
      }
    }
  }

  /**
   * 计算行的行高
   */
  private calculateLineHeight(
    line: { elements: TextElement[]; startX: number },
    leading: number,
  ): number {
    if (line.elements.length === 0) {
      return 0;
    }

    // 找到该行中最大的字体大小
    const maxFontSize = Math.max(
      ...line.elements.map((element) => element.options.size),
    );

    // 行高 = 字体大小 * leading
    return maxFontSize * leading;
  }

  /**
   * 计算基于首字符宽度的缩进
   */
  private calculateIndentationWidth(paragraph: TextParagraph): number {
    if (paragraph.texts.length === 0 || paragraph.options.indentation === 0) {
      return 0;
    }

    // 获取首字符
    const firstTextElement = paragraph.texts[0];

    // 若首字符尚未测量（无 ctx 环境），宽度为 0，缩进回退为 0
    const firstCharWidth = firstTextElement.width;

    // 根据段落选项中的indentation值（作为倍数）计算实际缩进宽度
    return firstCharWidth * paragraph.options.indentation;
  }

  /**
   * 根据点选中TextElement
   * @param relativePoint 相对坐标
   * @param bufferCtx 用于命中检测的离屏上下文
   */
  public point2TextElement(relativePoint: Point3, bufferCtx?: IDrawingContext | null): TextElement | null {
    const hitedParagraph = this.paragraphs.find(
      (paragraph: TextParagraph) =>
        paragraph.isPointInPath(relativePoint, bufferCtx) ||
        paragraph.isPointOnCurve(relativePoint, 5),
    );
    if (hitedParagraph) {
      // 准确命中某个文字
      for (const t of hitedParagraph.texts) {
        const tb = t.bounds;
        const tRect = new Rectangle(tb.x, tb.y, tb.width, tb.height);
        const hitText = tRect.isPointInPath(relativePoint, bufferCtx);
        if (hitText) {
          return t;
        }
      }
      const hitedTextElement = this.probeTextElement(
        hitedParagraph.texts,
        relativePoint,
      );
      return hitedTextElement;
    }

    const layout = Rectangle.fromBounds(this.bounds);
    // 未命中段落，命中布局区域
    const hitedLayoutArea =
      layout.isPointInPath(relativePoint, bufferCtx) ||
      layout.isPointOnCurve(relativePoint, 5);
    if (hitedLayoutArea) {
      return this.probeTextElement(
        this.paragraphs.flatMap((paragraph) => paragraph.texts),
        relativePoint,
      );
    }
    return null;
  }

  /**
   * 文本转换为TextIndex,p作为辅助判断是下一个还是当前
   * @param textElement 文本元素
   * @param relativePoint 相对坐标点
   */
  public element2Index(
    textElement: TextElement,
    relativePoint: Point3,
  ): TextIndex {
    const bounds = textElement.bounds;
    for (const [i, p] of this.paragraphs.entries()) {
      for (const [j, t] of p.texts.entries()) {
        if (t === textElement) {
          const midPoint = new Point3(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
            0,
          );
          const index: TextIndex = [i, j, 0];
          if (relativePoint.x >= midPoint.x) {
            index[2] = 1;
          }
          if (isGraphType(t, GraphType.NONPRINTABLE_TEXTELEMENT)) {
            // 空段落时 j=0，确保索引不为负数
            index[1] = Math.max(0, index[1] - 1);
          }
          return index;
        }
      }
    }
    return [0, 0, 0];
  }

  /**
   * 探测文本元素（优先级：左上、右下、左下、右上）
   * @param textElements 需要探测的文本元素数组
   * @param p 相对坐标点
   * @returns 命中文本元素，未命中返回 null
   */
  private probeTextElement(
    textElements: TextElement[],
    p: Point3,
  ): TextElement | null {
    const leftTop = textElements.filter((b) => {
      const bounds = b.bounds;
      return bounds.x < p.x && bounds.y < p.y;
    });
    const rightTop = textElements.filter((b) => {
      const bounds = b.bounds;
      return bounds.x + bounds.width > p.x && bounds.y + bounds.height < p.y;
    });

    const rightBottom = textElements.filter((b) => {
      const bounds = b.bounds;
      return bounds.x + bounds.width > p.x && bounds.y + bounds.height > p.y;
    });
    const leftBottom = textElements.filter((b) => {
      const bounds = b.bounds;
      return bounds.x < p.x && bounds.y + bounds.height > p.y;
    });

    // 找到leftBottom和rightTop中离relativePoint最近的textElement
    const leftBottomDistance = leftBottom.map((b) => {
      const center = Rectangle.fromBounds(b.bounds).getCenter();
      return p.distance(new Point3(center.x, center.y, 0));
    });
    const rightTopDistance = rightTop.map((b) => {
      const center = Rectangle.fromBounds(b.bounds).getCenter();
      return p.distance(new Point3(center.x, center.y, 0));
    });
    const minLeftBottomDistance = Math.min(...leftBottomDistance);
    const minRightTopDistance = Math.min(...rightTopDistance);
    const minLeftBottomIndex = leftBottomDistance.indexOf(
      minLeftBottomDistance,
    );
    const minRightTopIndex = rightTopDistance.indexOf(minRightTopDistance);
    // 优先级左上、右下、左下、右上
    const hitedTextElement =
      leftTop[leftTop.length - 1] ||
      rightBottom[0] ||
      leftBottom[minLeftBottomIndex] ||
      rightTop[minRightTopIndex] ||
      null;
    return hitedTextElement;
  }

  public renderPath(ctx: IDrawingContext, dependent: boolean): void {
    dependent && ctx.beginPath();
    const bounds = this.bounds;
    ctx.moveTo(bounds.x, bounds.y);
    ctx.lineTo(bounds.x + bounds.width, bounds.y);
    ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
    ctx.lineTo(bounds.x, bounds.y + bounds.height);
    ctx.lineTo(bounds.x, bounds.y);
  }

  isPointOnCurve(_point: Point3, _tolerance: number = MathUtils.EPSILON): boolean {
    return false;
  }

  public getPointAt(_t: number): Point3 {
    return this.controlPoints[0] ?? new Point3(0, 0, 0);
  }

  public getLength(_tStart: number, _tEnd: number): number {
    return 0;
  }

  public getTangentAt(_t: number): Vector3 {
    return new Vector3(1, 0, 0);
  }

  public getNormalAt(_t: number): Vector3 {
    return new Vector3(0, 1, 0);
  }

  public getClosestPoint(point: Point3): {
    distance: number;
    closestPoint: Point3;
    parameter: number;
  } {
    return { distance: 0, closestPoint: point, parameter: 0 };
  }

  public getArea(): number {
    return 0;
  }

  public getCentroid(): Point3 {
    return this.controlPoints[0] ?? new Point3(0, 0, 0);
  }

  public transform(matrix: Matrix4): Graph {
    if (this.controlPoints.length > 0) {
      this.controlPoints[0] = matrix.multiply(this.controlPoints[0]);
      // 变换所有段落
      for (const paragraph of this.paragraphs) {
        paragraph.transform(matrix);
      }
      this.bounds = this.updateBounds();
    }
    return this;
  }

  public intersect(other: Graph): Point3[] {
    // 暂未实现
    return [];
  }

  /**
   * 渲染文本域
   */
  public render(ctx: IDrawingContext, style: Style): void {
    ctx.save();

    // 应用样式
    const bounds = this.bounds;
    style.applyToContext(ctx, Math.abs(bounds.width), Math.abs(bounds.height));

    // 渲染背景（如果有）
    this.renderPath(ctx, true);
    ctx.stroke();

    // 渲染所有段落
    for (const paragraph of this.paragraphs) {
      paragraph.render(ctx, style);
    }

    ctx.restore();
  }

  /**
   * 复制文本域
   */
  public copy(): this {
    const copiedParagraphs = this.paragraphs.map((p) => p.copy());
    const newTextFields = new TextFields(
      copiedParagraphs,
      this.options.copy(),
    );

    // 如果原对象已经布局，则复制布局信息
    if (this.controlPoints.length > 0) {
      newTextFields.controlPoints = [this.controlPoints[0].copy()];
      newTextFields.bounds = this.bounds.copy();
    }

    return newTextFields as this;
  }

  public resize(
    fixedPoint: Point3,
    dynamicPoint: Point3,
    resizeVector: Vector3,
  ): void {
    for (const paragraph of this.paragraphs) {
      paragraph.resize(fixedPoint, dynamicPoint, resizeVector);
    }
    // constraintBounds 已迁移至 View 层，由 View.resize() 负责回写
  }

  /** 文本域不支持顶点编辑 */
  public setControlPoint(_index: number, _point: Point3): void {}

  // ── 序列化 ──
  toJSON(): any {
    return {
      id: this.id,
      type: this.type,
      paragraphs: this.paragraphs.map((p) => p.toJSON()),
      options: this.options.toJSON(),
    };
  }

  static fromJSON(data: any): TextFields {
    const paragraphs = data.paragraphs.map((p: any) =>
      TextParagraph.fromJSON(p),
    );
    const fields = new TextFields(
      paragraphs,
      TextFieldsOptions.fromJSON(data.options),
    );
    fields.id = data.id;
    return fields;
  }

  /**
   * 静态工厂方法 - 创建简单文本域
   */
  static simple(content: string, options?: TextFieldsOptions): TextFields {
    const paragraph = TextParagraph.simple(content);
    return new TextFields([paragraph], options);
  }

  /**
   * 静态工厂方法 - 创建多段落文本域
   */
  static fromStrings(
    contents: string[],
    options?: TextFieldsOptions,
  ): TextFields {
    const paragraphs = contents.map((content) => TextParagraph.simple(content));
    return new TextFields(paragraphs, options);
  }
}

