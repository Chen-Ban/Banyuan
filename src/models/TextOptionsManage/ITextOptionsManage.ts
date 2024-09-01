import { Point, FontOptions, Selection, Range, RenderTextOptions, Box, TextNode } from 'src/store/types/Template.type'
import { SelectionObj } from '../SelectionManage/ISelectionManage'
import { ArrowKeys, ComposingArrowKeys } from 'src/constants/CanvasEvent'

export default interface ITextNodeManage {
  /**
   * 文本坐标到文字索引
   * @param locationInTC 相对于文本坐标
   */
  relativeLocation2Index(node: TextNode, locationInTC: Point): number
  /**
   * 文本坐标到行索引
   * @param locationInTC 相对于文本坐标
   */
  relativeLocation2PIndex(node: TextNode, locationInTC: Point): number
  /**
   * 索引到相对于文本坐标
   * @param selection 文字索引
   * @description 所表示文字的字体盒子左上角点
   * 修改index参数为selection，如果是单一的index会出现换行时的歧义
   */
  selection2RelativeLocation(options: RenderTextOptions, selection: Selection): Point[]
  /**
   * 根据字体信息计算每个字符的占据宽度
   * @description 默认字符间距为字体宽度的1.2倍，占据宽度的1/6评分至两侧
   */
  computeCharacterWidth(character: string, fontOptions: FontOptions): number
  /**
   * 根据对齐方式修改行盒和段落盒的相对坐标
   */
  modifyTextContentLocation(node: TextNode): RenderTextOptions
  /**
   * 根据selection计算选择盒
   */
  computeSelectionBoxes(options: RenderTextOptions): Box[]
  /**
   * 将每个段落数据变成一行
   */
  combineRows(options: RenderTextOptions): RenderTextOptions
  /**
   * 根据节点信息调整样式信息(将越界的文本向下调整)
   */
  regulateOptions(node: TextNode): RenderTextOptions
  /**
   * 获取最后一个文字的字体信息
   */
  getLastFontIndex(options: RenderTextOptions): number
  /**
   * 获取指定索引的字体信息
   * @param index 文字索引
   */
  getFontOptionByindex(options: RenderTextOptions, index: number): FontOptions | undefined
  /**
   * 重新计算所有文字的宽高，进行排版，获取最小宽度，修改文本内容尺寸
   */
  modifyOptionsSize(options: RenderTextOptions, content: string): RenderTextOptions
  /**
   * 获取选取
   * @param arrowKeys 方向键
   * @param direction 选择方向
   */
  getArrowCursorSelection(
    options: RenderTextOptions,
    arrowKeys: ArrowKeys | ComposingArrowKeys,
    direction: number,
  ): SelectionObj
  /**
   * 根据输入替换选区的内容，并且更新样式
   * @param oldSelection 选区
   * @param input 替换选区的内容
   */
  modifyOptions(options: RenderTextOptions, oldSelection: SelectionObj, input: string): void
  /**
   * 合并后的字体Range
   * @param preRange 字体Range
   * @param curRange 字体Range
   */
  mergeRange(preRange: Range<FontOptions>, curRange: Range<FontOptions>): Range<FontOptions>
  /**
   * 从某个索引处断开，选取情况先用modifyOptions处理了再断开，用户分段
   * @param options 文字样式
   * @param index 文本索引
   */
  breakOptions(options: RenderTextOptions, index: number): void
}
