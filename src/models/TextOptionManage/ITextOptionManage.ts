import { CanvasNode, Point, Size, FontOptions, Selection } from 'src/store/types/Template.type'
import { SelectionObj } from '../SelectionManage/ISelectionManage'
import { ArrowKeys, ComposingArrowKeys } from 'src/constants'

export default interface ITextOptionManage {
  node: CanvasNode
  content: string
  ctx: CanvasRenderingContext2D
  /**
   * 文本坐标到文字索引
   * @param locationInTC 相对于文本坐标
   */
  relativeLocation2Index(locationInTC: Point): number
  /**
   * 文本坐标到行索引
   * @param locationInTC 相对于文本坐标
   */
  relativeLocation2PIndex(locationInTC: Point): number
  /**
   * 索引到相对于文本坐标
   * @param selection 文字索引
   * @description 所表示文字的字体盒子左上角点
   * 修改index参数为selection，如果是单一的index会出现换行时的歧义
   */
  selection2RelativeLocation(selection: Selection): Point[]
  /**
   * 根据字体信息计算每个字符的占据宽度
   * @description 默认字符间距为字体宽度的1.2倍，占据宽度的1/6评分至两侧
   */
  computeCharacterWidth(character: string, fontOptions: FontOptions): number
  /**
   *  修改行盒和段落盒的尺寸
   */
  modifyTextContenSize?(): Size
  /**
   * 根据对齐方式修改行盒和段落盒的相对坐标
   */
  modifyOptionsLocation(): void
  /**
   * 根据selection计算选择盒
   */
  modifySelectionBoxes(): void

  combineParagrahs?(): void
  combineRows?(): void
  combineFonts?(): void

  /**
   * 根据节点信息调整样式信息
   */
  regulateOptions(): void
  getLastFontIndex(): number
  getFontOptionByindex(index: number): FontOptions | undefined
  modifyOptionsSize(): void
  setNodeStructure(structure: CanvasNode['structure']['contentBox']): void
  isSelectAll(selObj: SelectionObj): boolean
  getArrowCursorSelection(arrowKeys: ArrowKeys | ComposingArrowKeys, direction: number): SelectionObj
  modifyOptions(oldSelection: SelectionObj, input: string): void
}
