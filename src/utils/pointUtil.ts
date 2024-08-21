import { Path, Point, Box } from 'store/types/Template.type'

//TODO: 重构成类，方便加入坐标系信息（坐标的基向量和坐标系的偏移）来做相对位置计算

/**
 * 点和相同坐标系下的路径的关系
 * @param cursorLocation 鼠标点
 * @param path 路径
 * @returns 鼠标点满足callback
 * @description 利用右手螺旋和叉乘
 */
const pointCrossWithPath = (
  cursorLocation: Point,
  path: Box['path'],
  callback: (crossRes: number[]) => boolean,
): boolean => {
  const crossRes = []
  const verCount = path.length
  for (const [i, currentPoint] of path.entries()) {
    //生成边向量i
    const nextPoint = path[(i + 1) % verCount]
    const edgeVec = {
      x: nextPoint.x - currentPoint.x,
      y: nextPoint.y - currentPoint.y,
    }
    //生成边起点到鼠标位置的向量j
    const curVec = {
      x: cursorLocation.x - currentPoint.x,
      y: cursorLocation.y - currentPoint.y,
    }
    //做叉乘j×i缓存结果到crossRes
    crossRes.push(curVec.x * edgeVec.y - curVec.y * edgeVec.x)
  }
  return callback(crossRes)
}
const inPath = (crossRes: number[]): boolean => {
  return crossRes.every((cro) => cro < 0)
}
const onPath = (crossRes: number[]): boolean => {
  return crossRes.some((cro) => cro === 0)
}
const outOath = (crossRes: number[]): boolean => {
  return crossRes.some((cro) => cro > 0)
}
export const isPointInPath = (cursorLocation: Point, path: Path) => {
  return pointCrossWithPath(cursorLocation, path, inPath)
}
export const isPointOnPath = (cursorLocation: Point, path: Path) => {
  return pointCrossWithPath(cursorLocation, path, onPath)
}
export const isPointOutPath = (cursorLocation: Point, path: Path) => {
  return pointCrossWithPath(cursorLocation, path, outOath)
}

/**
 * 是否是同一点
 * @param p1 点1
 * @param p2 点2
 * @returns 是否是同一点
 */
export const isSamePoint = (p1: Point, p2: Point): boolean => {
  return p1.x === p2.x && p1.y === p2.y
}

/**
 * 点1相对于点2的相对坐标(要求为同一坐标系下)
 * @param p1 点1
 * @param p2 点2
 * @returns 点1相对于点2 的相对坐标
 */
export const computeRelativePoint = (p1: Point, p2: Point): Point => {
  return {
    x: p1.x - p2.x,
    y: p1.x - p2.x,
    w: 1,
  }
}
