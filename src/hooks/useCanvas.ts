import React, { useEffect, useCallback, useRef, useState } from 'react'
import { useImmer } from 'use-immer'
import { isEqual } from 'lodash'

import {
  throttle,
  client2canvas,
  debounce,
  computeRelativePoint,
  isSamePoint,
  computeLocAndSizeOffsetOnResizing,
  generateBoxPath,
  getResizeDirection,
  isPointInPath,
  computeCentroidByPath,
} from 'utils/utils'

import {
  Point,
  Template,
  CanvasNode,
  NodeType,
  ResizeDirection,
  Vector,
  isTextNode,
  unreachablePoint,
  isEmptyNode,
  TextNode,
  Size,
  isUnreachable,
} from 'store/types/Template.type'

import {
  MOUSEMOVEPERIOD,
  ValidModifierKeys,
  ArrowKeys,
  ComposingKeys,
  MouseOperation,
  isArrowKeys,
  isComposingKeys,
  isValidModifier,
  ComposingArrowKeys,
  isComposingArrowKeys,
  RESIZERECTSIZE_RESPONSE,
  isComposingKeysPrefix,
} from '../constants/CanvasEvent'

import TextOptionsManage from 'src/models/TextOptionsManage/TextOptionsManage'
import CanvaseManage from 'src/models/CanvasManage/CanvasManage'
import selectionManage, { SelectionObj } from 'models/SelectionManage/SelectionManage'
import { CanvasEleProps } from 'src/models/CanvasManage/ICanvasManage'

import usePrinter from './usePrinter'

import { BOXPADDING } from 'src/constants/CanvasRendering'
import { TemplateData } from 'src/store/types/TemplateData.type'

const useCanvas = (
  canvasRef: React.RefObject<HTMLCanvasElement>,
  template: Template | undefined,
  canvasEleProps: CanvasEleProps,
  save: (template: Template) => void,
) => {
  save
  //键盘转发元素ref
  const canvasProxy = useRef<HTMLInputElement | null>(null)

  //私有模板数据
  const [_template, set_template] = useImmer(template)

  //最近激活节点
  const [activeNode, setActiveNode] = useState<CanvasNode>()

  //画布管理器ref
  const canvasManageRef = useRef<CanvaseManage>()

  //文本节点管理器ref
  const textOptionsManageRef = useRef<TextOptionsManage>()

  //渲染模板数据
  const { render } = usePrinter(canvasManageRef.current?.ctx, _template, canvasEleProps)

  /** -----------------------------------------------------
  *                     双击事件处                         -
  -------------------------------------------------------*/
  const handleCanvasDoubleClick = useCallback(
    (e: MouseEvent) => {
      if (canvasManageRef.current && _template) {
        const cursorLocation = client2canvas(e)
        const canCreateTextNode = _template.nodeList.every((node) => {
          if (node.isActive) {
            return (
              !canvasManageRef.current?.pointInResponseArea(cursorLocation, node) &&
              !canvasManageRef.current?.pointInNodeResizeBlock(cursorLocation, node)
            )
          } else {
            return !canvasManageRef.current?.pointInNode(cursorLocation, node)
          }
        })
        if (canCreateTextNode) {
          const layer = _template.nodeList.length
          const textNode = canvasManageRef.current.creatEmptyTextNode(cursorLocation, layer, 24)
          set_template((_template) => {
            _template?.nodeList.push(textNode)
          })
          setActiveNode(textNode)
        }
      }
    },
    [canvasRef.current, _template],
  )

  /** -----------------------------------------------------
  *                     单击事件                          -
  -------------------------------------------------------*/
  const handleCanvasClick = useCallback(
    (e: MouseEvent) => {
      if (canvasManageRef.current?.mouseOperation == MouseOperation.CLICK && _template) {
        const cursorLocation = client2canvas(e)
        const topLayer = Math.max(
          ..._template.nodeList
            .filter(
              (node) =>
                (node.isActive &&
                  (canvasManageRef.current?.pointInResponseArea(cursorLocation, node) ||
                    canvasManageRef.current?.pointInNodeResizeBlock(cursorLocation, node))) ||
                canvasManageRef.current?.pointInNode(cursorLocation, node),
            )
            .map((node) => node.layer),
        )
        const topLayerNode = _template.nodeList.find((node) => node.layer === topLayer)

        //能点击到节点
        if (topLayerNode) {
          set_template((_template) => {
            _template?.nodeList.forEach((node) => {
              if (node.instanceId === topLayerNode.instanceId) {
                node.isActive = true
              } else if (!e.ctrlKey) {
                node.isActive = false
              }
            })
          })
          setActiveNode(topLayerNode)
        }
        //不能点击到节点
        else {
          set_template((_template) => {
            if (_template)
              _template.nodeList.map((node) => {
                node.isActive = false
              })
          })
          setActiveNode(undefined)
        }

        canvasManageRef.current.mouseOperation = MouseOperation.NONE
      }
    },
    [canvasRef.current, _template],
  )

  /** -----------------------------------------------------
  *                     鼠标按下事件                      -
  -------------------------------------------------------*/
  const handleCanvasMouseDown = useCallback(
    (e: MouseEvent) => {
      //将点击位置的元素按照层级从小到大排列
      if (canvasManageRef.current && canvasManageRef.current && textOptionsManageRef.current && _template) {
        const cursorLocation = client2canvas(e)

        //重新赋值鼠标位置
        canvasManageRef.current.mousdownPoint = cursorLocation

        canvasManageRef.current.lastMousePoint = cursorLocation

        canvasManageRef.current.mouseupPoint = unreachablePoint

        // 寻找到点击位置所在的节点集合（响应区域，无论是否激活）
        const choosedNodes = _template.nodeList
          .filter(
            (node) =>
              canvasManageRef.current?.pointInResponseArea(cursorLocation, node) ||
              canvasManageRef.current?.pointInNodeResizeBlock(cursorLocation, node),
          )
          .sort((pre, cur) => pre.layer - cur.layer)
        const choosedNodesLength = choosedNodes.length

        //如果点击到了空白,将鼠标移动操作改为框选
        if (choosedNodesLength == 0) {
          const emptyNode = canvasManageRef.current.createEmptyNode(cursorLocation)

          set_template((_template) => {
            _template?.nodeList.forEach((node) => (node.isActive = false))
            _template?.nodeList.push(emptyNode)
          })

          canvasManageRef.current.mouseOperation = MouseOperation.ISSELECTING
          return
        }

        //找到最顶层的激活元素(如果元素未激活说明点击的地方没有激活元素)
        const topLayerChoosedNodeWithinActived = choosedNodes.reduce((pre, cur) => (cur.isActive ? cur : pre))

        //点击了非激活元素,激活当前元素
        if (!topLayerChoosedNodeWithinActived.isActive) {
          //实际层级最高的节点
          const lastNode = choosedNodes[choosedNodesLength - 1]

          setActiveNode(lastNode)
          set_template((_template) => {
            _template?.nodeList.map((node) => {
              if (node.instanceId === lastNode.instanceId) node.isActive = true
            })
          })

          //如果点击到了非激活文本元素元素
          if (isTextNode(lastNode)) {
            const relativeTCLocation: Point = computeRelativePoint(
              cursorLocation,
              lastNode.structure.contentBox.location,
            )

            //设置输入框选取状态
            const cursorIndex = textOptionsManageRef.current.relativeLocation2Index(lastNode, relativeTCLocation)

            set_template((_template) => {
              _template?.nodeList.map((node) => {
                if (node.instanceId === lastNode.instanceId && isTextNode(node)) {
                  node.options.selection = `${cursorIndex}-${cursorIndex}`
                }
              })
            })

            canvasManageRef.current.mouseOperation = MouseOperation.ISSELECTION
          }
          //选择了非激活的其他类型元素
          else {
            canvasManageRef.current.mouseOperation = MouseOperation.ISMOVING
          }
        }
        //点击了激活元素
        else {
          //选中了激活的文本元素的内容区域
          if (
            isTextNode(topLayerChoosedNodeWithinActived) &&
            canvasManageRef.current.pointInNode(cursorLocation, topLayerChoosedNodeWithinActived)
          ) {
            const relativeTCLocation: Point = computeRelativePoint(
              cursorLocation,
              topLayerChoosedNodeWithinActived.structure.contentBox.location,
            )
            //设置输入框选取状态
            const cursorIndex = textOptionsManageRef.current.relativeLocation2Index(
              topLayerChoosedNodeWithinActived,
              relativeTCLocation,
            )

            set_template((_template) => {
              _template?.nodeList.forEach((node) => {
                if (node.instanceId === topLayerChoosedNodeWithinActived.instanceId && isTextNode(node)) {
                  node.options.selection = `${cursorIndex}-${cursorIndex}`
                }
              })
            })

            canvasManageRef.current.mouseOperation = MouseOperation.ISSELECTION
          }
          //点击了响应区域（除开resizeblock）
          else if (
            canvasManageRef.current.pointInResponseArea(cursorLocation, topLayerChoosedNodeWithinActived) &&
            !canvasManageRef.current.pointInNodeResizeBlock(cursorLocation, topLayerChoosedNodeWithinActived)
          ) {
            canvasManageRef.current.mouseOperation = MouseOperation.ISMOVING
          }
          //点击了缩放块
          else if (canvasManageRef.current.pointInNodeResizeBlock(cursorLocation, topLayerChoosedNodeWithinActived)) {
            canvasManageRef.current.mouseOperation = MouseOperation.ISRESIZING
          }

          setActiveNode(topLayerChoosedNodeWithinActived)
        }
      }
    },
    [canvasRef.current, _template, activeNode],
  )

  /** -----------------------------------------------------
  *                     鼠标移动事件                       -
  -------------------------------------------------------*/
  const handleCanvasMouseMove = useCallback(
    throttle((e: MouseEvent) => {
      if (canvasManageRef.current?.canvasEle && _template) {
        const nodeList = _template.nodeList
        //获取移动中的鼠标点位
        const cursorLocation = client2canvas(e)

        if (canvasManageRef.current.mouseOperation === MouseOperation.NONE) {
          canvasManageRef.current.canvasEle.style.cursor = 'default'
          for (const node of nodeList) {
            if (isTextNode(node)) {
              if (
                canvasManageRef.current.pointInTextContent(cursorLocation, node) ||
                canvasManageRef.current.pointInNode(cursorLocation, node)
              ) {
                canvasManageRef.current.canvasEle.style.cursor = 'text'
              }
            }
            //在节点内容框中
            if (canvasManageRef.current.pointInNode(cursorLocation, node)) {
              switch (node.type) {
                case NodeType.TABLE:
                case NodeType.PICTURE:
                case NodeType.POLYGON:
                  canvasManageRef.current.canvasEle.style.cursor = 'move'
                  break
              }
            } else if (
              //只有在节点激活的时候才显示移动和缩放
              canvasManageRef.current.pointInNodeResizeBlock(cursorLocation, node) &&
              node.isActive
            ) {
              const direction = getResizeDirection(
                cursorLocation,
                node.structure.contentBox.path,
                BOXPADDING,
                RESIZERECTSIZE_RESPONSE,
              )
              switch (direction) {
                case ResizeDirection.VERTICAL_N:
                case ResizeDirection.VERTICAL_S:
                  canvasManageRef.current.canvasEle.style.cursor = 'ns-resize'
                  break
                case ResizeDirection.HORIZONTAL_E:
                case ResizeDirection.HORIZONTAL_W:
                  canvasManageRef.current.canvasEle.style.cursor = 'ew-resize'
                  break
                case ResizeDirection.SLASH_NE:
                case ResizeDirection.SLASH_SW:
                  canvasManageRef.current.canvasEle.style.cursor = 'nesw-resize'
                  break
                case ResizeDirection.BACKSLASH_NW:
                case ResizeDirection.BACKSLASH_SE:
                  canvasManageRef.current.canvasEle.style.cursor = 'nwse-resize'
                  break
                default:
                  canvasManageRef.current.canvasEle.style.cursor = 'move'
              }
            } else if (
              //只有在节点激活的时候才显示移动和缩放
              canvasManageRef.current.pointOnNodeBounding(cursorLocation, node) &&
              node.isActive
            ) {
              canvasManageRef.current.canvasEle.style.cursor = 'move'
            }
          }
        } else {
          const { mouseOperation, lastMousePoint, mousdownPoint } = canvasManageRef.current

          switch (mouseOperation) {
            case MouseOperation.ISMOVING: {
              const moveVec: Vector = {
                x: cursorLocation.x - lastMousePoint.x,
                y: cursorLocation.y - lastMousePoint.y,
                w: 0,
              }
              set_template((_template) => {
                _template?.nodeList.forEach((node) => {
                  if (node.isActive) {
                    node.structure.contentBox.location.x += moveVec.x
                    node.structure.contentBox.location.y += moveVec.y
                    node.structure.contentBox.path = generateBoxPath(
                      node.structure.contentBox.location,
                      node.structure.contentBox.size,
                    )
                  }
                })
              })
              break
            }
            case MouseOperation.ISRESIZING: {
              //获取缩放方向(根据缩放块响应区域)
              const resizeDirection = getResizeDirection(
                mousdownPoint,
                activeNode!.structure.contentBox.path,
                BOXPADDING,
                RESIZERECTSIZE_RESPONSE,
              )
              //计算质心点
              const centroid = computeCentroidByPath(activeNode!.structure.contentBox.path)
              //计算原始时的质心到动点的向量（当移动向量的分量和参考向量分量同向时才尺寸增加）
              const referenceVec: Vector = {
                x: mousdownPoint.x - centroid.x,
                y: mousdownPoint.y - centroid.y,
                w: 0,
              }

              //计算最近激活元素的尺寸和位置的变化
              const { locationOffset, sizeOffset } = computeLocAndSizeOffsetOnResizing({
                cursorLocation,
                lastMousemoveLocation: lastMousePoint,
                resizeDirection,
                referenceVec,
              })

              set_template((_template) => {
                _template?.nodeList.map((node) => {
                  if (node.isActive) {
                    const minWidth = isTextNode(node) ? node.options.minContentWidth : 10
                    const minHeight = 10
                    const size: Size = {
                      width: Math.max(minWidth, node.structure.contentBox.size.width + sizeOffset.x),
                      height: Math.max(minHeight, node.structure.contentBox.size.height + sizeOffset.y),
                    }
                    const location: Point = {
                      x:
                        size.width === minWidth
                          ? node.structure.contentBox.location.x
                          : node.structure.contentBox.location.x + locationOffset.x,
                      y:
                        size.height === minHeight
                          ? node.structure.contentBox.location.y
                          : node.structure.contentBox.location.y + locationOffset.y,
                      w: 1,
                    }
                    const path = generateBoxPath(location, size)
                    node.structure.contentBox = {
                      location,
                      size,
                      path,
                    }

                    //如果发生了高度的偏移，则取消所有激活的文本节点的高度适应
                    if (sizeOffset.y != 0 && isTextNode(node)) {
                      node.options.isAdoptiveHeight = false
                    }
                  }
                })
              })

              break
            }
            case MouseOperation.ISSELECTING: {
              set_template((_template) => {
                if (_template) {
                  const emptyNode = _template.nodeList.find((node) => isEmptyNode(node))!
                  const moveVec: Vector = {
                    x: cursorLocation.x - mousdownPoint.x,
                    y: cursorLocation.y - mousdownPoint.y,
                    w: 0,
                  }

                  emptyNode.structure.contentBox.size = {
                    width: moveVec.x,
                    height: moveVec.y,
                  }

                  emptyNode.structure.contentBox.path = generateBoxPath(
                    emptyNode.structure.contentBox.location,
                    emptyNode.structure.contentBox.size,
                  )
                  //遍历判断所有节点是否和空节点盒模型相交（参考blender的框选工具）小票内容区域小，类似ppt要全部选中不好操作
                  //根据emptynode和每个节点的盒模型边是否有交点判断，只要有交点就激活
                  _template.nodeList.forEach((node) => {
                    if (canvasManageRef.current && !isEmptyNode(node)) {
                      const interpoint = canvasManageRef.current.computeInterpointBetweenNodes(emptyNode, node)
                      node.isActive =
                        !isUnreachable(interpoint) ||
                        node.structure.contentBox.path.some((point) =>
                          isPointInPath(point, emptyNode.structure.contentBox.path),
                        )
                    }
                  })
                }
              })
              break
            }
            case MouseOperation.ISSELECTION: {
              //鼠标落下时就已经将光标数据修改至对应character后
              if (isTextNode(activeNode) && textOptionsManageRef.current) {
                //将相对坐标进一步约束到节点内
                const mousedownRelative = computeRelativePoint(mousdownPoint, activeNode.structure.contentBox.location)

                const cursorLocationRelative = computeRelativePoint(
                  cursorLocation,
                  activeNode.structure.contentBox.location,
                )
                cursorLocationRelative.x = Math.max(
                  1,
                  Math.min(activeNode.structure.contentBox.size.width - 1, cursorLocationRelative.x),
                )
                cursorLocationRelative.y = Math.max(
                  1,
                  Math.min(activeNode.structure.contentBox.size.height - 1, cursorLocationRelative.y),
                )

                const dynamicIndex = textOptionsManageRef.current.relativeLocation2Index(
                  activeNode,
                  cursorLocationRelative,
                )

                const staticIndex = textOptionsManageRef.current.relativeLocation2Index(activeNode, mousedownRelative)

                const newSelection = selectionManage.stringifySelection({
                  startIndex: Math.min(staticIndex, dynamicIndex),
                  endIndex: Math.max(staticIndex, dynamicIndex),
                })

                set_template((_template) => {
                  _template?.nodeList.map((node) => {
                    if (node.instanceId === activeNode.instanceId && isTextNode(node)) {
                      node.options.selection = newSelection
                    }
                  })
                })

                setActiveNode({
                  ...activeNode,
                  options: { ...activeNode.options, selection: newSelection },
                } as TextNode)
              }
              break
            }
          }

          canvasManageRef.current.lastMousePoint = cursorLocation
        }
      }
    }, MOUSEMOVEPERIOD),
    [canvasManageRef.current, _template, activeNode],
  )

  /** -----------------------------------------------------
  *                     鼠标松开事件处理                   -
  -------------------------------------------------------*/
  const handleCanvasMouseUp = useCallback(
    (e: MouseEvent) => {
      const cursorLocation = client2canvas(e)

      if (canvasManageRef.current) {
        //记录鼠标松开位置
        canvasManageRef.current.mouseupPoint = cursorLocation
        const { mousdownPoint, mouseupPoint, lastMousePoint } = canvasManageRef.current

        //点位置相同,且未移动：单击事件
        if (isSamePoint(mousdownPoint, mouseupPoint) && isUnreachable(lastMousePoint)) {
          canvasManageRef.current.mouseOperation = MouseOperation.CLICK
        }
        //发生了移动：在鼠标移动中同步处理，框选也一样，所有直接置为空
        else {
          canvasManageRef.current.mouseOperation = MouseOperation.NONE

          //擦除痕迹(后续输入仍然需要鼠标位置，需要判断选择方向和图形起止点)
          canvasManageRef.current.lastMousePoint = unreachablePoint
          // canvasManageRef.current.mousdownPoint = unreachablePoint
          // canvasManageRef.current.mouseupPoint = unreachablePoint
        }

        //将空节点移除（不需要移动就会创建）
        set_template((_template) => {
          if (_template) {
            const i = _template.nodeList.findIndex((node) => isEmptyNode(node))
            if (i != -1) {
              _template.nodeList.splice(i, 1)
            }
          }
        })
      }
    },
    [canvasManageRef.current, _template],
  )

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (
        e.dataTransfer &&
        canvasProxy.current &&
        canvasManageRef.current &&
        textOptionsManageRef.current &&
        _template
      ) {
        const cursorLocation = client2canvas(e)

        const node = JSON.parse(e.dataTransfer.getData('application/json:node')) as CanvasNode
        const data = e.dataTransfer.getData('text/plain:name')
        if (isTextNode(node)) {
          canvasProxy.current.focus()

          //拖拽时没有样式结构
          node.options = textOptionsManageRef.current.modifyOptionsSize(node.options, data)

          //节点结构位置在此确定，尺寸信息在调整时确定
          const location = cursorLocation
          const size = { ...node.options.contentBox.size }
          node.structure = {
            contentBox: {
              location,
              size,
              path: generateBoxPath(location, size),
            },
          }

          node.options = textOptionsManageRef.current.modifyTextContentLocation(node)
          //计算光标的相对位置
          const [startIndexLocation, endIndexLocation] = textOptionsManageRef.current.selection2RelativeLocation(
            node.options,
            node.options.selection,
          )

          //保存鼠标绝对位置
          canvasManageRef.current.mousdownPoint = {
            x: startIndexLocation.x + cursorLocation.x,
            y: startIndexLocation.y + cursorLocation.y,
            w: 1,
          }
          canvasManageRef.current.mouseupPoint = {
            x: endIndexLocation.x + cursorLocation.x,
            y: endIndexLocation.y + cursorLocation.y,
            w: 1,
          }
          canvasManageRef.current.lastMousePoint = {
            x: endIndexLocation.x + cursorLocation.x,
            y: endIndexLocation.y + cursorLocation.y,
            w: 1,
          }
        }

        node.layer = _template.nodeList.length
        node.isActive = true

        set_template((_template) => {
          if (_template) {
            _template.nodeList.forEach((node) => (node.isActive = false))
            _template.nodeList.push(node)
            _template.templateData[node.propName] = data
          }
        })
        setActiveNode(node)
      }
    },
    [canvasProxy.current, canvasManageRef.current, _template],
  )

  //输入法拦截合成输入后完成合成事件会同时触发两相同事件(第一次为合成事件，第二次为非合成事件)
  //TODO：feat: 支持持续的输入
  //TODO: fix: Electron中输入法合成事件再拼音中不会出现第二次的非合成事件，只会有一次合成事件
  const inputWithouFocus = useCallback(
    debounce(async (e: Event) => {
      const { isComposing, inputCache } = (e as CustomEvent).detail

      if (canvasProxy.current && canvasManageRef.current && textOptionsManageRef.current && _template) {
        const { mousdownPoint, mouseupPoint } = canvasManageRef.current

        const activeNodes = _template.nodeList.filter((node) => node.isActive)

        if (activeNodes && activeNodes.length === 1 && isTextNode(activeNodes[0])) {
          const activeNode = activeNodes[0]
          let composeData: string = _template.templateData[activeNode.propName].toString()

          let newSelection: SelectionObj
          //上一次选择区间
          const oldSelection = selectionManage.parseSelection(activeNode.options.selection)
          const deleteLength = oldSelection.endIndex - oldSelection.startIndex
          if (
            isValidModifier(inputCache) ||
            isComposingKeys(inputCache) ||
            isArrowKeys(inputCache) ||
            isComposingArrowKeys(inputCache)
          ) {
            newSelection = selectionManage.offsetSelection(oldSelection, [deleteLength, 0])
            switch (inputCache) {
              case ArrowKeys.ARROWRIGHT:
              case ArrowKeys.ARROWDOWN:
              case ArrowKeys.ARROWLEFT:
              case ArrowKeys.ARROWUP:
              case ComposingArrowKeys.SELECTION_DOWN:
              case ComposingArrowKeys.SELECTION_UP:
              case ComposingArrowKeys.SELECTION_LEFT:
              case ComposingArrowKeys.SELECTION_RIGHT: {
                const mousedownIndex = textOptionsManageRef.current.relativeLocation2Index(
                  activeNode,
                  computeRelativePoint(mousdownPoint, activeNode.structure.contentBox.location),
                )
                const mouseupIndex = textOptionsManageRef.current.relativeLocation2Index(
                  activeNode,
                  computeRelativePoint(mouseupPoint, activeNode.structure.contentBox.location),
                )
                //selection方向，主要用于按住shift时的多选情况
                const originDirection = mouseupIndex - mousedownIndex

                newSelection = textOptionsManageRef.current.getArrowCursorSelection(
                  activeNode.options,
                  inputCache,
                  originDirection,
                )

                let [startLocation, endLocation] = textOptionsManageRef.current.selection2RelativeLocation(
                  activeNode.options,
                  selectionManage.stringifySelection(newSelection),
                )
                startLocation = computeRelativePoint(startLocation, {
                  x: -activeNode.structure.contentBox.location.x,
                  y: -1 - activeNode.structure.contentBox.location.y,
                  w: 1,
                })
                endLocation = computeRelativePoint(endLocation, {
                  x: -activeNode.structure.contentBox.location.x,
                  y: -1 - activeNode.structure.contentBox.location.y,
                  w: 1,
                })

                //只有在原方向为0时才可能发生转向(新索引为空区间也可以走这个判断)
                if (originDirection === 0) {
                  canvasManageRef.current.mousdownPoint =
                    newSelection.endIndex === mousedownIndex ? endLocation : startLocation
                  canvasManageRef.current.mouseupPoint =
                    newSelection.endIndex === mousedownIndex ? startLocation : endLocation
                } else {
                  canvasManageRef.current.mousdownPoint = originDirection > 0 ? startLocation : endLocation
                  canvasManageRef.current.mouseupPoint = originDirection > 0 ? endLocation : startLocation
                }

                break
              }
              case ValidModifierKeys.BACKSPACE: {
                set_template((_template) => {
                  if (_template && textOptionsManageRef.current) {
                    //修改字符串数据和区间
                    if (selectionManage.isZeroSelection(oldSelection) && oldSelection.startIndex != 0) {
                      newSelection = selectionManage.offsetSelection(oldSelection, [-1, -1])
                      _template.templateData[activeNode.propName] =
                        composeData.substring(0, oldSelection.startIndex - 1) +
                        composeData.substring(oldSelection.endIndex)
                    } else {
                      newSelection = selectionManage.offsetSelection(oldSelection, [0, -deleteLength])
                      _template.templateData[activeNode.propName] =
                        composeData.substring(0, oldSelection.startIndex) + composeData.substring(oldSelection.endIndex)
                    }
                    //修改options
                    _template.nodeList.forEach((node) => {
                      if (
                        node.instanceId === activeNode.instanceId &&
                        textOptionsManageRef.current &&
                        isTextNode(node)
                      ) {
                        if (selectionManage.isZeroSelection(oldSelection) && oldSelection.startIndex != 0) {
                          textOptionsManageRef.current.modifyOptions(
                            node.options,
                            selectionManage.offsetSelection(oldSelection, [-1, 0]), //如果是光标就删除前一个
                            '',
                          )
                        } else {
                          textOptionsManageRef.current.modifyOptions(node.options, oldSelection, '')
                        }
                      }
                    })
                  }
                })

                break
              }
              case ValidModifierKeys.DELETE: {
                set_template((_template) => {
                  if (_template && textOptionsManageRef.current) {
                    const lastFontIndex = textOptionsManageRef.current.getLastFontIndex(activeNode.options)
                    //修改字符串数据和区间
                    if (selectionManage.isZeroSelection(oldSelection) && oldSelection.endIndex != lastFontIndex) {
                      newSelection = selectionManage.offsetSelection(oldSelection, [0, 0])
                      _template.templateData[activeNode.propName] =
                        composeData.substring(0, oldSelection.startIndex) +
                        composeData.substring(oldSelection.endIndex + 1)
                    } else {
                      newSelection = selectionManage.offsetSelection(oldSelection, [0, -deleteLength])
                      _template.templateData[activeNode.propName] =
                        composeData.substring(0, oldSelection.startIndex) + composeData.substring(oldSelection.endIndex)
                    }
                    //修改options
                    _template.nodeList.forEach((node) => {
                      if (
                        node.instanceId === activeNode.instanceId &&
                        textOptionsManageRef.current &&
                        isTextNode(node)
                      ) {
                        if (selectionManage.isZeroSelection(oldSelection) && oldSelection.endIndex != lastFontIndex) {
                          textOptionsManageRef.current.modifyOptions(
                            node.options,
                            selectionManage.offsetSelection(oldSelection, [0, 1]), //如果是光标就删除后一个
                            '',
                          )
                        } else {
                          textOptionsManageRef.current.modifyOptions(node.options, oldSelection, '')
                        }
                      }
                    })
                  }
                })
                break
              }
              case ValidModifierKeys.ENTER: {
                set_template((_template) => {
                  if (_template && textOptionsManageRef.current) {
                    _template.nodeList.forEach((node) => {
                      if (
                        node.instanceId === activeNode.instanceId &&
                        textOptionsManageRef.current &&
                        isTextNode(node)
                      ) {
                        textOptionsManageRef.current.modifyOptions(node.options, oldSelection, '')
                        textOptionsManageRef.current.breakOptions(node.options, oldSelection.startIndex)
                      }
                    })
                  }
                })
                break
              }
              case ComposingKeys.COPY: {
                navigator.clipboard.writeText(composeData.slice(oldSelection.startIndex, oldSelection.endIndex))
                break
              }
              case ComposingKeys.PASTE: {
                const copyStr = await navigator.clipboard.readText()

                composeData = composeData
                  .split('')
                  .toSpliced(oldSelection.startIndex, deleteLength, copyStr.toString())
                  .join('')

                set_template((_template) => {
                  if (_template) {
                    _template.templateData[activeNode.propName] = composeData
                    _template.nodeList.forEach((node) => {
                      if (
                        node.instanceId === activeNode.instanceId &&
                        isTextNode(node) &&
                        textOptionsManageRef.current
                      ) {
                        textOptionsManageRef.current.modifyOptions(node.options, oldSelection, copyStr)
                      }
                    })
                  }
                })
                newSelection = selectionManage.offsetSelection(oldSelection, [
                  copyStr.length,
                  copyStr.length - oldSelection.endIndex + oldSelection.startIndex,
                ])
                break
              }
              case ComposingKeys.CHECKALL: {
                newSelection = {
                  startIndex: 0,
                  endIndex: textOptionsManageRef.current.getLastFontIndex(activeNode.options),
                }
                break
              }
            }
          } else {
            //拼接字符串,修改所有的selection
            const inputCacheLength = inputCache.toString().length

            //如果是合成事件（被输入法拦截了，每次的cache是这次输入的缓存）
            //如果是合成事件那么selection不能改成光标位置而是开始位置到开始位置加合成长度
            newSelection = oldSelection
            if (isComposing) {
              newSelection = selectionManage.offsetSelection(oldSelection, [0, inputCacheLength - deleteLength])
            } else {
              newSelection = selectionManage.offsetSelection(oldSelection, [
                inputCacheLength,
                inputCacheLength - deleteLength,
              ])
              canvasProxy.current.value = ''
            }
            //组装新的装填数据
            composeData = composeData
              .split('')
              .toSpliced(oldSelection.startIndex, deleteLength, inputCache.toString())
              .join('')

            set_template((_template) => {
              if (_template) {
                _template.templateData[activeNode.propName] = composeData
                _template.nodeList.forEach((node) => {
                  if (
                    node.instanceId === activeNode.instanceId &&
                    isTextNode(node) &&
                    textOptionsManageRef.current &&
                    canvasManageRef.current
                  ) {
                    textOptionsManageRef.current.modifyOptions(node.options, oldSelection, inputCache.toString())

                    const [startLocation, endLocation] = textOptionsManageRef.current.selection2RelativeLocation(
                      node.options,
                      selectionManage.stringifySelection(newSelection),
                    )
                    canvasManageRef.current.mousdownPoint = computeRelativePoint(startLocation, {
                      x: -node.structure.contentBox.location.x,
                      y: -node.structure.contentBox.location.y,
                      w: 1,
                    })
                    canvasManageRef.current.mouseupPoint = computeRelativePoint(endLocation, {
                      x: -node.structure.contentBox.location.x,
                      y: -node.structure.contentBox.location.y,
                      w: 1,
                    })
                  }
                })
              }
            })
          }
          set_template((_template) => {
            if (_template) {
              _template.nodeList.map((node) => {
                if (node.instanceId === activeNode.instanceId && isTextNode(node)) {
                  node.options.selection = selectionManage.stringifySelection(newSelection)
                }
              })
            }
          })
        }
      }
    }, 50),
    [_template, canvasProxy.current],
  )

  const focusProxy = useCallback(
    (e: MouseEvent) => {
      if (canvasProxy.current && canvasRef.current && canvasManageRef.current && _template) {
        const activeNodes = _template.nodeList.filter((node) => node.isActive)
        if (e.target != canvasManageRef.current.canvasEle) {
          canvasProxy.current.blur()
          setActiveNode(undefined)
          set_template((template) => {
            if (template) template.nodeList.forEach((node) => (node.isActive = false))
          })
        } else if (activeNode && isTextNode(activeNode) && activeNodes.length === 1) {
          canvasProxy.current.focus()
        }
      }
    },
    [canvasProxy.current, canvasManageRef.current, _template],
  )

  /**
   * 代理元素键盘事件
   */
  interface CustomEvent extends Event {
    detail: {
      type: string
      value: string
      inputCache: string | number
      isComposing: boolean
    }
  }
  const keydownProxy = useCallback(
    (e: KeyboardEvent) => {
      //只要不是组合键前缀则都可通过
      if (canvasRef.current && canvasProxy.current && activeNode && isTextNode(activeNode)) {
        let inputCache = e.key
        if ((e.ctrlKey || e.shiftKey) && !isValidModifier(e.key)) {
          e.preventDefault()
          switch (e.key) {
            case 'a':
            case 'A': {
              inputCache = ComposingKeys.CHECKALL
              break
            }
            case 's':
            case 'S': {
              inputCache = ComposingKeys.SAVE
              break
            }
            case 'c':
            case 'C': {
              inputCache = ComposingKeys.COPY
              break
            }
            case 'v':
            case 'V': {
              inputCache = ComposingKeys.PASTE
              break
            }
            case ArrowKeys.ARROWDOWN: {
              inputCache = ComposingKeys.SELECTION_DOWN
              break
            }
            case ArrowKeys.ARROWLEFT: {
              inputCache = ComposingKeys.SELECTION_LEFT
              break
            }
            case ArrowKeys.ARROWRIGHT: {
              inputCache = ComposingKeys.SELECTION_RIGHT
              break
            }
            case ArrowKeys.ARROWUP: {
              inputCache = ComposingKeys.SELECTION_UP
              break
            }
          }
        }
        if (
          isComposingKeys(inputCache) ||
          isArrowKeys(inputCache) ||
          (isValidModifier(inputCache) && !isComposingKeysPrefix(inputCache))
        ) {
          const cusInputEnvent = new CustomEvent('inputWithouFocus', {
            detail: {
              type: e.type,
              value: (e.target as HTMLInputElement).value,
              inputCache,
              isComposing: e.isComposing,
            },
          })
          canvasRef.current.dispatchEvent(cusInputEnvent)
        }
      }
    },
    [canvasProxy.current, activeNode],
  )

  const inputProxy = useCallback(
    (e: Event) => {
      if (
        canvasProxy.current &&
        canvasRef.current &&
        _template &&
        canvasManageRef.current &&
        textOptionsManageRef.current
      ) {
        const { mousdownPoint, mouseupPoint } = canvasManageRef.current

        //只有一个激活节点且是文本
        if (isTextNode(activeNode) && (e as InputEvent).data != null) {
          /** -----------------------------------------------------
          *                     1:转发事件                         -
          -------------------------------------------------------*/
          const cusInputEnvent = new CustomEvent('inputWithouFocus', {
            detail: {
              type: (e as InputEvent).inputType,
              value: (e.target as HTMLInputElement).value,
              inputCache: (e as InputEvent).data,
              isComposing: (e as InputEvent).isComposing,
            },
          })

          canvasRef.current.dispatchEvent(cusInputEnvent)

          /** -----------------------------------------------------
          *           2:修改代理元素位置(定位到鼠标松开位置)         -
          -------------------------------------------------------*/
          //TODO:fix: 获取所在行行高，参与顶部偏移计算,直接根据mouseup的位置进行计算
          const inputStartLocation = textOptionsManageRef.current.getInputStartLocation(
            activeNode,
            mousdownPoint,
            mouseupPoint,
          )
          const fOptions = textOptionsManageRef.current.getLastFont(activeNode.options)
          canvasProxy.current.style.left = `${Math.max(422, inputStartLocation.x + fOptions.characterWidth[fOptions.characterWidth.length - 1])}px`
          canvasProxy.current.style.top = `${inputStartLocation.y}px`
        }
      }
    },
    [canvasProxy.current, _template],
  )

  //针对chrome内核的合成事件结束
  const composingend = useCallback(
    throttle((e: CompositionEvent) => {
      if (canvasProxy.current && canvasRef.current) {
        //只有一个激活节点且是文本
        if (isTextNode(activeNode) && e.data != null) {
          /** -----------------------------------------------------
          *                     1:转发事件                         -
          -------------------------------------------------------*/
          const cusInputEnvent = new CustomEvent('inputWithouFocus', {
            detail: {
              type: 'compositionend',
              value: (e.target as HTMLInputElement).value,
              inputCache: e.data,
              isComposing: false,
            },
          })

          canvasRef.current.dispatchEvent(cusInputEnvent)
        }
      }
    }, 50),
    [canvasProxy.current, _template],
  )
  const blurProxy = useCallback(() => {
    if (canvasProxy.current) {
      canvasProxy.current.value = ''
    }
  }, [canvasProxy.current, activeNode])

  /***
   * 创建画布管理器
   * 监听用户保存或者自动保存后的数据变化
   */
  useEffect(() => {
    if (canvasRef.current && template) {
      try {
        canvasManageRef.current = new CanvaseManage(canvasRef.current)
        textOptionsManageRef.current = new TextOptionsManage(canvasManageRef.current.ctx!)
        set_template(canvasManageRef.current.adjustTemplate(template))
      } catch (error) {
        console.log(error)
      }
    }
  }, [canvasRef.current, template])

  useEffect(() => {
    if (canvasManageRef.current && _template) {
      const adjustedTemplate = canvasManageRef.current.adjustTemplate(_template)
      if (!isEqual(adjustedTemplate, _template)) {
        set_template(adjustedTemplate)
      }
    }
  }, [_template])

  /**
   * 画布事件绑定与解绑
   */
  useEffect(() => {
    if (canvasRef.current) {
      //画布中的鼠标事件（用于节点的选择，缩放，移动，框选；文本的新建）
      canvasRef.current.addEventListener('dblclick', handleCanvasDoubleClick)
      canvasRef.current.addEventListener('click', handleCanvasClick)
      canvasRef.current.addEventListener('mousedown', handleCanvasMouseDown)
      canvasRef.current.addEventListener('mousemove', handleCanvasMouseMove)
      canvasRef.current.addEventListener('mouseup', handleCanvasMouseUp)

      //将组件列表拖拽进入画布并新建对应节点
      canvasRef.current.addEventListener('dragover', onDragOver)
      canvasRef.current.addEventListener('drop', onDrop)

      //文本节点的输入事件
      canvasRef.current.addEventListener('inputWithouFocus', inputWithouFocus)

      //保证点击画布中时，总能聚焦到输入框进行输入
      document.addEventListener('click', focusProxy)
      //清理事件
      return () => {
        if (canvasRef.current) {
          canvasRef.current.removeEventListener('dblclick', handleCanvasDoubleClick)
          canvasRef.current.removeEventListener('click', handleCanvasClick)
          canvasRef.current.removeEventListener('mousedown', handleCanvasMouseDown)
          canvasRef.current.removeEventListener('mousemove', handleCanvasMouseMove)
          canvasRef.current.removeEventListener('mouseup', handleCanvasMouseUp)
          canvasRef.current.removeEventListener('dragover', onDragOver)
          canvasRef.current.removeEventListener('drop', onDrop)
          canvasRef.current.removeEventListener('inputWithouFocus', inputWithouFocus)
          document.removeEventListener('click', focusProxy)
        }
      }
    }
  }, [canvasRef.current, template, _template, activeNode])

  /**
   * 画布初始化样式信息
   */
  useEffect(() => {
    if (canvasRef.current) {
      //设置canvas尺寸信息
      const dpr = window.devicePixelRatio
      canvasRef.current.width = 522
      canvasRef.current.height = 700
      canvasRef.current.style.width = `${canvasRef.current.width * dpr}px`
      canvasRef.current.style.height = `${canvasRef.current.height * dpr}px`
    }
  }, [canvasRef.current])

  /***
   * 代理元素初始化样式
   */
  useEffect(() => {
    if (canvasRef.current) {
      const proxyEle: HTMLInputElement = document.createElement('input')
      proxyEle.style.width = `100px` //设置大一点，防止网页中输入框闪烁
      proxyEle.style.height = `10px`
      proxyEle.style.position = 'absolute'
      proxyEle.style.left = '0'
      proxyEle.style.top = '0'
      proxyEle.style.opacity = '0'
      proxyEle.style.backgroundColor = '#fff'
      proxyEle.style.zIndex = '-999'
      proxyEle.style.overflow = 'hidden'
      canvasProxy.current = proxyEle
      canvasRef.current.parentElement!.insertBefore(proxyEle, canvasRef.current)
    }
    return () => {
      canvasProxy.current?.remove()
      canvasProxy.current == null
    }
  }, [canvasRef.current])
  /**
   * 代理元素的事件绑定
   */
  useEffect(() => {
    if (canvasProxy.current) {
      canvasProxy.current.addEventListener('keydown', keydownProxy)
      canvasProxy.current.addEventListener('input', inputProxy)
      canvasProxy.current.addEventListener('compositionend', composingend)
      canvasProxy.current.addEventListener('blur', blurProxy)
      return () => {
        canvasProxy.current?.removeEventListener('keydown', keydownProxy)
        canvasProxy.current?.removeEventListener('input', inputProxy)
        canvasProxy.current?.removeEventListener('blur', blurProxy)
      }
    }
  }, [canvasProxy.current, _template])

  const getTemplate = () => {
    return _template!
  }

  const getImage = (templateData?: TemplateData) => {
    if (canvasManageRef.current?.ctx && canvasManageRef.current?.canvasEle && _template) {
      if (templateData) {
        render(canvasManageRef.current.ctx, Object.assign(_template, { templateData }))
      } else {
        render(canvasManageRef.current.ctx, _template)
        console.log('重新渲染')
      }

      console.log(canvasManageRef.current.ctx, canvasManageRef.current.canvasEle)

      const imgData = canvasManageRef.current.ctx.getImageData(
        0,
        0,
        canvasManageRef.current.canvasEle.width,
        canvasManageRef.current.canvasEle.height,
      )
      console.log(imgData)

      // canvasManageRef.current.ctx.reset()
      // canvasManageRef.current.ctx.putImageData(resizeImageData(imgData, 200, 300), 0, 0)
      // return canvasManageRef.current.canvasEle.toDataURL('image/png')
    }
  }
  const getImageData = (templateData?: TemplateData) => {
    if (canvasManageRef.current?.ctx && canvasManageRef.current?.canvasEle && _template) {
      if (templateData) {
        render(canvasManageRef.current?.ctx, Object.assign(_template, { templateData }))
      } else {
        render(canvasManageRef.current?.ctx, _template)
      }
      const imgdata = canvasManageRef.current.ctx.getImageData(
        0,
        0,
        canvasManageRef.current.canvasEle.width,
        canvasManageRef.current.canvasEle.height,
      )

      return imageDataToBitmap(resizeImageData(imgdata, 50, 100))
    }
  }
  const resizeImageData = (originalImageData: ImageData, newWidth: number, newHeight: number) => {
    const originalWidth = originalImageData.width
    const originalHeight = originalImageData.height
    const newData = new Uint8ClampedArray(newWidth * newHeight * 4)
    let index = 0
    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < newWidth; x++) {
        const ox = Math.floor((x * originalWidth) / newWidth)
        const oy = Math.floor((y * originalHeight) / newHeight)
        const sourceIndex = (oy * originalWidth + ox) * 4
        // 复制原始像素到新数组
        newData[index++] = originalImageData.data[sourceIndex] // R
        newData[index++] = originalImageData.data[sourceIndex + 1] // G
        newData[index++] = originalImageData.data[sourceIndex + 2] // B
        newData[index++] = originalImageData.data[sourceIndex + 3] // A
      }
    }
    // 创建一个新的ImageData对象
    const resizedImageData = new ImageData(newData, newWidth, newHeight)

    return resizedImageData
  }

  const imageDataToBitmap = (imageData: ImageData) => {
    const width = imageData.width
    const height = imageData.height
    const data = imageData.data
    const bitmap = []
    // 遍历每个像素
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // 计算当前像素的索引
        const index = (y * width + x) * 4 // 因为每个像素包含4个值（RGBA）
        // 检查该像素是否为白色
        // 假设白色为RGB值都为255的像素
        if (data[index] === 255 && data[index + 1] === 255 && data[index + 2] === 255) {
          bitmap.push(0) // 是白色，加入0
        } else {
          bitmap.push(1) // 不是白色，加入1
        }
      }
    }

    return bitmap
  }

  return { activeNode: isEmptyNode(activeNode) ? undefined : activeNode, getTemplate, getImage, getImageData }
}

export default useCanvas
