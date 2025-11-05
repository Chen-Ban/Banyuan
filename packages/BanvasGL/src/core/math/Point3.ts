import Vector3 from "./Vector3";

export default class Point3 {
  private transform: Float32Array;
  constructor(x: number, y: number, z: number) {
    this.transform = new Float32Array(3);
    this.transform[0] = x;
    this.transform[1] = y;
    this.transform[2] = z;
  }
  get x(): number {
    return this.transform[0];
  }
  get y(): number {
    return this.transform[1];
  }
  get z(): number {
    return this.transform[2];
  }
  add(v: Vector3): Point3 {
    this.transform[0] += v.x;
    this.transform[1] += v.y;
    this.transform[2] += v.z;
    return this;
  }
  subtract(p: Point3): Vector3 {
    return new Vector3(this.x - p.x, this.y - p.y, this.z - p.z);
  }
  copy(): Point3 {
    return new Point3(this.x, this.y, this.z);
  }
}
