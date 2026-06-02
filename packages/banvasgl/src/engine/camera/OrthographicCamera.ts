import { BaseCamera, BaseCameraOptions } from "./BaseCamera.js";
import Matrix4 from "@/foundation/math/Matrix4";
import { Point3 } from "@/foundation/math/index.js";
import { CameraType } from "@/foundation/constants";

export interface OrthographicCameraOptions extends BaseCameraOptions {
  left?: number;
  right?: number;
  bottom?: number;
  top?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  // 为后续 3D 正交相机做准备，允许配置近远裁剪平面
  near?: number;
  far?: number;
}

/**
 * 2D 正交相机
 *
 * 坐标语义：
 *   - left/right/top/bottom 描述当前视口在世界坐标中可见的范围
 *   - canvasWidth/canvasHeight 是画布的逻辑像素尺寸（CSS 像素，非物理像素）
 *
 * VP 矩阵语义：
 *   世界坐标 → 画布逻辑像素坐标（可直接传给 ctx.setTransform）
 *
 * 投影矩阵（P）：
 *   将 [left, right] × [top, bottom] 线性映射到 [0, canvasWidth] × [0, canvasHeight]
 *   P = Translation(-left * sx, -top * sy, 0) × Scaling(sx, sy, 1)
 *   其中 sx = canvasWidth / (right - left)，sy = canvasHeight / (bottom - top)
 *
 * 视图矩阵（V）：
 *   2D 场景中相机始终俯视 XY 平面，V = Identity
 */
export class OrthographicCamera extends BaseCamera {
  public readonly type: CameraType = CameraType.ORTHOGRAPHIC;
  private _left: number;
  private _right: number;
  private _bottom: number;
  private _top: number;
  private _canvasWidth: number;
  private _canvasHeight: number;

  constructor(options: OrthographicCameraOptions = {}) {
    super(options);

    this._left = options.left ?? -10;
    this._right = options.right ?? 10;
    this._bottom = options.bottom ?? 10;
    this._top = options.top ?? -10;
    this._canvasWidth = options.canvasWidth ?? (this._right - this._left);
    this._canvasHeight = options.canvasHeight ?? (this._bottom - this._top);

    if (options.near != null) this._near = options.near;
    if (options.far != null) this._far = options.far;

    this.updateMatrices();
  }

  // ── 边界 ──

  get left(): number { return this._left; }
  set left(value: number) { this._left = value; this._dirty = true; }

  get right(): number { return this._right; }
  set right(value: number) { this._right = value; this._dirty = true; }

  get bottom(): number { return this._bottom; }
  set bottom(value: number) { this._bottom = value; this._dirty = true; }

  get top(): number { return this._top; }
  set top(value: number) { this._top = value; this._dirty = true; }

  setBounds(left: number, right: number, bottom: number, top: number): this {
    this._left = left;
    this._right = right;
    this._bottom = bottom;
    this._top = top;
    this._dirty = true;
    return this;
  }

  getBounds(): { left: number; right: number; bottom: number; top: number } {
    return { left: this._left, right: this._right, bottom: this._bottom, top: this._top };
  }

  // ── 画布尺寸（由 Renderer.resize 同步）──

  /**
   * 设置画布逻辑像素尺寸，触发 VP 矩阵重算。
   * 应在 Renderer.resize 时调用。
   */
  setCanvasSize(width: number, height: number): this {
    this._canvasWidth = width;
    this._canvasHeight = height;
    this._dirty = true;
    return this;
  }

  getCanvasSize(): { width: number; height: number } {
    return { width: this._canvasWidth, height: this._canvasHeight };
  }

  // ── 视口尺寸（实现基类抽象方法）──

  getSize(): { width: number; height: number } {
    return { width: this._right - this._left, height: this._bottom - this._top };
  }

  getViewportSize(): { width: number; height: number } {
    return this.getSize();
  }

  get aspect(): number {
    return (this._right - this._left) / (this._bottom - this._top);
  }

  // ── 视口操作 ──

  /**
   * 设置视口尺寸（保持中心点不变）。
   * 注意：此方法只改变 left/right/top/bottom，不改变 canvasWidth/Height。
   */
  setViewportSize(width: number, height: number): this {
    const centerX = (this._left + this._right) / 2;
    const centerY = (this._top + this._bottom) / 2;
    this._left = centerX - width / 2;
    this._right = centerX + width / 2;
    this._top = centerY - height / 2;
    this._bottom = centerY + height / 2;
    this._dirty = true;
    return this;
  }

  setAspect(aspect: number): this {
    const centerX = (this._left + this._right) / 2;
    const height = this._bottom - this._top;
    const width = height * aspect;
    this._left = centerX - width / 2;
    this._right = centerX + width / 2;
    this._dirty = true;
    return this;
  }

  zoom(factor: number): this {
    const centerX = (this._left + this._right) / 2;
    const centerY = (this._top + this._bottom) / 2;
    const width = (this._right - this._left) * factor;
    const height = (this._bottom - this._top) * factor;
    this._left = centerX - width / 2;
    this._right = centerX + width / 2;
    this._top = centerY - height / 2;
    this._bottom = centerY + height / 2;
    this._dirty = true;
    return this;
  }

  pan(deltaX: number, deltaY: number): this {
    this._left += deltaX;
    this._right += deltaX;
    this._top += deltaY;
    this._bottom += deltaY;
    this._dirty = true;
    return this;
  }

  fitToBounds(
    bounds: { left: number; right: number; bottom: number; top: number },
    padding: number = 0,
  ): this {
    const contentWidth = bounds.right - bounds.left;
    const contentHeight = bounds.bottom - bounds.top;
    const contentCenterX = (bounds.left + bounds.right) / 2;
    const contentCenterY = (bounds.top + bounds.bottom) / 2;
    const viewportWidth = contentWidth + padding * 2;
    const viewportHeight = contentHeight + padding * 2;
    this._left = contentCenterX - viewportWidth / 2;
    this._right = contentCenterX + viewportWidth / 2;
    this._top = contentCenterY - viewportHeight / 2;
    this._bottom = contentCenterY + viewportHeight / 2;
    this._dirty = true;
    return this;
  }

  // ── 视口边界 ──

  getViewportBounds(): { left: number; right: number; bottom: number; top: number } {
    return { left: this._left, right: this._right, bottom: this._bottom, top: this._top };
  }

  // ── 可见性检测 ──

  isPointInViewport(point: [number, number, number]): boolean {
    return (
      point[0] >= this._left && point[0] <= this._right &&
      point[1] >= this._top && point[1] <= this._bottom
    );
  }

  isRectInViewport(rect: { left: number; right: number; bottom: number; top: number }): boolean {
    return !(
      rect.right < this._left ||
      rect.left > this._right ||
      rect.bottom < this._top ||
      rect.top > this._bottom
    );
  }

  // ── 坐标转换 ──

  /**
   * 屏幕像素坐标 → 世界坐标
   *
   * 直接对 VP 矩阵求逆后乘以屏幕坐标点，无需 NDC 中间步骤。
   * screenX/Y 是相对于 canvas 左上角的逻辑像素坐标。
   */
  screenToWorld(screenX: number, screenY: number): [number, number, number] {
    if (this._dirty) this.updateMatrices();
    const invVP = this._viewProjectionMatrix.inverse();
    const world = invVP.multiply(new Point3(screenX, screenY, 0));
    return [world.x, world.y, world.z];
  }

  /**
   * 世界坐标 → 屏幕像素坐标
   *
   * 直接用 VP 矩阵变换世界坐标点，输出画布逻辑像素坐标。
   */
  worldToScreen(worldX: number, worldY: number): [number, number] {
    if (this._dirty) this.updateMatrices();
    const screen = this._viewProjectionMatrix.multiply(new Point3(worldX, worldY, 0));
    return [screen.x, screen.y];
  }

  // ── 矩阵更新 ──

  /**
   * V 矩阵：2D 正交场景中相机始终俯视 XY 平面，无需 lookAt 变换。
   */
  protected override updateViewMatrix(): void {
    this._viewMatrix = Matrix4.identity();
  }

  /**
   * P 矩阵：将世界坐标 [left, right] × [top, bottom] 映射到画布像素 [0, W] × [0, H]
   *
   * 推导：
   *   screenX = (worldX - left) / (right - left) * canvasWidth
   *           = worldX * sx + (-left * sx)   其中 sx = canvasWidth / (right - left)
   *   screenY = (worldY - top) / (bottom - top) * canvasHeight
   *           = worldY * sy + (-top * sy)    其中 sy = canvasHeight / (bottom - top)
   *
   * 用已有工具函数组合：P = Translation(tx, ty, 0) × Scaling(sx, sy, 1)
   */
  protected override updateProjectionMatrix(): void {
    const sx = this._canvasWidth / (this._right - this._left);
    const sy = this._canvasHeight / (this._bottom - this._top);
    const tx = -this._left * sx;
    const ty = -this._top * sy;
    // Translation × Scaling：先缩放再平移
    this._projectionMatrix = Matrix4.translation(tx, ty, 0).multiply(Matrix4.scaling(sx, sy, 1));
  }

  // ── 序列化 ──

  override toJSON(): any {
    return {
      ...super.toJSON(),
      left: this._left,
      right: this._right,
      bottom: this._bottom,
      top: this._top,
      canvasWidth: this._canvasWidth,
      canvasHeight: this._canvasHeight,
      near: this._near,
      far: this._far,
    };
  }

  static fromJSON(data: any): OrthographicCamera {
    return new OrthographicCamera({
      position: data.position,
      target: data.target,
      up: data.up,
      left: data.left,
      right: data.right,
      bottom: data.bottom,
      top: data.top,
      canvasWidth: data.canvasWidth,
      canvasHeight: data.canvasHeight,
      near: data.near,
      far: data.far,
    });
  }

  copy(): OrthographicCamera {
    return new OrthographicCamera({
      position: [this._position.x, this._position.y, this._position.z],
      target: [this._target.x, this._target.y, this._target.z],
      up: [this._up.x, this._up.y, this._up.z],
      left: this._left,
      right: this._right,
      bottom: this._bottom,
      top: this._top,
      canvasWidth: this._canvasWidth,
      canvasHeight: this._canvasHeight,
      near: this._near,
      far: this._far,
    });
  }

  override reset(): this {
    super.reset();
    this._left = -10;
    this._right = 10;
    this._top = -10;
    this._bottom = 10;
    this._dirty = true;
    return this;
  }
}
