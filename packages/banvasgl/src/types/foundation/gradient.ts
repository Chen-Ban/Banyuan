/**
 * 平台无关的渐变资源接口（引擎自有类型）
 *
 * 引擎通过 IDrawingContext.createLinearGradient/createRadialGradient/createConicGradient
 * 获取 IGradient 实例，调用 addColorStop 设置渐变色标后赋值给 ctx.fillStyle/strokeStyle。
 * 平台适配器负责实现（Web: CanvasGradient, Skia: SkShader 等）。
 */
export interface IGradient {
  addColorStop(offset: number, color: string): void;
}
