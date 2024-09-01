import { v4 as uuid } from 'uuid'
import {
  CanvasNode,
  HorAlign,
  isTextNode,
  NodeType,
  Point,
  RenderTextOptions,
  Template,
  TextNode,
  unreachablePoint,
  VerAlign,
} from 'src/store/types/Template.type'

import {
  isPointInPath,
  computeActiveResizeRectPos,
  generateBoxPath,
  computePathByEdgeOffset,
  getLinesOfPath,
  computeIntersectionPoint,
  computeMagnitude,
} from 'utils/utils'
import ICanvasManage from './ICanvasManage'

import { BOX_RESPONSE, RESIZERECTSIZE_RESPONSE } from 'src/constants/CanvasEvent'
import { MouseOperation } from 'src/constants/CanvasEvent'
import TextOptionsManage from '../TextOptionsManage/TextOptionsManage'
import { emptyBox } from 'src/components/PrintTemplate/TextTemplate/builtIn'
import { BOXPADDING } from 'src/constants/CanvasRendering'

export default class CanvaseManage implements ICanvasManage {
  ctx: CanvasRenderingContext2D | null = null
  canvasEle: HTMLCanvasElement | null = null

  //相对于画布位置
  mousdownPoint: Point = unreachablePoint
  mouseupPoint: Point = unreachablePoint
  lastMousePoint: Point = unreachablePoint

  //鼠标操作符
  mouseOperation: MouseOperation = MouseOperation.NONE

  constructor(canvaElem: HTMLCanvasElement | null) {
    if (canvaElem) {
      this.canvasEle = canvaElem
      this.ctx = canvaElem.getContext('2d')
      if (this.ctx === null) {
        throw TypeError('Canvas 上下文获取失败')
      }
    }
  }

  pointInNode(point: Point, node: CanvasNode): boolean {
    return isPointInPath(point, node.structure.contentBox.path)
  }

  pointInNodeResizeBlock(point: Point, node: CanvasNode): boolean {
    return computeActiveResizeRectPos(
      computePathByEdgeOffset(node.structure.contentBox.path, BOXPADDING),
      RESIZERECTSIZE_RESPONSE,
    ).some((resizePoint) =>
      isPointInPath(
        point,
        generateBoxPath(resizePoint, {
          width: RESIZERECTSIZE_RESPONSE,
          height: RESIZERECTSIZE_RESPONSE,
        }),
      ),
    )
  }

  pointOnNodeBounding(point: Point, node: CanvasNode): boolean {
    return (
      this.pointInResponseArea(point, node) &&
      !this.pointInNode(point, node) &&
      !this.pointInNodeResizeBlock(point, node)
    )
  }

  pointInResponseArea(point: Point, node: CanvasNode): boolean {
    return isPointInPath(point, computePathByEdgeOffset(node.structure.contentBox.path, BOX_RESPONSE))
  }
  pointInTextContent(point: Point, node: TextNode): boolean {
    const location: Point = {
      x: node.structure.contentBox.location.x + node.options.contentBox.location.x,
      y: node.structure.contentBox.location.y + node.options.contentBox.location.y,
      w: 1,
    }
    return isPointInPath(point, generateBoxPath(location, node.options.contentBox.size))
  }

  /**
   * 调整文本节点
   */
  adjustTextNode = (node: TextNode, content: string) => {
    if (this.ctx) {
      const textOptionManage = new TextOptionsManage(this.ctx)
      node.options.rowsIndex = Array.from({ length: node.options.paragrahsIndex.length }, () => '0-0')

      //将所有段落合并成一行
      node.options = textOptionManage.combineRows(node.options)

      //重新计算样式结构
      node.options = textOptionManage.modifyOptionsSize(node.options, content)

      /** ------------------------------------------------------------------------
         *              //根据节点宽度调整options
         --------------------------------------------------------------------------*/
      node.options = textOptionManage.regulateOptions(node)

      //重新计算样式结构
      node.options = textOptionManage.modifyOptionsSize(node.options, content)

      //调整节点行高，随输入的变化而变化
      //当用户resize高度时isAdoptiveHeight会为false
      //当用户输入时如果节点高大于等于文本高度会为true
      if (node.options.isAdoptiveHeight) {
        const location = node.structure.contentBox.location
        const size = { ...node.structure.contentBox.size, height: node.options.contentBox.size.height }
        node.structure.contentBox = {
          location,
          size,
          path: generateBoxPath(location, size),
        }
      }

      /** ------------------------------------------------------------------------
         *              修改文本样式结构（根据节点尺寸，对齐方式）
         --------------------------------------------------------------------------*/
      node.options = textOptionManage.modifyTextContentLocation(node)

      /** ------------------------------------------------------------------------
         *              修改文本选择盒结构
         --------------------------------------------------------------------------*/

      node.options.selectionBoxes = textOptionManage.computeSelectionBoxes(node.options)
    }
  }

  /**
   * adjustTemplate 调整模板，根据节点信息和样式信息做适应性变化
   */
  adjustTemplate = (_template: Template): Template => {
    const template = structuredClone(_template)

    for (const node of template.nodeList) {
      if (isTextNode(node)) {
        //空白内容加没激活（双击过后没输入或者已有内容删除完后失活了）
        if (!template.templateData[node.propName] && !node.isActive) {
          //删除节点
          template.nodeList = template.nodeList.filter((n) => n != node)
          //加入操作栈

          //不调整当前节点
          continue
        }
        //要调整的条件过多，宽度，对齐方式等
        this.adjustTextNode(node, template.templateData[node.propName])
      }
    }
    return template
  }

  creatEmptyTextNode(location: Point, layer: number, fontSize: number): TextNode {
    const size = { height: fontSize * 1.2, width: fontSize * 12 }
    const path = generateBoxPath(location, size)
    return {
      componentId: '0001-002', //正文文本组件
      instanceId: uuid(),
      isActive: true,
      structure: {
        contentBox: {
          location,
          size,
          path,
        },
      },
      layer,
      type: NodeType.TEXT,
      options: {
        paragrahsIndex: ['0-0'],
        rowsIndex: ['0-0'],
        paragrahs: {
          '0-0': {
            rows: {
              '0-0': {
                font: {
                  '0-0': {
                    fontFamily: 'Arial',
                    fontWeight: 'normal',
                    fontSize,
                    italicly: false,
                    underLine: false,
                    color: 0x000000,
                    characterWidth: [],
                    letterSpace: 0,
                  },
                },
                contentBox: emptyBox(),
                rowIndex: 0,
              },
            },
            contentBox: emptyBox(),
            preGap: 0,
            paragrahIndex: 0,
            postGap: 0,
          },
        },
        isAdoptiveHeight: true,
        selection: '0-0',
        minContentWidth: Infinity,
        selectionBoxes: [],
        align: {
          vertical: VerAlign.MIDDLE,
          horizontal: HorAlign.LEFT,
        },
        contentBox: emptyBox(),
        Leading: 1,
      } as RenderTextOptions,
      propName: `prop${layer}`,
    } as TextNode
  }
  createEmptyNode(location: Point): CanvasNode {
    const layer = 7729
    const size = { height: 0, width: 0 }
    const path = generateBoxPath(location, size)
    return {
      componentId: '7729-7729',
      instanceId: uuid(),
      isActive: true,
      structure: {
        contentBox: {
          location,
          size,
          path,
        },
      },
      layer,
      type: NodeType.EMPTY,
      propName: `prop${layer}`,
    }
  }
  computeInterpointBetweenNodes(node1: CanvasNode, node2: CanvasNode): Point {
    const node1Lines = getLinesOfPath(node1.structure.contentBox.path)
    const node2Lines = getLinesOfPath(node2.structure.contentBox.path)
    const interpoint = unreachablePoint

    for (const node1Line of node1Lines) {
      for (const node2Line of node2Lines) {
        const inter = computeIntersectionPoint(node1Line, node2Line)

        const l1 = computeMagnitude({
          x: node1Line[0].x - node1Line[1].x,
          y: node1Line[0].y - node1Line[1].y,
          w: 0,
        })
        const l2 = computeMagnitude({
          x: node2Line[0].x - node2Line[1].x,
          y: node2Line[0].y - node2Line[1].y,
          w: 0,
        })
        const v1 = computeMagnitude({
          x: inter.x - node1Line[0].x,
          y: inter.y - node1Line[0].y,
          w: 0,
        })
        const v2 = computeMagnitude({
          x: inter.x - node1Line[1].x,
          y: inter.y - node1Line[1].y,
          w: 0,
        })
        const v3 = computeMagnitude({
          x: inter.x - node2Line[0].x,
          y: inter.y - node2Line[0].y,
          w: 0,
        })
        const v4 = computeMagnitude({
          x: inter.x - node2Line[1].x,
          y: inter.y - node2Line[1].y,
          w: 0,
        })

        if (v1 + v2 === l1 && v3 + v4 === l2) {
          return inter
        }
      }
    }

    return interpoint
  }
}
