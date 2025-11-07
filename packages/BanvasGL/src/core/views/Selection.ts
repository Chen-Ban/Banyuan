import { Rectangle } from "../graph/combined/Polygon";

/**
 * 选择区域类 - 管理文本选择状态
 */
export default class Selection {
  private selectionBoxs: Rectangle[];

  constructor() {
    this.selectionBoxs = [];
  }

  /**
   * 设置选择框
   */
  public setSelectionBoxs(boxes: Rectangle[]): void {
    this.selectionBoxs = [...boxes];
  }

  /**
   * 渲染选择区域
   */
  public render(ctx: CanvasRenderingContext2D): void {
    if (this.selectionBoxs.length === 0) {
      return;
    }

    ctx.save();
    ctx.fillStyle = "rgba(0, 123, 255, .5)"; // 半透明蓝色
    ctx.lineWidth = 1;

    this.selectionBoxs.forEach((box) => {
      const topLeft = box.getTopLeft();
      ctx.fillRect(topLeft.x, topLeft.y, box.width, box.height);
    });

    ctx.restore();
  }

  /**
   * 获取选择框数组
   */
  public getSelectionBoxs(): Rectangle[] {
    return [...this.selectionBoxs];
  }

  /**
   * 清空选择
   */
  public clear(): void {
    this.selectionBoxs = [];
  }

  /**
   * 检查是否有选择
   */
  public hasSelection(): boolean {
    return this.selectionBoxs.length > 0;
  }
}
