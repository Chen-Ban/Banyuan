import {
  Path,
  Point,
  Vector,
  zeroVector,
  Box,
  Size,
  ResizeDirection,
  Template,
  CanvasNode,
  Range,
  FontOptions,
  Selection,
  RenderTextOptions,
} from 'store/types/Template.type'

import { BOXMARGIN, BOXPADDING, RESIZERECTSIZE, RESIZERECTSIZE_RESPONSE } from 'constants/index'

//防抖函数
export function debounce<T>(fn: (p: T) => void, delay = 200): (p: T) => void {
  let timerId: number | undefined | NodeJS.Timeout = void 0
  return (...args) => {
    if (timerId) {
      clearTimeout(timerId)
    }
    timerId = globalThis.setTimeout(() => {
      fn(...args)
    }, delay)
  }
}

//节流函数
export function throttle<T extends (...args: any[]) => any | void>(
  fn: T,
  limit: number = 200,
): (...args: Parameters<T>) => ReturnType<T> | void {
  let last = Date.now()
  return function (...args) {
    const now = Date.now()
    const duration = now - last
    let res = undefined
    if (duration > limit) {
      res = fn(...args)
      last = Date.now()
    }
    return res
  }
}

//从质心出发放大质心到点的倍数
export const computePathByCentroidScale = (path: Path, scaleFactor: number = 1.1): Path => {
  //.计算质心
  const centroid = computeCentroidByPath(path)
  //.根据质心缩放
  const scaledBoxPath: Path = Array.from({ length: path.length }, () => ({
    x: 0,
    y: 0,
    w: 1,
  }))
  for (const [i, boundingLocation] of path.entries()) {
    //质心指向顶点的向量
    const centroidVec: Vector = {
      x: boundingLocation.x - centroid.x,
      y: boundingLocation.y - centroid.y,
      w: 0,
    }
    //放大过后的轮廓点
    scaledBoxPath[i] = {
      x: centroidVec.x * scaleFactor + centroid.x,
      y: centroidVec.y * scaleFactor + centroid.y,
      w: 1,
    }
  }
  return scaledBoxPath
}
//计算模长
export const computeMagnitude = (vec: Vector): number => {
  return Math.sqrt(vec.x * vec.x + vec.y * vec.y)
}
//计算单位向量
export const computeUnitVector = (vec: Vector): Vector => {
  const magnitude = computeMagnitude(vec)
  return {
    x: vec.x / magnitude,
    y: vec.y / magnitude,
    w: 0,
  }
}
//从质心出发缩放固定距离
export const computePathByCentroidOffset = (path: Path, offset: number): Path => {
  //.计算质心
  const centroid = computeCentroidByPath(path)
  //.根据质心缩放
  const offsetedPath: Path = Array.from({ length: path.length }, () => ({
    x: 0,
    y: 0,
    w: 1,
  }))
  for (const [i, boundingLocation] of path.entries()) {
    //质心指向顶点的向量
    const centroidVec: Vector = {
      x: boundingLocation.x - centroid.x,
      y: boundingLocation.y - centroid.y,
      w: 0,
    }
    const magnitude = computeMagnitude(centroidVec)
    const unitCentroidVec = computeUnitVector(centroidVec)
    //放大过后的轮廓点
    offsetedPath[i] = {
      x: unitCentroidVec.x * (offset + magnitude) + centroid.x,
      y: unitCentroidVec.y * (offset + magnitude) + centroid.y,
      w: 1,
    }
  }
  return offsetedPath
}
//计算质心
export const computeCentroidByPath = (path: Path): Point => {
  const verNum = path.length
  let S: number = 0 // 面积
  const centroid: Point = { x: 0, y: 0, w: 1 } //质心
  for (const [i, location] of path.entries()) {
    const nextLocation = path[(i + 1) % verNum]
    S += location.x * nextLocation.y - location.y * nextLocation.x
  }
  S = Math.abs(S) / 2
  //.计算质心
  for (const [i, location] of path.entries()) {
    const nextLocation = path[(i + 1) % verNum]
    centroid.x += (location.x + nextLocation.x) * (location.x * nextLocation.y - location.y * nextLocation.x)
    centroid.y += (location.y + nextLocation.y) * (location.x * nextLocation.y - location.y * nextLocation.x)
  }
  centroid.x /= 6 * S
  centroid.y /= 6 * S
  return centroid
}

//将矩形的尺度信息转变成path
export const convertLocation2Path = (location: Point, size: Size): Path => {
  return [
    location,
    {
      x: location.x + size.width,
      y: location.y,
      w: 1,
    },
    {
      x: location.x + size.width,
      y: location.y + size.height,
      w: 1,
    },
    {
      x: location.x,
      y: location.y + size.height,
      w: 1,
    },
  ]
}

//根据内容框路径形成包围框路径（1，计算边的偏移；2，计算边的交点形成路径）
export const computePathByEdgeOffset = (path: Path, offset: number): Path => {
  const liens = generateLinesByOffset(path, offset)
  const linesLen = liens.length

  const edgeOffsetPath: Path = []
  for (let i = linesLen - 1; i < linesLen * 2 - 1; i++) {
    edgeOffsetPath.push(computeIntersectionPoint(liens[i % linesLen], liens[(i + 1) % linesLen]))
  }

  return edgeOffsetPath
}
//从边线出发偏移固定距离形成的直线集合
const generateLinesByOffset = (path: Path, offset: number): Path[] => {
  const len = path.length
  const lines: Path[] = []
  for (let i = 0; i < len; i++) {
    const location = path[i]
    const nextLocation = path[(i + 1) % len]
    //求当前直线的方向分量
    let dy = nextLocation.y - location.y
    let dx = nextLocation.x - location.x
    const dLen = Math.sqrt(dx * dx + dy * dy)
    dy /= dLen
    dx /= dLen

    //求当前直线垂直向外的分量(顺时针朝内,交点取负;逆时针朝外,交点取正)
    const vdy = -dx
    const vdx = dy

    //将两个点进行偏移
    const offsetLocation: Point = {
      x: location.x + vdx * offset,
      y: location.y + vdy * offset,
      w: 1,
    }
    const offsetNexLocation: Point = {
      x: nextLocation.x + vdx * offset,
      y: nextLocation.y + vdy * offset,
      w: 1,
    }
    // console.log(
    //   `第${i + 1}条边的两个点坐标,
    //     p1:(${location.x},${location.y}),p2:(${nextLocation.x},${nextLocation.y})
    //     p3:(${offsetLocation.x},${offsetLocation.y}),p4:(${offsetNexLocation.x},${offsetNexLocation.y})
    //     `,
    // )
    lines.push([offsetLocation, offsetNexLocation])
  }
  return lines
}
//计算两直线交点
const computeIntersectionPoint = (line1: Path, line2: Path): Point => {
  const a1 = line1[1].y - line1[0].y
  const b1 = line1[0].x - line1[1].x
  const c1 = line1[1].x * line1[0].y - line1[0].x * line1[1].y

  const a2 = line2[1].y - line2[0].y
  const b2 = line2[0].x - line2[1].x
  const c2 = line2[1].x * line2[0].y - line2[0].x * line2[1].y

  return {
    x: -(b2 * c1 - b1 * c2) / (a1 * b2 - a2 * b1),
    y: -(a1 * c2 - a2 * c1) / (a1 * b2 - a2 * b1),
    w: 1,
  }
}

//计算缩放块位置
export const computeActiveResizeRectPos = (path: Path, resizeRectSize: number = RESIZERECTSIZE) => {
  const halfResizeRectSize = resizeRectSize / 2
  const pathLength = path.length
  const resizeRectPos: Path = Array.from({ length: pathLength * 2 }, () => ({
    x: 0,
    y: 0,
    w: 1,
  }))
  for (const [i, location] of path.entries()) {
    const nextLocation = path[(i + 1) % pathLength]
    const midPoint: Point = {
      x: (nextLocation.x - location.x) / 2 + location.x,
      y: (nextLocation.y - location.y) / 2 + location.y,
      w: 1,
    }
    resizeRectPos[i * 2] = {
      x: location.x - halfResizeRectSize,
      y: location.y - halfResizeRectSize,
      w: 1,
    }
    resizeRectPos[i * 2 + 1] = {
      x: midPoint.x - halfResizeRectSize,
      y: midPoint.y - halfResizeRectSize,
      w: 1,
    }
  }
  return resizeRectPos
}
//顺时针构建边的向量和每个向量起点指向鼠标点的向量做叉乘，每个叉乘同号则为区域内
export const cursorInPath = (cursorLocation: Point, path: Box['path']): boolean => {
  const crossRes = []
  const verCount = path.length
  for (const [i, currentLocation] of path.entries()) {
    //生成边向量i
    const nextLocation = path[(i + 1) % verCount]
    const edgeVec = {
      x: nextLocation.x - currentLocation.x,
      y: nextLocation.y - currentLocation.y,
    }
    //生成边起点到鼠标位置的向量j
    const curVec = {
      x: cursorLocation.x - currentLocation.x,
      y: cursorLocation.y - currentLocation.y,
    }
    //做叉乘j×i缓存结果到crossRes
    crossRes.push(curVec.x * edgeVec.y - curVec.y * edgeVec.x)
  }
  //如果crossRes每个元素都为正则表示鼠标点在元素内
  return crossRes.every((cro) => cro < 0)
}

//鼠标事件的视口坐标转换成canvas内的坐标
export const client2canvas = (e: MouseEvent | DragEvent): Point => {
  const canvasRec = (e.target as HTMLCanvasElement).getBoundingClientRect()
  return {
    x: e.clientX - canvasRec.left,
    y: e.clientY - canvasRec.top,
    w: 1,
  }
}
//计算是否在边缘
export const cursorOnBoundingEdge = (
  cursorLocation: Point,
  path: Path,
  padding: number = BOXPADDING,
  margin: number = BOXMARGIN,
  resizeBlockSize: number = RESIZERECTSIZE,
): boolean => {
  return (
    cursorInresponseBox(cursorLocation, path, padding, margin) &&
    !cursorInPath(cursorLocation, path) &&
    !cursorInResizeBlock(cursorLocation, path, padding, resizeBlockSize)
  )
}
//计算是否在resize block中
export const cursorInResizeBlock = (
  cursorLocation: Point,
  path: Path,
  padding: number = BOXPADDING,
  resizeBlockSize: number = RESIZERECTSIZE_RESPONSE,
): boolean => {
  const boundingBoxPath = computePathByEdgeOffset(path, padding)
  const resizeRectPos = computeActiveResizeRectPos(boundingBoxPath, resizeBlockSize)

  return resizeRectPos.some((location) =>
    cursorInPath(
      cursorLocation,
      convertLocation2Path(location, {
        width: resizeBlockSize,
        height: resizeBlockSize,
      }),
    ),
  )
}
//在响应区域中
export const cursorInresponseBox = (
  cursorLocation: Point,
  path: Path,
  padding: number = BOXPADDING,
  margin: number = BOXMARGIN,
) => {
  return cursorInPath(cursorLocation, computePathByEdgeOffset(path, padding + margin))
}
//获取resize方向
export const getResizeDirection = (cursorLocation: Point, path: Path): ResizeDirection => {
  switch (getResizeBlockIndex(cursorLocation, path)) {
    case 0:
      return ResizeDirection.BACKSLASH_NW
    case 4:
      return ResizeDirection.BACKSLASH_SE
    case 1:
      return ResizeDirection.VERTICAL_N
    case 5:
      return ResizeDirection.VERTICAL_S
    case 2:
      return ResizeDirection.SLASH_NE
    case 6:
      return ResizeDirection.SLASH_SW
    case 3:
      return ResizeDirection.HORIZONTAL_E
    case 7:
      return ResizeDirection.HORIZONTAL_W
    default:
      return ResizeDirection.NONE
  }
}
//获取resize的控制点,分别是选中的动点和对立的静止点
export const getResizeControllLocation = (cursorLocation: Point, path: Path): [Point, Point] => {
  switch (getResizeBlockIndex(cursorLocation, path)) {
    case 0:
      return [path[0], path[2]]
    case 4:
      return [path[2], path[0]]
    case 1:
      return [
        {
          x: (path[0].x + path[1].x) / 2,
          y: path[0].y,
          w: 1,
        },
        {
          x: (path[2].x + path[3].x) / 2,
          y: path[2].y,
          w: 1,
        },
      ]
    case 5:
      return [
        {
          x: (path[2].x + path[3].x) / 2,
          y: path[2].y,
          w: 1,
        },
        {
          x: (path[0].x + path[1].x) / 2,
          y: path[0].y,
          w: 1,
        },
      ]
    case 2:
      return [path[1], path[3]]
    case 6:
      return [path[3], path[1]]
    case 3:
      return [
        {
          x: path[1].x,
          y: (path[1].y + path[2].y) / 2,
          w: 1,
        },
        {
          x: path[0].x,
          y: (path[0].y + path[3].y) / 2,
          w: 1,
        },
      ]
    case 7:
      return [
        {
          x: path[0].x,
          y: (path[0].y + path[3].y) / 2,
          w: 1,
        },
        {
          x: path[1].x,
          y: (path[1].y + path[2].y) / 2,
          w: 1,
        },
      ]
    default:
      return [computeCentroidByPath(path), computeCentroidByPath(path)]
  }
}
//获取当前resize block的序列号
export const getResizeBlockIndex = (cursorLocation: Point, path: Path, padding: number = BOXPADDING) => {
  const boundingBoxPath = computePathByEdgeOffset(path, padding)
  const resizeRectPos = computeActiveResizeRectPos(boundingBoxPath)
  return resizeRectPos.findIndex((location) =>
    cursorInPath(
      cursorLocation,
      convertLocation2Path(location, { width: RESIZERECTSIZE_RESPONSE, height: RESIZERECTSIZE_RESPONSE }),
    ),
  )
}

export const computeLocAndSizeOffsetOnResizing = ({
  cursorLocation, //当前位置
  lastMousemoveLocation, //上次位置
  mousedownLocation, //最开始位置
  path, //最开始路径
}: {
  cursorLocation: Point
  lastMousemoveLocation: Point
  mousedownLocation: Point
  path: Path
}) => {
  //根据包围框对立点缩放
  const moveVec: Vector = {
    x: cursorLocation.x - lastMousemoveLocation.x,
    y: cursorLocation.y - lastMousemoveLocation.y,
    w: 0,
  }
  //获取缩放方向
  const resizeDirection = getResizeDirection(mousedownLocation, path)
  //计算质心点
  const centroid = computeCentroidByPath(path)
  //计算原始时的质心到动点的向量
  const referenceVec = {
    x: mousedownLocation.x - centroid.x,
    y: mousedownLocation.y - centroid.y,
  }
  //计算所有激活节点的location偏移量和size偏移量
  let locationOffset: Vector = zeroVector
  let sizeOffset: Vector = zeroVector
  switch (resizeDirection) {
    case ResizeDirection.BACKSLASH_NW:
      locationOffset = moveVec
      sizeOffset = {
        ...zeroVector,
        x: Math.abs(moveVec.x) * Math.sign(moveVec.x * referenceVec.x),
        y: Math.abs(moveVec.y) * Math.sign(moveVec.y * referenceVec.y),
      }
      break
    case ResizeDirection.VERTICAL_N:
      locationOffset = {
        ...zeroVector,
        x: 0,
        y: moveVec.y,
      }
      sizeOffset = {
        ...zeroVector,
        x: 0,
        y: Math.abs(moveVec.y) * Math.sign(moveVec.y * referenceVec.y),
      }
      break
    case ResizeDirection.VERTICAL_S:
      locationOffset = { ...zeroVector, x: 0, y: 0 }
      sizeOffset = {
        ...zeroVector,
        x: 0,
        y: Math.abs(moveVec.y) * Math.sign(moveVec.y * referenceVec.y),
      }
      break
    case ResizeDirection.SLASH_NE:
      locationOffset = { ...zeroVector, x: 0, y: moveVec.y }
      sizeOffset = {
        ...zeroVector,
        x: Math.abs(moveVec.x) * Math.sign(moveVec.x * referenceVec.x),
        y: Math.abs(moveVec.y) * Math.sign(moveVec.y * referenceVec.y),
      }
      break
    case ResizeDirection.HORIZONTAL_E:
      locationOffset = { ...zeroVector, x: 0, y: 0 }
      sizeOffset = {
        ...zeroVector,
        x: Math.abs(moveVec.x) * Math.sign(moveVec.x * referenceVec.x),
        y: 0,
      }
      break
    case ResizeDirection.HORIZONTAL_W:
      locationOffset = { ...zeroVector, x: moveVec.x, y: 0 }
      sizeOffset = {
        ...zeroVector,
        x: Math.abs(moveVec.x) * Math.sign(moveVec.x * referenceVec.x),
        y: 0,
      }
      break
    case ResizeDirection.BACKSLASH_SE:
      locationOffset = { ...zeroVector, x: 0, y: 0 }
      sizeOffset = {
        ...zeroVector,
        x: Math.abs(moveVec.x) * Math.sign(moveVec.x * referenceVec.x),
        y: Math.abs(moveVec.y) * Math.sign(moveVec.y * referenceVec.y),
      }
      break
    case ResizeDirection.SLASH_SW:
      locationOffset = { ...zeroVector, x: moveVec.x, y: 0 }
      sizeOffset = {
        ...zeroVector,
        x: Math.abs(moveVec.x) * Math.sign(moveVec.x * referenceVec.x),
        y: Math.abs(moveVec.y) * Math.sign(moveVec.y * referenceVec.y),
      }
      break
  }
  return {
    locationOffset,
    sizeOffset,
  }
}

export const isSameLocation = (location1: Point, location2: Point) => {
  return location1.x == location2.x && location2.y == location2.y
}

export const getActiveNodes = (template: Template): CanvasNode[] => {
  return template.nodeList.filter((node) => node.isActive)
}

export const parseColor = (color: number | number[]) => {
  if (typeof color == 'number') {
    return `#${color.toString(16).padStart(6, '0')}` //不支持略写形式，需要写完整，蓝色通道优先
  } else if (color.length == 3) {
    return `rgb(${color.join(',')})`
  } else if (color.length == 4) {
    return `rgba(${color.join(',')})`
  }
  return '#000000'
}

export const toSortedSelection = (selections: Selection[]) => {
  return structuredClone(selections)
    .map((selection) => selection.split('-').map((item) => parseInt(item)))
    .sort((pre, cur) => pre[0] - cur[0])
    .map((selection) => selection.join('-'))
}

export const selectionStr2Arr = (selection: Selection | null) => {
  if (!selection) {
    return []
  }
  return selection.split('-').map((item) => (Number(item) != Infinity ? parseInt(item) : Number(item)))
}

export function mergeRange(preRange: Range<FontOptions>, curRange: Range<FontOptions>) {
  const preSelection = toSortedSelection(Object.keys(preRange) as Selection[])
  const preLastSelection = preSelection[preSelection.length - 1] as Selection
  const curSelection = toSortedSelection(Object.keys(curRange) as Selection[])
  const curFirstSelection = curSelection[0] as Selection

  const preLastFontOptions = preRange[preLastSelection]
  const curFirstFontOptions = curRange[curFirstSelection]

  let newRange = {}
  if (JSON.stringify(preLastFontOptions) == JSON.stringify(curFirstFontOptions)) {
    const newSelection = [selectionStr2Arr(preLastSelection)[0], selectionStr2Arr(curFirstSelection)[1]].join('-')
    const newOptions = preLastFontOptions
    delete preRange[preLastSelection]
    delete curRange[curFirstSelection]
    newRange = {
      [newSelection]: newOptions,
    }
  }
  return {
    ...preRange,
    ...newRange,
    ...curRange,
  }
}

export const getOverlapSelection = (sel1: Selection, sel2: Selection): Selection | null => {
  const selection1 = selectionStr2Arr(sel1)
  const selection2 = selectionStr2Arr(sel2)
  const interSelection = [Math.max(selection1[0], selection2[0]), Math.min(selection1[1], selection2[1])]

  if (interSelection[1] < interSelection[0]) {
    return null
  }
  return interSelection.join('-') as Selection
}

export const isZeroSelection = (sel: Selection) => {
  const selection = selectionStr2Arr(sel)
  return selection[1] - selection[0] === 0
}

export const hasOverlap = (sel1: Selection, sel2: Selection) => {
  const interSelection = getOverlapSelection(sel1, sel2) as Selection
  return !!interSelection
}

export const getDifferSelection = (sel1: Selection, sel2: Selection) => {
  let overlap: Selection | number[] | null = getOverlapSelection(sel1, sel2)
  let res: Selection[]
  if (overlap) {
    overlap = selectionStr2Arr(overlap)
    const selection1 = selectionStr2Arr(sel1)

    if (selection1[0] < overlap[0] && overlap[1] < selection1[1]) {
      res = [[selection1[0], overlap[0]].join('-'), [overlap[1], selection1[1]].join('-')] as Selection[]
    } else if (overlap[0] > selection1[0] && overlap[1] === selection1[1]) {
      res = [[selection1[0], overlap[0]].join('-')] as Selection[]
    } else if (overlap[0] === selection1[0] && overlap[1] < selection1[1]) {
      if (overlap[0] == overlap[1]) {
        res = [[overlap[1] + 1, selection1[1]].join('-')] as Selection[]
      } else {
        res = [[overlap[1], selection1[1]].join('-')] as Selection[]
      }
    } else {
      res = []
    }
  } else {
    res = [sel1] as Selection[]
  }
  return res
}

export const getCursorLocation = (node: CanvasNode, location: Point): number => {
  const options = node.options as RenderTextOptions
  const textContentBox = options.contentBox
  let cursorLocation: number = 0
  const pLength = options.paragrahsIndex.length
  const rLength = options.rowsIndex.length
  for (const pOptions of Object.values(options.paragrahs)) {
    //将相应区域扩散到节点框边界
    const diffusionPLocation: Point = {
      x: 0,
      y:
        pOptions.paragrahIndex == 0
          ? 0
          : textContentBox.location.y + pOptions.contentBox.location.y + BOXPADDING + BOXMARGIN,
      w: 1,
    }
    const diffusionPSize = {
      width: node.structure.contentBox.size.width + 2 * (BOXPADDING + BOXMARGIN),
      height:
        pOptions.paragrahIndex == 0
          ? pOptions.contentBox.size.height +
            textContentBox.location.y +
            pOptions.contentBox.location.y +
            BOXPADDING +
            BOXMARGIN
          : pOptions.paragrahIndex == pLength - 1
            ? node.structure.contentBox.size.height -
              textContentBox.location.y -
              pOptions.contentBox.location.y +
              BOXPADDING +
              BOXMARGIN
            : pOptions.contentBox.size.height,
    }

    if (cursorInPath(location, convertLocation2Path(diffusionPLocation, diffusionPSize))) {
      for (const [rSelection, rOptions] of Object.entries(pOptions.rows)) {
        const diffusionRLocation: Point = {
          x: 0,
          y:
            rOptions.rowIndex == 0
              ? 0
              : textContentBox.location.y +
                pOptions.contentBox.location.y +
                rOptions.contentBox.location.y +
                +BOXPADDING +
                BOXMARGIN,
          w: 1,
        }
        const diffusionRSize = {
          width: node.structure.contentBox.size.width + 2 * (BOXPADDING + BOXMARGIN),
          height:
            rOptions.rowIndex == 0
              ? rOptions.contentBox.size.height +
                textContentBox.location.y +
                pOptions.contentBox.location.y +
                rOptions.contentBox.location.y +
                BOXPADDING +
                BOXMARGIN
              : rOptions.rowIndex == rLength - 1
                ? node.structure.contentBox.size.height -
                  textContentBox.location.y -
                  pOptions.contentBox.location.y -
                  rOptions.contentBox.location.y +
                  BOXPADDING +
                  BOXMARGIN
                : rOptions.contentBox.size.height,
        }
        if (cursorInPath(location, convertLocation2Path(diffusionRLocation, diffusionRSize))) {
          let walkedWidth = textContentBox.location.x + pOptions.contentBox.location.x + rOptions.contentBox.location.x
          const rEndeIndex = selectionStr2Arr(rSelection as Selection)[1]

          seek: for (const [fselection, fOptions] of Object.entries(rOptions.font)) {
            const [startIndex, endIndex] = selectionStr2Arr(fselection as Selection)

            for (let i = startIndex; i < endIndex; i++) {
              const restWidth = location.x - walkedWidth

              if (
                restWidth < fOptions.characterWidth[i - startIndex] ||
                (i === rEndeIndex - 1 && restWidth >= fOptions.characterWidth[i - startIndex])
              ) {
                cursorLocation = restWidth < fOptions.characterWidth[i - startIndex] / 2 ? i : i + 1
                break seek
              } else {
                walkedWidth += fOptions.characterWidth[i - startIndex]
              }
            }
          }
        }
      }
    }
  }
  return cursorLocation
}

export const getCursorPIndex = (node: CanvasNode, location: Point): number => {
  const options = node.options as RenderTextOptions
  const textContentBox = options.contentBox
  let cursorPIndex: number = 0
  const pLength = options.paragrahsIndex.length

  for (const [pSelection, pOptions] of Object.entries(options.paragrahs)) {
    //将相应区域扩散到节点框边界
    const diffusionPLocation: Point = {
      x: 0,
      y:
        pOptions.paragrahIndex == 0
          ? 0
          : textContentBox.location.y + pOptions.contentBox.location.y + BOXPADDING + BOXMARGIN,
      w: 1,
    }
    const diffusionPSize = {
      width: node.structure.contentBox.size.width + 2 * (BOXPADDING + BOXMARGIN),
      height:
        pOptions.paragrahIndex == 0
          ? pOptions.contentBox.size.height +
            textContentBox.location.y +
            pOptions.contentBox.location.y +
            BOXPADDING +
            BOXMARGIN
          : pOptions.paragrahIndex == pLength - 1
            ? node.structure.contentBox.size.height -
              textContentBox.location.y -
              pOptions.contentBox.location.y +
              BOXPADDING +
              BOXMARGIN
            : pOptions.contentBox.size.height,
    }

    if (cursorInPath(location, convertLocation2Path(diffusionPLocation, diffusionPSize))) {
      cursorPIndex = options.paragrahsIndex.findIndex((s) => pSelection === s)
    }
  }
  return cursorPIndex
}

//相对于包围盒的位置
export const getRelativeLocBounding = (cursorLocation: Point, node: CanvasNode): Point => {
  return {
    x: Math.min(
      Math.max(0, cursorLocation.x - node.structure.contentBox.location.x + BOXPADDING),
      node.structure.contentBox.size.width + BOXPADDING * 2,
    ),
    y: Math.min(
      Math.max(0, cursorLocation.y - node.structure.contentBox.location.y + BOXPADDING),
      node.structure.contentBox.size.height + BOXPADDING * 2,
    ),
    w: 1,
  }
}
