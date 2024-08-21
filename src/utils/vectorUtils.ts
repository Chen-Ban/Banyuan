import { Vector, Path, Point } from 'store/types/Template.type'
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
//计算两直线交点
export const computeIntersectionPoint = (line1: Path, line2: Path): Point => {
  if (line1.length != 2 || line2.length != 2) {
    throw Error('只能用两个点表示一条直线')
  }
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
