import View, { ViewOptions, ViewContent } from "./View";
import TextParagraph from "../graph/text/TextParagraph";
import TextElement from "../graph/text/TextElement";
import { Rectangle } from "../graph/combined/Polygon";
import { MathUtils, Point3, Vector3 } from "../math";
import { world2Relative } from "@/utils/utils";
import { getGlobalCanvasContext } from "../renderer/CanvasContext";
import { ViewAddonImpl, InteractionMapBuilder } from "./addon";
import Selection from "./Selection";
import { HORIZONTALALIGN, VERTICALALIGN, VIEWTYPE } from "@/core/constants";
import { PointUtils } from "../graph/utils/PointUtils";
import { Action, Cursor, ExtraData } from "./addon/InteractionMapBuilder";
import Bounds from "../graph/base/Bounds";

// 文本视图选项接口
export interface TextViewOptions extends Omit<ViewOptions, "content"> {
  verticalAlign?: VERTICALALIGN;
  layoutArea?: Rectangle;
  underLine?: Rectangle;
  deleteLine?: Rectangle;
  selection?: Selection;
  fixedHeight?: Boolean;
  fixedWidth?: Boolean;
  shouldLayout?: Boolean;
  fixedIndex?: TextIndex;
  dynamicIndex?: TextIndex;
}

export type TextIndex = [number, number];

/**
 * 文本视图 - 专门处理Texts类型内容
 */
export default class TextView extends View {
  public readonly type: VIEWTYPE = VIEWTYPE.TEXSTVIEW;
  public children: View<any>[] = [];

  public content: TextParagraph[];
  public layoutArea: Rectangle | undefined;
  public underLine: Rectangle | undefined;
  public deleteLine: Rectangle | undefined;
  public selection: Selection;
  public fixedHeight: Boolean;
  public fixedWidth: Boolean;
  public shouldLayout: Boolean;
  public fixedIndex: TextIndex | undefined;
  public dynamicIndex: TextIndex | undefined;
  public verticalAlign: VERTICALALIGN = VERTICALALIGN.TOP;

  constructor(text: TextParagraph[], options: TextViewOptions = {}) {
    // 将text作为content传递给父类构造函数
    super({ ...options, content: text });
    this.content = text;

    // 初始化TextView特有的属性
    this.layoutArea = options?.layoutArea;
    this.underLine = options?.underLine;
    this.deleteLine = options?.deleteLine;
    this.selection = new Selection();
    this.fixedHeight = !!options?.fixedHeight;
    this.fixedWidth = !!options?.fixedWidth;
    this.shouldLayout = !!options?.shouldLayout;
    this.fixedIndex = options?.fixedIndex;
    this.dynamicIndex = options?.dynamicIndex;
    this.verticalAlign = options?.verticalAlign ?? VERTICALALIGN.TOP;

    // 如果设置了layoutArea，更新bounds
    if (this.layoutArea) {
      this.updateBoundsFromLayoutArea();
      // 执行布局
      this.layout();
      //计算包围盒
      this.initBoundingBox();
      this.initViewport();
      this.setSelection(this.fixedIndex, this.dynamicIndex);
    }
  }

  public renderContent(ctx: CanvasRenderingContext2D): void {
    // 渲染文本内容
    if (this.layoutArea) {
      this.layoutArea.render(ctx);
    }
    for (const paragraph of this.content) {
      paragraph.render(ctx);
    }

    // 渲染选择区域
    this.selection.render(ctx);
  }

  public interact(p: Point3): {
    view: View | null;
    content: ViewContent | ViewAddonImpl | null;
    extraData: ExtraData | null;
  } {
    if (!this.layoutArea) throw new Error("请在布局后交互");
    const relativePoint = world2Relative(p, this.matrix);
    const ctx = getGlobalCanvasContext()?.getBufferContext();
    if (!ctx) throw new Error("交互失败");

    const builder = new InteractionMapBuilder();

    const textElement = this.point2TextElement(p);
    if (textElement) {
      return builder.add(this, textElement, { action: Action.SELECT, cursorStyle: Cursor.Text }).build();
    }

    // 命中边界框（移动/缩放）
    if (this.actived && this.boundingBox) {
      const extraData = this.boundingBox.interact(relativePoint);
      if (extraData) {
        return builder.add(this, this.boundingBox, extraData).build();
      }
    }

    return builder.build();
  }

  /**
   * 处理输入事件
   */
  public input(e: InputEvent): void {}

  /**
   * 文本转换为TextIndex,p作为辅助判断是下一个还是当前
   */
  public element2Index(textElement: TextElement, p: Point3): TextIndex {
    const relativePoint = world2Relative(p, this.getWorldMatrix());
    for (const [i, p] of this.content.entries()) {
      for (const [j, t] of p.texts.entries()) {
        if (t === textElement) {
          const midPoint = textElement.controlPoints.reduce((pre: Point3, cur: Point3) =>
            PointUtils.midpoint(pre, cur)
          );
          const index: TextIndex = [i, j];
          if (relativePoint.x >= midPoint.x) {
            index[1]++;
          }
          return index;
        }
      }
    }
    return [0, 0];
  }

  /**
   * 根据点选中TextElement
   */
  private point2TextElement(p: Point3): TextElement | null {
    const relativePoint = world2Relative(p, this.getWorldMatrix());
    if (!this.layoutArea) return null;

    // 准确命中了某个段落
    const hitedParagraph = this.content.find((p: TextParagraph) => p.isPointInPath(relativePoint));
    if (hitedParagraph) {
      // 准确命中某个文字
      for (const t of hitedParagraph.texts) {
        const tb = t.getBounds();
        const tRect = new Rectangle(tb.x, tb.y, tb.width, tb.height);
        const hitText = tRect.isPointInPath(relativePoint);
        if (hitText) {
          return t;
        }
      }
    }
    const hitedLayout = this.layoutArea.isPointInPath(relativePoint);
    // 在命中（段落或者定位区域）的空白
    if (hitedParagraph || hitedLayout) {
      const texts = this.content.map((p) => p.texts).flat();
      const leftTop = texts.filter((b) => b.getBounds().x < relativePoint.x && b.getBounds().y < relativePoint.y);
      const rightBottom = texts.filter((b) => b.getBounds().x > relativePoint.x && b.getBounds().y > relativePoint.y);
      const leftBottom = texts.filter((b) => b.getBounds().x < relativePoint.x && b.getBounds().y > relativePoint.y);
      const rightTop = texts.filter((b) => b.getBounds().x > relativePoint.x && b.getBounds().y < relativePoint.y);
      // 找到leftBottom和rightTop中离relativePoint最近的textElement
      const leftBottomDistance = leftBottom.map((b) => {
        const center = b.getBounds().center;
        return PointUtils.distance(relativePoint, new Point3(center.x, center.y, 0));
      });
      const rightTopDistance = rightTop.map((b) => {
        const center = b.getBounds().center;
        return PointUtils.distance(relativePoint, new Point3(center.x, center.y, 0));
      });
      const minLeftBottomDistance = Math.min(...leftBottomDistance);
      const minRightTopDistance = Math.min(...rightTopDistance);
      const minLeftBottomIndex = leftBottomDistance.indexOf(minLeftBottomDistance);
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
    return null;
  }

  /**
   * 设置选择框
   */
  public setSelection(fixedIndex?: TextIndex | undefined, dynamicIndex?: TextIndex): void {
    const fixed = dynamicIndex ? fixedIndex : this.fixedIndex;
    const dynamic = dynamicIndex ?? fixedIndex;
    // 如果为undefined则表示未选中某一个序列，不出现光标
    if (!fixed || !dynamic) {
      this.selection.setSelectionBoxs([]);
      return;
    }

    const start =
      fixed[0] < dynamic[0] ? fixed : fixed[0] > dynamic[0] ? dynamic : fixed[1] < dynamic[1] ? fixed : dynamic;
    const end = start === fixed ? dynamic : fixed;

    // 获取范围内所有rect
    const boxs = [];
    for (let i = start[0]; i <= end[0]; i++) {
      const _start = i === start[0] ? start[1] : 0;
      const length = this.content[i].texts.length;
      const _end = i === end[0] ? Math.min(end[1], length) : length;
      for (let j = _start; j < _end; j++) {
        const bounds = this.content[i].texts[j].getBounds();
        const box = new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height);
        boxs.push(box);
      }
    }

    if (boxs.length === 0) {
      const [i, j] = start;
      const ts = this.content[i].texts;
      const len = ts.length;
      const lastText = ts[len - 1];
      const _text = lastText.copy();
      _text.controlPoints.forEach((p) => p.add(new Vector3(lastText.width, 0, 0)));
      const _texts = ts.map((t) => t.copy());
      _texts.push(_text);
      const preText = _texts[j - 1];
      const curText = _texts[j];
      //出现了换行，将光标放到上一行末尾
      if (preText && preText.controlPoints[0].y !== curText.controlPoints[0].y) {
        const bounds = preText.getBounds();
        const p = new Point3(bounds.x + bounds.width, bounds.y, 0);
        const width = 2;
        const box = new Rectangle(p.x, p.y, width, bounds.height);
        boxs.push(box);
      } else {
        const bounds = preText.getBounds();
        const width = 2;
        const box = new Rectangle(bounds.x, bounds.y, width, bounds.height);
        boxs.push(box);
      }
    }
    this.selection.setSelectionBoxs(boxs);
  }

  /**
   * 执行文本布局
   */
  private layout(): void {
    if (!this.content) {
      return;
    }
    if (!this.layoutArea) {
      console.warn("LayoutArea is not set, cannot perform layout");
      return;
    }

    // 执行深度优先搜索布局
    this.layoutParagrahs(this.content, this.layoutArea);
    this.shouldLayout = false;
  }

  private layoutParagrahs(paragraphs: TextParagraph[], layoutArea: Rectangle): void {
    // 从layoutArea左上角开始布局
    let currentY = layoutArea.getTopLeft().y;

    // 遍历所有段落进行布局
    for (const paragraph of paragraphs) {
      this.layoutParagraph(paragraph, layoutArea.getTopLeft().x, currentY, layoutArea.width);
      const paragraphBounds = paragraph.getBounds();
      currentY += paragraphBounds.height;
    }

    this.adjustParagraphVerticalAlignment(paragraphs, layoutArea);
  }

  /**
   * 布局TextParagraph - 处理单个段落
   */
  private layoutParagraph(paragraph: TextParagraph, startX: number, startY: number, maxWidth: number): void {
    // 计算基于首字符宽度的缩进
    const indentationWidth = this.calculateIndentationWidth(paragraph);

    // 考虑段落的前宽度，但不在这里加缩进
    const actualStartX = startX + paragraph.options.preWidth;
    const actualMaxWidth = maxWidth - paragraph.options.preWidth;

    const actualStartY = startY + paragraph.options.preHeight;

    // 布局段落内的所有TextElement，传递缩进信息
    this.layoutTextElementsInParagraph(paragraph, actualStartX, actualStartY, actualMaxWidth, indentationWidth);

    // 设置段落的布局状态（先设置位置，再调整对齐）
    paragraph.layout(new Point3(startX, startY, 0));

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
    indentationWidth: number = 0
  ): void {
    // 第一步：根据字体宽度进行分行
    const lines = this.breakTextIntoLines(paragraph, startX, maxWidth, indentationWidth);
    // 第二步：计算每行的行高和位置
    let currentY = startY;

    const lineHeight = Math.max(...lines.map((line) => this.calculateLineHeight(line, paragraph.options.leading)));

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      let currentX = line.startX;

      for (const textElement of line.elements) {
        const position = new Point3(currentX, currentY + lineHeight - textElement.height, 0);
        textElement.layout(position, lineHeight);

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
    indentationWidth: number = 0
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
   * 计算行的行高
   */
  private calculateLineHeight(line: { elements: TextElement[]; startX: number }, leading: number): number {
    if (line.elements.length === 0) {
      return 0;
    }

    // 找到该行中最大的字体大小
    const maxFontSize = Math.max(...line.elements.map((element) => element.options.size));

    // 行高 = 字体大小 * leading
    return maxFontSize * leading;
  }

  /**
   * 调整段落的水平对齐
   */
  private adjustParagraphHorizontalAlignment(paragraph: TextParagraph, maxWidth: number): void {
    const paragraphBounds = paragraph.getBounds();
    if (!paragraphBounds) return;

    let offsetX = 0;

    switch (paragraph.options.horizontalAlign) {
      case HORIZONTALALIGN.CENTER:
        offsetX = (maxWidth - paragraphBounds.width) / 2;
        break;
      case HORIZONTALALIGN.RIGHT:
        offsetX = maxWidth - paragraphBounds.width;
        break;
      case HORIZONTALALIGN.LEFT:
      default:
        offsetX = 0;
        break;
    }
    const offsetVector = new Vector3(offsetX, 0, 0);

    // 调整段落内所有TextElement的位置
    for (const textElement of paragraph.texts) {
      textElement.controlPoints[0].add(offsetVector);
      textElement.layout(textElement.controlPoints[0], textElement.lineHeight);
    }
  }

  /**
   * 调整Texts的垂直对齐
   */
  private adjustParagraphVerticalAlignment(paragraphs: TextParagraph[], layoutArea: Rectangle): void {
    const textsBounds = Bounds.union(...paragraphs.map((paragraph) => paragraph.getBounds()));
    if (!textsBounds) return;

    let offsetY = 0;
    switch (this.verticalAlign) {
      case VERTICALALIGN.MIDDLE:
        offsetY = (layoutArea.height - textsBounds.height) / 2;
        break;
      case VERTICALALIGN.BOTTOM:
        offsetY = layoutArea.height - textsBounds.height;
        break;
      case VERTICALALIGN.TOP:
      default:
        offsetY = 0;
        break;
    }

    if (offsetY === 0) return;

    const offsetVector = new Vector3(0, offsetY, 0);
    // 调整所有段落内文字元素的位置
    for (const paragraph of paragraphs) {
      for (const textElement of paragraph.texts) {
        textElement.layout(textElement.controlPoints[0].add(offsetVector), textElement.lineHeight);
      }
      offsetVector.add(new Vector3(0, paragraph.getBounds().height, 0));
    }
  }

  /**
   * 计算基于首字符宽度的缩进
   */
  private calculateIndentationWidth(paragraph: TextParagraph): number {
    if (paragraph.texts.length === 0) {
      return 0;
    }

    // 获取首字符
    const firstTextElement = paragraph.texts[0];

    const firstCharWidth = firstTextElement.width;

    // 根据段落选项中的indentation值（作为倍数）计算实际缩进宽度
    return firstCharWidth * paragraph.options.indentation;
  }

  // 1、供view初始化调用，再textView初始化最后会根据layoutArea更新包围盒和视口插件
  // 2、供视口裁剪判断调用
  public getContentBounds(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (this.layoutArea) {
      return this.layoutArea.getBounds();
    }
    return Bounds.empty();
  }

  /**
   * 设置布局区域并更新视口插件
   */
  public setLayoutArea(layoutArea: Rectangle): void {
    this.layoutArea = layoutArea;
    this.updateBoundsFromLayoutArea();
  }

  /**
   * 根据layoutArea更新bounds和视口插件
   */
  private updateBoundsFromLayoutArea(): void {
    if (this.layoutArea && this.boundingBox && this.viewport) {
      const bounds = this.layoutArea.getBounds();

      const viewWidth = Math.max(0, bounds.x + bounds.width);
      const viewHeight = Math.max(0, bounds.y + bounds.height);

      // 更新boundingBox的尺寸
      this.boundingBox.setSize(viewWidth, viewHeight);

      // 更新视口插件的尺寸
      this.viewport.width = viewWidth;
      this.viewport.height = viewHeight;
    }
  }

  public copy(): TextView {
    const newView = new TextView(this.content);

    // 复制基本属性
    newView.layer = this.layer;
    newView.id = this.id;
    newView.properties = { ...this.properties };
    newView.data = { ...this.data };
    newView.style = this.style.copy();
    newView.selected = this.selected;
    newView.actived = this.actived;
    newView.freezed = this.freezed;
    newView.visible = this.visible;
    newView.matrix = this.matrix.copy();

    // 复制TextView特有属性
    newView.layoutArea = this.layoutArea;
    newView.underLine = this.underLine;
    newView.deleteLine = this.deleteLine;
    newView.fixedHeight = this.fixedHeight;
    newView.fixedWidth = this.fixedWidth;
    newView.shouldLayout = this.shouldLayout;

    // 复制选择区域
    newView.selection = new Selection();
    newView.selection.setSelectionBoxs(this.selection.getSelectionBoxs());

    // 复制插件
    if (this.viewport) {
      newView.viewport = this.viewport.copy();
    }
    if (this.controlPoints) {
      newView.controlPoints = this.controlPoints.copy();
    }
    if (this.boundingBox) {
      newView.boundingBox = this.boundingBox.copy();
    }

    return newView;
  }
}
