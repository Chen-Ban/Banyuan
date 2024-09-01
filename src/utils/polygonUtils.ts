import { Path, Vector, Point } from 'store/types/Template.type'
import { computeMagnitude, computeIntersectionPoint, computeUnitVector } from './vectorUtils'
/**
 * 从质心出发，连接每个点然后拓展出去
 * @param path 多边形路径
 * @param offset 点和质心连线的倍数
 * @returns 偏移后的路径
 */
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
/**
 * 从质心出发，连接每个点然后拓展出去
 * @param path 多边形路径
 * @param offset 点和质心连线的偏移常量距离
 * @returns 偏移后的路径
 */
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

/**
 * 从边线出发偏移固定距离形成的直线集合
 * @param path 路径
 * @param offset 偏移
 * @returns 偏移路径
 */
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
    lines.push([offsetLocation, offsetNexLocation])
  }
  return lines
}

/**
 * 从每条边的中垂线向外偏移
 * @param path 多边形路径
 * @param offset 偏移距离
 * @returns 偏移后路径
 * @description 根据内容框路径形成包围框路径（1，计算边的偏移；2，计算边的交点形成路径）
 */
export const computePathByEdgeOffset = (path: Path, offset: number): Path => {
  const liens = generateLinesByOffset(path, offset)
  const linesLen = liens.length

  const edgeOffsetPath: Path = []
  for (let i = linesLen - 1; i < linesLen * 2 - 1; i++) {
    edgeOffsetPath.push(computeIntersectionPoint(liens[i % linesLen], liens[(i + 1) % linesLen]))
  }

  return edgeOffsetPath
}

/**
 * 计算质心坐标
 * @param path 多边形路径
 * @returns 质心坐标
 */
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

/**
 * 求一段路径的所有线段
 * @param path 路径
 * @returns 该路径的线段
 */
export const getLinesOfPath = (path: Path): Path[] => {
  const len = path.length
  const lines: Path[] = []
  for (let i = 0; i < len; i++) {
    const location = path[i]
    const nextLocation = path[(i + 1) % len]
    lines.push([location, nextLocation])
  }
  return lines
}
