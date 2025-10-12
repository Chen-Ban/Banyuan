import { Matrix4, Point3 } from "../core"
export const event2Point = (e: MouseEvent):Point3=> {
    return new Point3(e.offsetX,e.offsetY,0)
}

export const world2Relative = (p:Point3, matrix:Matrix4):Point3 =>{
    return matrix.inverse().multiply(p)
}