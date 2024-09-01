import { useCallback, useEffect, useRef } from 'react'

import {
  Template,
  RenderTextOptions,
  Path,
  Selection,
  TextNode,
  isTextNode,
  isEmptyNode,
  EmptyNode,
} from 'store/types/Template.type'

import { TemplateData } from '../store/types/TemplateData.type'

import { parseColor, shouuldAnimation, computeActiveResizeRectPos, computePathByEdgeOffset } from 'utils/utils'

import { BOX_RESPONSE, RESIZERECTSIZE_RESPONSE } from 'src/constants/CanvasEvent'
import { BOXMARGIN, BOXPADDING, RESIZERECTSIZE } from 'constants/CanvasRendering'

import { CanvasEleProps } from 'models/CanvasManage/ICanvasManage'
import SelectionManage from 'src/models/SelectionManage/SelectionManage'

export default function usePrinter(
  ctx: CanvasRenderingContext2D | undefined | null,
  template: Template | undefined,
  canvasEleProps: CanvasEleProps,
) {
  const animationFrameIdRef = useRef<number | undefined>()
  /***
   * 绘制包含块缩放块
   * @param {Path} boundingBoxPath:包围盒路径
   */
  const renderActiveResizeRect = useCallback(
    (boundingBoxPath: Path) => {
      if (ctx) {
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 2
        ctx.strokeStyle = 'black'
        ctx.setLineDash([])
        const resizeRectPositions = computeActiveResizeRectPos(boundingBoxPath, RESIZERECTSIZE)

        for (const resizeRectPos of resizeRectPositions) {
          ctx.strokeRect(resizeRectPos.x, resizeRectPos.y, RESIZERECTSIZE, RESIZERECTSIZE)
        }

        const responseResizeRectPositions = computeActiveResizeRectPos(boundingBoxPath, RESIZERECTSIZE_RESPONSE)

        for (const resizeRectPos of responseResizeRectPositions) {
          ctx.strokeRect(resizeRectPos.x, resizeRectPos.y, RESIZERECTSIZE_RESPONSE, RESIZERECTSIZE_RESPONSE)
        }
      }
    },
    [ctx],
  )
  /**
   * 绘制文本的selection
   * @param {CanvasNode} node：文本节点
   */
  const blinkingCursorflag = useRef<boolean>(false)
  const lastBlinkingCursor = useRef<number>(Date.now())
  const renderSelection = useCallback(
    (node: TextNode) => {
      const { selection, selectionBoxes } = node.options
      if (ctx && selectionBoxes.length != 0) {
        //渲染的是光标
        if (SelectionManage.isZeroSelection(SelectionManage.parseSelection(selection))) {
          const now = Date.now()
          //当和上次渲染超过200ms时

          if (blinkingCursorflag.current) {
            ctx.save()
            ctx.fillStyle = 'black'
            ctx.fillRect(
              selectionBoxes[0].location.x + node.structure.contentBox.location.x,
              selectionBoxes[0].location.y + node.structure.contentBox.location.y,
              selectionBoxes[0].size.width,
              selectionBoxes[0].size.height,
            )
            ctx.restore()
          }
          if (now - lastBlinkingCursor.current >= 200) {
            lastBlinkingCursor.current = now
            blinkingCursorflag.current = !blinkingCursorflag.current
          }
        } else {
          for (const selectionBox of selectionBoxes) {
            ctx.save()
            ctx.fillStyle = `rgba(120,120,120,0.7)`
            ctx.fillRect(
              selectionBox.location.x + node.structure.contentBox.location.x,
              selectionBox.location.y + node.structure.contentBox.location.y,
              selectionBox.size.width,
              selectionBox.size.height,
            )
            ctx.restore()
          }
        }
      }
    },
    [ctx],
  )
  /**
   * 绘制路径
   * @param {Paht} path：路径
   */
  const renderPath = useCallback(
    (path: Path) => {
      const boundingBoxPathLength = path.length
      if (ctx) {
        ctx.beginPath()
        ctx.moveTo(path[0].x, path[0].y)
        for (let i = 1; i <= boundingBoxPathLength; i++) {
          const location = path[i % boundingBoxPathLength]
          ctx.lineTo(location.x, location.y)
        }
        ctx.stroke()
      }
    },
    [ctx],
  )

  /**
   * 绘制包围盒以及缩放块
   * @param { Path} path:路径
   */
  const renderActiveBoundingRect = useCallback(
    (path: Path) => {
      if (ctx) {
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 2
        ctx.strokeStyle = 'black'
        ctx.setLineDash([5, 15])
        ctx.lineDashOffset = 0

        const boundingBoxPath = computePathByEdgeOffset(path, BOXPADDING)

        renderPath(boundingBoxPath)
        renderActiveResizeRect(boundingBoxPath)
      }
    },
    [ctx],
  )

  /**
   * 绘制文本节点
   * @param {CanvasNode} node:文本节点
   * @param {TemplateData[keyof TemplateData]}content:文本节点装填信息
   */
  const renderText = useCallback(
    (node: TextNode, content: TemplateData[keyof TemplateData]) => {
      if (ctx) {
        const options = node.options as RenderTextOptions
        //绘制文字
        const nodeLocation = node.structure.contentBox.location
        for (const paragrahOptions of Object.values(options.paragrahs)) {
          for (const rowOptions of Object.values(paragrahOptions.rows)) {
            let walkedWidth = 0
            for (const [subSelection, fontOptions] of Object.entries(rowOptions.font)) {
              ctx.font = `${fontOptions.fontSize}px ${fontOptions.fontFamily} ${fontOptions.italicly ? 'italic' : 'normal'} ${fontOptions.fontWeight}`
              ctx.textBaseline = 'top'
              ctx.fillStyle = parseColor(fontOptions.color)

              const { startIndex, endIndex } = SelectionManage.parseSelection(subSelection as Selection)
              for (let i = startIndex; i < endIndex; i++) {
                const character = content.toString().slice(i, i + 1)

                ctx.fillText(
                  character,
                  nodeLocation.x +
                    options.contentBox.location.x +
                    paragrahOptions.contentBox.location.x +
                    rowOptions.contentBox.location.x +
                    walkedWidth,
                  nodeLocation.y +
                    options.contentBox.location.y +
                    rowOptions.contentBox.location.y +
                    paragrahOptions.contentBox.location.y +
                    rowOptions.contentBox.size.height -
                    fontOptions.fontSize -
                    fontOptions.fontSize * options.Leading * 0.1, //留下最下方空隙和字高,
                )
                walkedWidth = walkedWidth + fontOptions.characterWidth[i - startIndex] + fontOptions.letterSpace
              }
            }
            // 行盒子(文本底色)
            ctx.strokeStyle = 'rgba(200,0,0,0.2)'
            ctx.strokeRect(
              node.structure.contentBox.location.x +
                options.contentBox.location.x +
                paragrahOptions.contentBox.location.x +
                rowOptions.contentBox.location.x,
              node.structure.contentBox.location.y +
                options.contentBox.location.y +
                paragrahOptions.contentBox.location.y +
                rowOptions.contentBox.location.y,
              rowOptions.contentBox.size.width,
              rowOptions.contentBox.size.height,
            )
            // 节点盒子
            ctx.strokeStyle = 'rgba(0,200,0,0.2)'
            ctx.strokeRect(
              node.structure.contentBox.location.x,
              node.structure.contentBox.location.y,
              node.structure.contentBox.size.width,
              node.structure.contentBox.size.height,
            )

            // 节点盒子相应区域
            ctx.strokeStyle = 'rgba(0,0,200,0.2)'
            ctx.strokeRect(
              node.structure.contentBox.location.x - BOXPADDING - BOXMARGIN,
              node.structure.contentBox.location.y - BOXPADDING - BOXMARGIN,
              node.structure.contentBox.size.width + 2 * BOX_RESPONSE,
              node.structure.contentBox.size.height + 2 * BOX_RESPONSE,
            )
          }
        }

        if (node.isActive) {
          //根据options更新selection
          renderSelection(node)
          //渲染活动元素的包含框(remark:在适应高度后要即使修改节点结构，不能只发送action)
          renderActiveBoundingRect(node.structure.contentBox.path)
        }
      }
    },
    [ctx],
  )
  /**
   * 渲染空白节点
   */
  const renderEmptyNode = useCallback(
    (node: EmptyNode) => {
      if (ctx) {
        ctx.strokeStyle = 'rgba(106, 114, 124,1.0)'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 1
        ctx.setLineDash([10, 10])
        ctx.strokeRect(
          node.structure.contentBox.location.x,
          node.structure.contentBox.location.y,
          node.structure.contentBox.size.width,
          node.structure.contentBox.size.height,
        )
        ctx.fillStyle = 'rgba(3, 28, 10,0.2)'
        ctx.fillRect(
          node.structure.contentBox.location.x + Math.sign(node.structure.contentBox.size.width) * 2,
          node.structure.contentBox.location.y + Math.sign(node.structure.contentBox.size.height) * 2,
          node.structure.contentBox.size.width - Math.sign(node.structure.contentBox.size.width) * 4,
          node.structure.contentBox.size.height - Math.sign(node.structure.contentBox.size.height) * 4,
        )
      }
    },
    [ctx],
  )
  /**
   * 绘制背景
   */
  const renderCanvasBackground = useCallback(
    (canvasEleProps: CanvasEleProps) => {
      if (canvasEleProps && ctx) {
        const { referenceLine, width, height, backgroundColor } = canvasEleProps
        const { lineWidth, color, gap } = referenceLine

        ctx.fillStyle = backgroundColor
        ctx.fillRect(0, 0, width, height)

        ctx.lineWidth = lineWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = color
        const rowLineCount = Math.floor((height - gap) / (lineWidth + gap))
        const colLineCount = Math.floor((width - gap) / (lineWidth + gap))
        for (let j = 0; j < colLineCount; j++) {
          ctx.beginPath()
          ctx.moveTo(gap + (gap + lineWidth) * j, 0)
          ctx.lineTo(gap + (gap + lineWidth) * j, height)
          ctx.stroke()
          ctx.closePath()
        }
        for (let i = 0; i < rowLineCount; i++) {
          ctx.beginPath()
          ctx.moveTo(0, gap + (gap + lineWidth) * i)
          ctx.lineTo(width, gap + (gap + lineWidth) * i)
          ctx.stroke()
          ctx.closePath()
        }
      }
    },
    [ctx],
  )
  /**
   * 绘制模板
   * @param {Template} template：模板信息
   */
  const render = useCallback(
    (template: Template, canvasEleProps: CanvasEleProps) => {
      if (ctx) {
        ctx.reset()
        //渲染背景
        renderCanvasBackground(canvasEleProps)
        // 循环渲染模板中每个节点
        for (const node of template.nodeList) {
          ctx.save()
          if (isTextNode(node)) {
            renderText(node, template.templateData[node.propName])
          } else if (isEmptyNode(node)) {
            renderEmptyNode(node)
          }
          ctx.restore()
        }
      }

      if (shouuldAnimation(template)) {
        animationFrameIdRef.current = requestAnimationFrame(() => {
          render(template, canvasEleProps)
        })
      }
    },
    [ctx],
  )

  useEffect(() => {
    if (ctx && template && canvasEleProps) {
      render(template, canvasEleProps)
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
        animationFrameIdRef.current = undefined
      }
    }
  }, [ctx, template?.nodeList, template?.templateData, canvasEleProps])
}
