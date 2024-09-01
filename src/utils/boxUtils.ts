import { Point, Size, Path, ResizeDirection, Vector, zeroVector } from 'store/types/Template.type'
import { RESIZERECTSIZE, BOXPADDING } from 'constants/CanvasRendering'
import { computeCentroidByPath, computePathByEdgeOffset } from './polygonUtils'
import { isPointInPath } from './pointUtil'
/**
 * 将矩形左上角和矩形尺寸形成矩形路径
 * @param location 矩形左上角
 * @param size 矩形尺寸
 * @returns 矩形路径
 */
export const generateBoxPath = (location: Point, size: Size): Path => {
  return [
    { ...location },
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

//计算缩放块位置
export const computeActiveResizeRectPos = (path: Path, resizeRectSize: number = RESIZERECTSIZE): Point[] => {
  const halfResizeRectSize = resizeRectSize / 2
  const pathLength = path.length
  const resizeRectPos: Point[] = Array.from({ length: pathLength * 2 }, () => ({
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

//获取resize方向
export const getResizeDirection = (
  cursorLocation: Point,
  path: Path,
  padding: number = BOXPADDING,
  resizeRectSize: number = RESIZERECTSIZE,
): ResizeDirection => {
  switch (getResizeBlockIndex(cursorLocation, path, padding, resizeRectSize)) {
    //反斜线
    case 0:
      return ResizeDirection.BACKSLASH_NW
    case 4:
      return ResizeDirection.BACKSLASH_SE
    //竖直线
    case 1:
      return ResizeDirection.VERTICAL_N
    case 5:
      return ResizeDirection.VERTICAL_S
    //斜线
    case 2:
      return ResizeDirection.SLASH_NE
    case 6:
      return ResizeDirection.SLASH_SW
    //水平线
    case 3:
      return ResizeDirection.HORIZONTAL_E
    case 7:
      return ResizeDirection.HORIZONTAL_W
    default:
      return ResizeDirection.NONE
  }
}
//获取resize的控制点,分别是选中的动点和对立的静止点
export const getResizeControllLocation = (
  cursorLocation: Point,
  path: Path,
  padding: number = BOXPADDING,
  resizeRectSize: number = RESIZERECTSIZE,
): [Point, Point] => {
  switch (getResizeBlockIndex(cursorLocation, path, padding, resizeRectSize)) {
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
export const getResizeBlockIndex = (
  cursorLocation: Point,
  path: Path,
  padding: number = BOXPADDING,
  resizeRectSize: number = RESIZERECTSIZE,
) => {
  const boundingBoxPath = computePathByEdgeOffset(path, padding)
  const resizeRectPos = computeActiveResizeRectPos(boundingBoxPath, resizeRectSize)
  return resizeRectPos.findIndex((location) =>
    isPointInPath(cursorLocation, generateBoxPath(location, { width: resizeRectSize, height: resizeRectSize })),
  )
}

export const computeLocAndSizeOffsetOnResizing = ({
  cursorLocation, //当前位置
  lastMousemoveLocation, //上次位置
  resizeDirection, //最开始位置
  referenceVec, //最开始节点contentBox路径
}: {
  cursorLocation: Point
  lastMousemoveLocation: Point
  resizeDirection: ResizeDirection
  referenceVec: Vector
}) => {
  //移动向量
  const moveVec: Vector = {
    x: cursorLocation.x - lastMousemoveLocation.x,
    y: cursorLocation.y - lastMousemoveLocation.y,
    w: 0,
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
        y: moveVec.y,
      }
      sizeOffset = {
        ...zeroVector,
        y: Math.abs(moveVec.y) * Math.sign(moveVec.y * referenceVec.y),
      }
      break
    case ResizeDirection.VERTICAL_S:
      locationOffset = zeroVector
      sizeOffset = {
        ...zeroVector,
        y: Math.abs(moveVec.y) * Math.sign(moveVec.y * referenceVec.y),
      }
      break
    case ResizeDirection.SLASH_NE:
      locationOffset = zeroVector
      sizeOffset = {
        ...zeroVector,
        x: Math.abs(moveVec.x) * Math.sign(moveVec.x * referenceVec.x),
        y: Math.abs(moveVec.y) * Math.sign(moveVec.y * referenceVec.y),
      }
      break
    case ResizeDirection.HORIZONTAL_E:
      locationOffset = zeroVector
      sizeOffset = {
        ...zeroVector,
        x: Math.abs(moveVec.x) * Math.sign(moveVec.x * referenceVec.x),
      }
      break
    case ResizeDirection.HORIZONTAL_W:
      locationOffset = { ...zeroVector, x: moveVec.x }
      sizeOffset = {
        ...zeroVector,
        x: Math.abs(moveVec.x) * Math.sign(moveVec.x * referenceVec.x),
      }
      break
    case ResizeDirection.BACKSLASH_SE:
      locationOffset = zeroVector
      sizeOffset = {
        ...zeroVector,
        x: Math.abs(moveVec.x) * Math.sign(moveVec.x * referenceVec.x),
        y: Math.abs(moveVec.y) * Math.sign(moveVec.y * referenceVec.y),
      }
      break
    case ResizeDirection.SLASH_SW:
      locationOffset = { ...zeroVector, x: moveVec.x }
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
