import { BaseCamera, BaseCameraOptions } from "./BaseCamera.js";
import Matrix4 from "@/foundation/math/Matrix4";
import Point3 from "@/foundation/math/Point3";
import { CameraType } from "@/foundation/constants";

export interface OrthographicCameraOptions extends BaseCameraOptions {
  left?: number;
  right?: number;
  bottom?: number;
  top?: number;
  near?: number;
  far?: number;
}

/**
 * 2D 正交相机
 *
 * 坐标语义：
 *   - left/right/top/bottom 描述当前视口在世界坐标中可见的范围
 *   - 相机边界大小 = 画布逻辑分辨率，缩放通过改变边界跨度实现
 *
 * VP 矩阵语义：
 *   世界坐标 → 画布逻辑像素坐标（可直接传给 ctx.setTransform）
 *
 * 视图矩阵（V）：
 *   将世界坐标变换到相机局部坐标。2D 场景下 eye 位于视口中心正上方俯视 XY 平面，
 *   退化为 Translation(-centerX, -centerY, -1)。未来支持相机旋转/倾斜时
 *   替换为完整 lookAt 或 TRS 逆矩阵即可。
 *
 * 投影矩阵（P）：
 *   标准正交投影，将相机空间 [-halfW, halfW] × [-halfH, halfH] 映射到
 *   画布像素空间 [0, width] × [0, height]。
 *   P = ViewportTransform × Orthographic
 *
 * 坐标转换：
 *   相机只在画布逻辑空间中工作，不关心屏幕 DOM 坐标。
 *   屏幕坐标（clientX/Y）到世界坐标的完整转换由 cameraUtils 负责。
 */
export class OrthographicCamera extends BaseCamera {
  public readonly type: CameraType = CameraType.ORTHOGRAPHIC;
  private _left: number;
  private _right: number;
  private _bottom: number;
  private _top: number;

  constructor(options: OrthographicCameraOptions = {}) {
    super(options);

    this._left = options.left ?? -10;
    this._right = options.right ?? 10;
    this._bottom = options.bottom ?? 10;
    this._top = options.top ?? -10;

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

  // ── 矩阵更新 ──

  /**
   * V 矩阵：将世界坐标变换到相机局部坐标（以相机位置为原点）。
   *
   * 2D 正交相机俯视 XY 平面，纯平移：
   *   V = Translation(-centerX, -centerY, 0)
   *
   * z 分量保持为 0，确保 VP 矩阵在 2D 场景中不引入非零 z 值。
   *
   * 扩展性：未来若需支持相机旋转/倾斜，将此处替换为完整的
   * lookAt 或 TRS 逆矩阵即可，下游 VP 矩阵语义不变。
   */
  protected override updateViewMatrix(): void {
    const centerX = (this._left + this._right) / 2;
    const centerY = (this._top + this._bottom) / 2;
    this._viewMatrix = Matrix4.translation(-centerX, -centerY, 0);
  }

  /**
   * P 矩阵：标准正交投影。
   *
   * 将相机空间（以相机为中心的局部坐标）映射到画布像素空间 [0, width] × [0, height]。
   *
   * 相机空间范围：x ∈ [-halfW, halfW], y ∈ [-halfH, halfH]
   * 目标空间范围：x ∈ [0, width], y ∈ [0, height]
   *
   * 标准正交投影将 [l,r]×[b,t] 映射到 [-1,1]×[-1,1]（NDC），
   * 再通过 viewport transform 映射到 [0,w]×[0,h]：
   *
   *   Viewport = | w/2   0    0   w/2 |
   *              |  0   h/2   0   h/2 |
   *              |  0    0   1/2  1/2 |
   *              |  0    0    0    1  |
   *
   *   Ortho    = | 2/w   0    0    0  |
   *              |  0   2/h   0    0  |
   *              |  0    0   ...  ... |
   *              |  0    0    0    1  |
   *
   *   P = Viewport × Ortho = | 1  0  0  w/2 |
   *                           | 0  1  0  h/2 |
   *                           | 0  0  *   *  |
   *                           | 0  0  0   1  |
   *
   * 即 P 退化为 Translation(halfW, halfH, 0)。
   * 这里使用标准公式求解，保证未来引入缩放/非对称视锥时自动正确。
   */
  protected override updateProjectionMatrix(): void {
    const width = this._right - this._left;
    const height = this._bottom - this._top;
    const halfW = width / 2;
    const halfH = height / 2;

    // 2D 正交投影：相机空间 [-halfW, halfW] × [-halfH, halfH] → 画布逻辑像素 [0, width] × [0, height]
    //
    // 对于纯 2D 引擎，P = Viewport × Ortho 在 x/y 上退化为 Translation(halfW, halfH)：
    //   x_logical = x_camera + halfW
    //   y_logical = y_camera + halfH
    //
    // z 行保持恒等映射（z_out = z_in），避免 near/far 深度变换引入异常 z 分量，
    // 确保 VP 逆矩阵不会在 2D 交互中产生非零 z 值。
    this._projectionMatrix = Matrix4.translation(halfW, halfH, 0);
  }

  // ── 序列化 ──

  override toJSON(): any {
    return {
      ...super.toJSON(),
      left: this._left,
      right: this._right,
      bottom: this._bottom,
      top: this._top,
      near: this._near,
      far: this._far,
    };
  }

  static fromJSON(data: any): OrthographicCamera {
    return new OrthographicCamera({
      position: data.position ? Point3.fromJSON(data.position) : undefined,
      target: data.target ? Point3.fromJSON(data.target) : undefined,
      left: data.left,
      right: data.right,
      bottom: data.bottom,
      top: data.top,
      near: data.near,
      far: data.far,
    });
  }

  copy(): OrthographicCamera {
    return new OrthographicCamera({
      position: this._position.copy(),
      target: this._target.copy(),
      up: this._up.copy(),
      left: this._left,
      right: this._right,
      bottom: this._bottom,
      top: this._top,
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
