import { useCallback, useEffect, useRef } from 'react'

import { Template, CanvasNode, NodeType, RenderTextOptions, Path, Selection } from 'store/types/Template.type'

import { TemplateData } from '../store/types/TemplateData.type'

import {
  computePathByEdgeOffset,
  computeActiveResizeRectPos,
  parseColor,
  selectionStr2Arr,
  getActiveNodes,
} from 'utils/utils'

import { BOXMARGIN, BOXPADDING, RESIZERECTSIZE } from 'constants/index'
import SelectionManage from 'src/models/SelectionManage/SelectionManage'

export default function usePrinter(ctx: CanvasRenderingContext2D | null, template: Template | undefined) {
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
    (node: CanvasNode) => {
      if (ctx) {
        const { selection, selectionBoxes } = node.options as RenderTextOptions

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
    (node: CanvasNode, content: TemplateData[keyof TemplateData]) => {
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

              const [startIndex, endIndex] = selectionStr2Arr(subSelection as Selection)
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
              node.structure.contentBox.size.width + 2 * (BOXPADDING + BOXMARGIN),
              node.structure.contentBox.size.height + 2 * (BOXPADDING + BOXMARGIN),
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
   * 绘制模板
   * @param {Template} template：模板信息
   */
  const render = useCallback(
    (template: Template) => {
      //循环渲染模板中每个节点
      if (ctx) {
        ctx.reset()
        for (const node of template.nodeList) {
          ctx.save()
          switch (node.type) {
            case NodeType.TEXT:
              renderText(node, template.templateData[node.propName])
              break
            case NodeType.BARCODE:
              break
            case NodeType.TABLE:
              break
            case NodeType.PICTURE:
              break
            case NodeType.POLYGON:
              break
          }
          ctx.restore()
        }
      }

      //动画
      const activeNodes = getActiveNodes(template)
      if (
        activeNodes.length === 1 &&
        activeNodes[0].type === NodeType.TEXT &&
        new Set(selectionStr2Arr((activeNodes[0].options as RenderTextOptions).selection)).size === 1
      ) {
        animationFrameIdRef.current = requestAnimationFrame(() => {
          render(template)
        })
      }
    },
    [ctx],
  )
  /**
   * 预览画布
   * @description 将画布导出为图片
   */
  const preview = useCallback(() => {
    //计算缩小分辨率后的imageData，弹出模态框显示预览图片
    if (ctx) {
      return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
    }
  }, [ctx])
  /**
   * 打印画布
   * @description 将画布导出为imageData进行适应性缩放，灰度化
   */
  const print = useCallback(() => {
    if (ctx) {
      return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height)
    }
  }, [ctx])

  useEffect(() => {
    if (ctx && template) {
      render(template)
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
        animationFrameIdRef.current = undefined
      }
    }
  }, [ctx, template])

  return {
    preview,
    print,
  }
}
