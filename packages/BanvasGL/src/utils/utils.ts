import { Point3 } from "../core"
export const event2Point = (e: MouseEvent):Point3=> {
    return new Point3(e.offsetX,e.offsetY,0)
}