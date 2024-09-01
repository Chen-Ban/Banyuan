import { CanvasNode, Point, Template, TextNode } from 'src/store/types/Template.type'
import { MouseOperation } from 'src/constants/CanvasEvent'
export type CanvasEleProps = {
  adsorption: boolean
  referenceLine: {
    lineWidth: number
    color: string
    gap: number
  }
  backgroundColor: string
  width: number
  height: number
}

export const canvasElePros: CanvasEleProps = {
  width: 522,
  height: 700,
  backgroundColor: 'rgba(223, 249, 251,0.2)',
  adsorption: true,
  referenceLine: {
    lineWidth: 1,
    color: `rgba(240,240,240,0.5)`,
    gap: 30,
  },
}
export default interface ICanvasManage {
  canvasEle: HTMLCanvasElement | null
  ctx: CanvasRenderingContext2D | null

  mousdownPoint: Point
  mouseupPoint: Point
  lastMousePoint: Point

  mouseOperation: MouseOperation

  pointInNode(point: Point, node: CanvasNode): boolean
  pointOnNodeBounding(point: Point, node: CanvasNode): boolean
  pointInNodeResizeBlock(point: Point, node: CanvasNode): boolean
  pointInResponseArea(point: Point, node: CanvasNode): boolean
  pointInTextContent(point: Point, node: TextNode): boolean

  computeInterpointBetweenNodes(node1: CanvasNode, node2: CanvasNode): Point

  adjustTextNode(node: TextNode, content: string): void
  adjustTemplate(_template: Template): Template

  creatEmptyTextNode(location: Point, layer: number, fontSize: number): TextNode
  createEmptyNode(location: Point): CanvasNode
}
