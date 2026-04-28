export default class Vector3 {
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
  get length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  get normalized(): Vector3 {
    const length = this.length;
    if (length === 0) return new Vector3(0, 0, 0);
    return new Vector3(this.x / length, this.y / length, this.z / length);
  }
  add(v: Vector3): Vector3 {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }
  scale(s: number): Vector3 {
    return new Vector3(this.x * s, this.y * s, this.z * s);
  }
  subtract(v: Vector3): Vector3 {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }
  inverse(): Vector3 {
    return new Vector3(-this.x, -this.y, -this.z);
  }
  dot(v: Vector3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }
  cross(v: Vector3): Vector3 {
    return new Vector3(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x);
  }
  copy(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }
  toString(): string {
    return `(${this.x},${this.y},${this.z})`;
  }
}
