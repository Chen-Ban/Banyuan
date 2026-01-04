import View, { ViewOptions, ViewContent } from "../View";
import TextParagraph, { TextParagraphContent } from "../../graph/text/TextParagraph";
import TextElement, { NonPrintableTextElement, PrintableTextElement } from "../../graph/text/TextElement";
import TextOptions from "../../graph/text/TextOptions";
import { Rectangle } from "../../graph/combined/Polygon";
import { Point3, Vector3 } from "../../math";
import { world2Relative } from "@/utils/utils";
import { getGlobalCanvasContext } from "../../renderer/CanvasContext";
import { ViewAddonImpl, InteractionMapBuilder } from "../addon";
import Selection, { TextIndex } from "./Selection";
import { HORIZONTALALIGN, VERTICALALIGN, VIEWTYPE } from "@/core/constants";
import { Action, Cursor, ExtraData } from "../addon/InteractionMapBuilder";
import Bounds from "../../graph/base/Bounds";
import { isNonPrintableTextElement } from "../../graph/text/TextElement";

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

/**
 * 文本视图 - 专门处理Texts类型内容
 */
export default class TextView extends View {
  public readonly type: VIEWTYPE = VIEWTYPE.TEXTVIEW;
  public children: View<any>[] = [];

  public content: TextParagraph[];
  public layoutArea: Rectangle | undefined;
  public underLine: Rectangle | undefined;
  public deleteLine: Rectangle | undefined;
  public selection: Selection;
  public fixedHeight: Boolean;
  public fixedWidth: Boolean;
  public shouldLayout: Boolean;
  public verticalAlign: VERTICALALIGN = VERTICALALIGN.TOP;

  constructor(text: TextParagraph[], options: TextViewOptions = {}) {
    // 将text作为content传递给父类构造函数
    super({ ...options, content: text });
    this.content = text;

    // 初始化TextView特有的属性
    this.layoutArea = options?.layoutArea;
    this.underLine = options?.underLine;
    this.deleteLine = options?.deleteLine;
    this.selection = new Selection(options?.fixedIndex, options?.dynamicIndex);
    this.fixedHeight = !!options?.fixedHeight;
    this.fixedWidth = !!options?.fixedWidth;
    this.shouldLayout = !!options?.shouldLayout;
    this.verticalAlign = options?.verticalAlign ?? VERTICALALIGN.TOP;

    // 如果设置了layoutArea，更新bounds
    if (this.layoutArea) {
      this.updateBoundsFromLayoutArea();
      // 执行布局
      this.layout();
      //计算包围盒
      this.initBoundingBox();
      this.initViewport();
      this.setSelection(this.selection.fixedIndex, this.selection.dynamicIndex);
    }
  }

  public getContentText(): string[] {
    return this.content.map((paragraph) => paragraph.texts.map((text) => text.content).join(""));
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

  /**
   * 将超出段落区域的点约束到段落区域内
   * @param p 相对坐标点
   * @returns 约束后的相对坐标点
   */
  public constraintPoint(p: Point3): Point3 {
    const paragraRects = this.content
      .map((paragraph) => paragraph.getBounds())
      .map((bounds) => new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height));
    if (paragraRects.length === 0) return p;
    const closets = paragraRects.map((rect) => rect.getClosestPoint(p));
    const minDistance = Math.min(...closets.map((closet) => closet.distance));
    return closets.find((closet) => closet.distance === minDistance)!.closestPoint;
  }

  public resize(fixedIndex: number, dynamicIndex: number, vector: Vector3): void {
    const fixedPoint = this.boundingBox?.handles[fixedIndex].getCenter();
    const dynamicPoint = this.boundingBox?.handles[dynamicIndex].getCenter() ;
    if(!fixedPoint || !dynamicPoint) throw new Error("固定点或动态点不存在");
    this.content.forEach(paragraph=>{
      paragraph.resize(fixedPoint, dynamicPoint, vector);
    })  
    this.shouldLayout = true;
    this.layout();
    this.initBoundingBox();
    this.initViewport();
  }

  /**
   * 容器交互接口
   * @param p 世界坐标点
   * @param needConstraint 是否需要约束
   * @returns {
   *   view: View | null;
   *   content: ViewContent | ViewAddonImpl | null;
   *   extraData: ExtraData | null;
   * }
   */
  public interact(
    p: Point3,
    needConstraint: boolean = false
  ): {
    view: View | null;
    content: ViewContent | ViewAddonImpl | null;
    extraData: ExtraData | null;
  } {
    if (!this.layoutArea) throw new Error("请在布局后交互");
    const relativePoint = world2Relative(p, this.getWorldMatrix());
    const ctx = getGlobalCanvasContext()?.getBufferContext();
    if (!ctx) throw new Error("交互失败");

    const builder = new InteractionMapBuilder();

    // 是否命中段落
    const hitedParagraph = this.content.some(
      (paragraph) => paragraph.isPointInPath(relativePoint) || paragraph.isPointOnCurve(relativePoint)
    );
    // 只有命中外部且需要约束时才约束
    const textElement = this.point2TextElement(relativePoint, needConstraint && !hitedParagraph);
    if (textElement) {
      return builder.add(this, [textElement], { action: Action.SELECTION, cursorStyle: Cursor.Text }).build();
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

  private getTextOptionsByIndex(paragraph: TextParagraph, insertIndex: number): TextOptions {
    let textOptions: TextOptions;

    if (insertIndex > 0 && paragraph.texts[insertIndex - 1]) {
      // 使用前一个文本元素的选项
      textOptions = paragraph.texts[insertIndex - 1].options.copy();
    } else if (paragraph.texts.length === 0) {
      // 使用第一个文本元素的选项
      textOptions = paragraph.texts[0].options.copy();
    } else {
      // 使用默认选项
      textOptions = TextOptions.DEFAULT;
    }
    return textOptions;
  }

  /**
   * 处理输入事件
   * @param content 输入的文本内容
   * @param isComposition 是否是合成输入（中文输入法等）
   * @description 完整流程：删除选中范围->插入新文本->重新布局->设置selection
   * @description 如果isComposition为true，则selection包含输入的内容，否则selection不包含输入的内容，置于输入内容的结束位置
   */
  public input(content: string, isComposition: boolean): void {
    // 没有选中文本内容，不进行输入
    if (!this.selection.isSelection || content.length === 0) return;

    let insertIndex: TextIndex | undefined;

    // 如果有选中范围，先删除选中内容
    if (!this.selection.isCursor()) {
      // 删除选中范围，获取新的插入位置索引
      insertIndex = this.deleteSelection();
    } else {
      // 使用当前光标位置作为插入位置
      const [startIndex] = this.selection.toDirectionlessIndex();
      insertIndex = startIndex;
    }

    if (!insertIndex) return;
    const [paragraphIndex, textIndex, position] = insertIndex;
    const paragraph = this.content[paragraphIndex];
    const textInsertIndex = textIndex + position;

    const textOptions = this.getTextOptionsByIndex(paragraph, textInsertIndex);

    paragraph.addText(content, textInsertIndex, textOptions);

    // 重新布局
    this.shouldLayout = true;
    this.layout();
    this.initBoundingBox();
    this.initViewport();

    // 更新光标位置（布局后设置selection，因为selectionBoxs依赖于文字的包围盒）
    if (isComposition) {
      // 合成输入时：fixedIndex 保持不变，dynamicIndex 根据输入长度动态更新
      const newDynamicIndex: TextIndex = [paragraphIndex, textInsertIndex + content.length, 0];
      this.setSelection(insertIndex, newDynamicIndex);
    } else {
      // 非合成输入时：fixedIndex 和 dynamicIndex 都更新到插入文本的末尾
      const newCursorIndex = textInsertIndex + content.length;
      const newIndex: TextIndex = [paragraphIndex, newCursorIndex, 0];
      this.setSelection(newIndex, [...newIndex]);
    }
  }

  /**
   * 删除文本
   * @param isBackspace true 表示 Backspace（删除光标前），false 表示 Delete（删除光标后）
   */
  public delete(isBackspace: boolean): void {
    if (!this.selection.isSelection) return;

    let newIndex: TextIndex | undefined;

    if (!this.selection.isCursor()) {
      // 有选中范围，删除选中范围
      newIndex = this.deleteSelection();
    } else {
      // 没有选中范围，删除光标位置的字符
      newIndex = this.deleteAtCursor(isBackspace);
    }

    // 重新布局
    this.shouldLayout = true;
    this.layout();
    this.initBoundingBox();
    this.initViewport();

    // 布局后设置selection（因为selectionBoxs依赖于文字的包围盒）
    if (newIndex) {
      this.setSelection(newIndex, [...newIndex]);
    }
  }

  /**
   * 删除选中范围的文本（可能跨段落）
   * @returns 删除后的新光标位置索引，如果删除失败则返回undefined
   * @description 只修改文本内容，不设置selection，不更新布局
   */
  private deleteSelection(): TextIndex | undefined {
    if (!this.selection.isSelection) return undefined;

    // 使用 toDirectionlessIndex 转换为无方向的索引
    const [startIndex, endIndex] = this.selection.toDirectionlessIndex();

    if (!startIndex || !endIndex) return undefined;

    const [startPara, startText, startPos] = startIndex;
    const [endPara, endText, endPos] = endIndex;

    const startParagraphIndex = startPara;
    const startTextIndex = startText + startPos;
    const endParagraphIndex = endPara;
    const endTextIndex = endText + endPos;

    if (startParagraphIndex === endParagraphIndex) {
      // 同一段落内删除
      const paragraph = this.content[startParagraphIndex];
      if (!paragraph) return undefined;

      const deleteCount = endTextIndex - startTextIndex;
      paragraph.texts.splice(startTextIndex, deleteCount);

      // 返回新的光标位置索引
      return [startParagraphIndex, startTextIndex, 0];
    } else {
      // 跨段落删除
      const startParagraph = this.content[startParagraphIndex];
      const endParagraph = this.content[endParagraphIndex];
      if (!startParagraph || !endParagraph) return undefined;

      // 删除起始段落中从起始位置到末尾的内容
      const startDeleteCount = startParagraph.texts.length - startTextIndex;
      startParagraph.texts.splice(startTextIndex, startDeleteCount);

      // 删除结束段落中从开头到结束位置的内容
      const endDeleteCount = endTextIndex;
      endParagraph.texts.splice(0, endDeleteCount);

      // 将结束段落剩余的内容合并到起始段落
      if (endParagraph.texts.length > 0) {
        startParagraph.texts.push(...endParagraph.texts);
      }

      // 删除中间的所有段落和结束段落
      const paragraphsToDelete = endParagraphIndex - startParagraphIndex;
      this.content.splice(startParagraphIndex + 1, paragraphsToDelete);

      // 返回新的光标位置索引
      return [startParagraphIndex, startText, startPos];
    }
  }

  /**
   * 删除光标位置的字符
   * @param isBackspace true 表示 Backspace（删除光标前），false 表示 Delete（删除光标后）
   * @returns 删除后的新光标位置索引，如果删除失败则返回undefined
   * @description 只修改文本内容，不设置selection，不更新布局
   */
  private deleteAtCursor(isBackspace: boolean): TextIndex | undefined {
    if (!this.selection.fixedIndex) return undefined;
    const [fixedParagraphIndex, fixedTextIndex, fixedPosition] = this.selection.fixedIndex;
    const cursorIndex = fixedTextIndex + fixedPosition;
    const paragraph = this.content[fixedParagraphIndex];
    if (!paragraph) return undefined;

    if (isBackspace) {
      // Backspace：删除光标前的字符
      if (cursorIndex > 0) {
        // 删除光标前的一个字符
        paragraph.texts.splice(cursorIndex - 1, 1);

        // 返回新的光标位置索引
        return [fixedParagraphIndex, cursorIndex - 1, 0];
      } else {
        // 光标在段落开头，尝试合并到上一个段落
        if (fixedParagraphIndex > 0) {
          const prevParagraph = this.content[fixedParagraphIndex - 1];
          const currentParagraph = paragraph;
          const prevTextCount = prevParagraph.texts.length;
          prevParagraph.texts = prevParagraph.texts.slice(0, -1).concat(currentParagraph.texts) as TextParagraphContent;

          // 删除当前段落
          this.content.splice(fixedParagraphIndex, 1);

          // 返回新的光标位置索引
          return [fixedParagraphIndex - 1, prevTextCount, 0];
        } else {
          // 已经是第一个段落，无法删除
          return undefined;
        }
      }
    } else {
      // Delete：删除光标后的字符
      if (cursorIndex < paragraph.length) {
        // 删除光标后的一个字符
        paragraph.texts.splice(cursorIndex, 1);

        // 返回新的光标位置索引（光标位置保持不变）
        return [fixedParagraphIndex, cursorIndex, 0];
      } else {
        // 光标在段落末尾，尝试合并下一个段落
        if (fixedParagraphIndex < this.content.length - 1) {
          const currentParagraph = paragraph;
          const nextParagraph = this.content[fixedParagraphIndex + 1];
          const currentTextCount = currentParagraph.texts.length;

          // 将下一个段落的内容合并到当前段落
          currentParagraph.texts = currentParagraph.texts
            .slice(0, -1)
            .concat(nextParagraph.texts) as TextParagraphContent;

          // 删除下一个段落
          this.content.splice(fixedParagraphIndex + 1, 1);

          // 返回新的光标位置索引（光标位置保持不变）
          return [fixedParagraphIndex, cursorIndex, 0];
        } else {
          // 已经是最后一个段落，无法删除
          return undefined;
        }
      }
    }
  }

  /**
   * 换行（创建新段落）
   */
  public newLine(): void {
    const [startIndex] = this.selection.toDirectionlessIndex();
    if (!startIndex) return;

    const [paragraphIndex, textIndex, position] = startIndex;
    const splitIndex = textIndex + position;
    const paragraph = this.content[paragraphIndex];
    if (!paragraph) return;

    // 获取当前段落的选项和样式
    const paragraphOptions = paragraph.options.copy();
    const paragraphStyle = paragraph.style;

    // 创建新段落，包含分割点后的内容
    const newParagraph = new TextParagraph([new NonPrintableTextElement()], paragraphOptions, paragraphStyle);
    if (splitIndex < paragraph.texts.length) {
      // 将分割点后的文本移动到新段落
      const textsToMove = paragraph.texts.splice(splitIndex).filter((text) => text instanceof PrintableTextElement);
      paragraph.texts.push(new NonPrintableTextElement());
      newParagraph.texts.splice(0, 0, ...textsToMove);
    }

    // 插入新段落到内容数组
    this.content.splice(paragraphIndex + 1, 0, newParagraph);

    // 重新布局
    this.shouldLayout = true;
    this.layout();
    this.initBoundingBox();
    this.initViewport();

    // 布局后设置selection（因为selectionBoxs依赖于文字的包围盒）
    const newIndex: TextIndex = [paragraphIndex + 1, 0, 0];
    this.setSelection(newIndex, [...newIndex]);
  }

  /**
   * 文本转换为TextIndex,p作为辅助判断是下一个还是当前
   * @param textElement 文本元素
   * @param p 世界坐标点
   */
  public element2Index(textElement: TextElement, p: Point3): TextIndex {
    const relativePoint = world2Relative(p, this.getWorldMatrix());
    const bounds = textElement.getBounds();

    for (const [i, p] of this.content.entries()) {
      for (const [j, t] of p.texts.entries()) {
        if (t === textElement) {
          const midPoint = new Point3(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, 0);
          const index: TextIndex = [i, j, 0];
          if (relativePoint.x >= midPoint.x) {
            index[2] = 1;
          }
          if (isNonPrintableTextElement(t)) {
            index[1] -= 1;
          }
          return index;
        }
      }
    }
    return [0, 0, 0];
  }

  /**
   * 根据点选中TextElement
   * @param p 相对坐标
   * @param needConstraint 是否需要约束到段落的边界上
   */
  private point2TextElement(p: Point3, needConstraint: Boolean = false): TextElement | null {
    if (!this.layoutArea) return null;
    // 需不需要约束点
    const relativePoint = needConstraint ? this.constraintPoint(p) : p;

    const hitedParagraph = this.content.find(
      (paragraph: TextParagraph) => paragraph.isPointInPath(relativePoint) || paragraph.isPointOnCurve(relativePoint)
    );
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
      const hitedTextElement = this.probeTextElement(hitedParagraph.texts, relativePoint);
      return hitedTextElement;
    }
    // 未命中段落，命中布局区域
    const hitedLayoutArea =
      this.layoutArea.isPointInPath(relativePoint) || this.layoutArea.isPointOnCurve(relativePoint);
    if (hitedLayoutArea) {
      return this.probeTextElement(
        this.content.flatMap((paragraph) => paragraph.texts),
        relativePoint
      );
    }
    return null;
  }

  /**
   * 探测文本元素（优先级：左上、右下、左下、右上）
   * @param textElements 需要探测的文本元素数组
   * @param p 相对坐标点
   * @returns 命中文本元素
   */
  private probeTextElement(textElements: TextElement[], p: Point3): TextElement {
    const leftTop = textElements.filter((b) => {
      const bounds = b.getBounds();
      return bounds.x < p.x && bounds.y < p.y;
    });
    const rightTop = textElements.filter((b) => {
      const bounds = b.getBounds();
      return bounds.x + bounds.width > p.x && bounds.y + bounds.height < p.y;
    });

    const rightBottom = textElements.filter((b) => {
      const bounds = b.getBounds();
      return bounds.x + bounds.width > p.x && bounds.y + bounds.height > p.y;
    });
    const leftBottom = textElements.filter((b) => {
      const bounds = b.getBounds();
      return bounds.x < p.x && bounds.y + bounds.height > p.y;
    });

    // 找到leftBottom和rightTop中离relativePoint最近的textElement
    const leftBottomDistance = leftBottom.map((b) => {
      const center = Rectangle.fromBounds(b.getBounds()).getCenter();
      return p.distance(new Point3(center.x, center.y, 0));
    });
    const rightTopDistance = rightTop.map((b) => {
      const center = Rectangle.fromBounds(b.getBounds()).getCenter();
      return p.distance(new Point3(center.x, center.y, 0));
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

  /**
   * 设置选择框
   * @param fixedIndex 固定光标,当第二个为undefined时，代表动态光标
   * @param dynamicIndex 动态光标
   * @description 两个都为undefined时，不出现光标
   */
  public setSelection(fixedIndex: TextIndex | undefined, dynamicIndex: TextIndex | undefined): void {
    const [start, end] = Selection.toDirectionlessIndex(fixedIndex, dynamicIndex);
    if (!start || !end) {
      this.selection.setSelectionBoxs([]);
      return;
    }

    const boxs = [];
    // 选中光标
    if (Selection.isCursor(start, end)) {
      const textElement = this.content[start[0]].texts[start[1]];
      const bounds = textElement.getBounds();
      const x = start[2] === 0 ? bounds.x - 2 : bounds.x + bounds.width;
      boxs.push(new Rectangle(x, bounds.y, 2, bounds.height));
    } else {
      if (start[2] === 1) {
        start[1]++;
        start[2] = 0;
      }
      if (end[2] === 1) {
        end[1]++;
        end[2] = 0;
      }
      const startPriorityNum = Number(start.join(""));
      const endPriorityNum = Number(end.join(""));

      // 获取范围内所有rect(范围选中)
      for (const [i, paragraph] of this.content.entries()) {
        for (const [j, textElement] of paragraph.texts.entries()) {
          const curPriorityNum = Number([i, j, 0].join(""));
          if (curPriorityNum >= startPriorityNum && curPriorityNum < endPriorityNum) {
            const bounds = textElement.getBounds();
            boxs.push(new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height));
          }
        }
      }
    }
    this.selection.setSelectionBoxs(boxs);

    this.selection.fixedIndex = fixedIndex;
    this.selection.dynamicIndex = dynamicIndex;
  }

  //---------------------------------------------------------------------//
  //--------------------------------布局---------------------------------//
  //--------------------------------------------------------------------//
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

    // 布局结束后，将 layoutArea 大小设置成段落包围盒的并集
    this.updateLayoutAreaFromParagraphs();

    this.shouldLayout = false;
  }

  /**
   * 根据所有段落的包围盒更新 layoutArea 的大小和位置
   */
  private updateLayoutAreaFromParagraphs(): void {
    if (!this.layoutArea || this.content.length === 0) return;

    // 获取所有段落的包围盒
    const paragraphBounds = this.content.map((paragraph) => paragraph.getBounds());

    // 计算所有段落包围盒的并集
    const unionBounds = Bounds.union(...paragraphBounds);

    // 更新 layoutArea 的位置和大小（使用并集的位置和大小）
    // 这样 layoutArea 会完全包含所有段落内容
    // TODO: 需要根据固定宽度或高度来更新 layoutArea 的大小，需同步修改交互逻辑
    this.layoutArea.setPosition(unionBounds.x, unionBounds.y);
    const width = unionBounds.width;
    const height = unionBounds.height;
    this.layoutArea.setSize(width, height);
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

    // 考虑段落的前宽度，但不在这里加缩进(因为只有第一行有缩进)
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
    newView.selection = new Selection(this.selection.fixedIndex, this.selection.dynamicIndex);

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

export function isTextView(view: any): view is TextView {
  return view instanceof TextView;
}