import { Point, Size, Path, ResizeDirection, Vector, zeroVector } from 'store/types/Template.type'
import { RESIZERECTSIZE, BOXPADDING, RESIZERECTSIZE_RESPONSE } from 'constants/index'
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
    isPointInPath(
      cursorLocation,
      generateBoxPath(location, { width: RESIZERECTSIZE_RESPONSE, height: RESIZERECTSIZE_RESPONSE }),
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
