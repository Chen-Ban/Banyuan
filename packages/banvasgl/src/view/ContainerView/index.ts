/**
 * ContainerView —— 拥有子节点管理能力的容器视图抽象类
 *
 * 只有需要管理子 View 的视图类型（CombinedView、NodeView）继承此类。
 * 叶子视图（GraphView、TextView 等）直接继承 View，不持有 children。
 *
 * 职责：
 *   - 持有 children 数组
 *   - 提供 addChild / removeChild / clear 方法
 *   - override performLayout 布局内容 + 子容器
 *   - 提供 measureChildren 计算子节点联合包围盒
 *   - override onAttach 递归触发子节点生命周期
 *   - override resize 递归 resize 子节点
 *   - override setVPMatrix 递归广播 VP 矩阵
 *   - override renderChildren 渲染子节点列表
 *   - override interactChildren 递归命中检测子节点
 *   - override toJSON 序列化 children 字段
 *   - override onDestroy 以递归销毁子节点
 *   - override restoreCommonFields 以恢复 children
 */

import View from '@/view/View/View.js'
import type { IContainerView, IFieldSchemaMap, IContainerViewOptions, IInteractResult } from '@/types/view/view'
import { Rectangle } from '@/graph/combined/Polygon/index.js'
import Bounds from '@/graph/base/Bounds.js'
import type Matrix4 from '@/foundation/math/Matrix4.js'
import type { IDrawingContext, IDrawingGradient, IDrawingPattern } from "@/types/platform/drawing.js";
import type { ICanvasHost } from "@/types/platform/host.js";
import { Point3, Vector3 } from '@/foundation/math/index.js'

export default abstract class ContainerView<D extends IFieldSchemaMap = IFieldSchemaMap>
    extends View<D>
    implements IContainerView
{
    private _children: View[] = []

    /**
     * 返回子视图数组。
     * 覆盖基类的空实现，此处返回实际持有的子节点列表。
     */
    get children(): View[] {
        return this._children
    }

    constructor(options: IContainerViewOptions<D> = {}) {
        super(options)
        if (options.children && options.children.length > 0) {
            this._children = [...options.children] as View[]
            this._initRef(this._children)
        }
    }

    // ==================== 子 View 管理方法 ====================

    public addChild(child: View): void {
        if (!this._children.includes(child)) {
            this._children.push(child)
            child.parent = this
            // 仅当自身已挂载到 Scene 时才触发子节点的 onAttach（递归前序）
            if (this.getScene()) {
                child.onAttach()
            }
            // 子节点变更，标记布局脏
            this.markLayoutDirty()
        }
    }

    public removeChild(child: View): void {
        const index = this._children.indexOf(child)
        if (index > -1) {
            this._children.splice(index, 1)
            child.parent = null
            // 子节点变更，标记布局脏
            this.markLayoutDirty()
        }
    }

    public clear(): void {
        this._children.forEach((child) => {
            child.parent = null
            child.onDestroy()
        })
        this._children = []
    }

    // ==================== 布局 ====================

    /**
     * 执行实际布局：布局内容 + 布局子容器 → 设置 layoutArea。
     * override 基类的 performLayout，将子节点联合包围盒纳入 layoutArea 计算。
     */
    protected override performLayout(ctx?: IDrawingContext): void {
        const contentBounds = this.layoutContent(ctx)
        const childrenBounds = this.measureChildren()
        this.layoutArea = Bounds.union(this.viewport, contentBounds, childrenBounds)
    }

    /**
     * 计算子节点联合包围盒。
     * 将每个子节点的 viewport 应用其 matrix 后，求所有控制点的包围盒。
     */
    public measureChildren(): Bounds {
        if (this._children.length === 0) return Bounds.empty()
        const childRects = this._children.map((child) => {
            return Rectangle.fromBounds(child.viewport)
        })
        childRects.forEach((rect, i) => rect.transform(this._children[i].matrix))
        return Bounds.fromPoints(
            childRects.map((rect) => rect.controlPoints).flat(),
        )
    }

    // ==================== 生命周期 override ====================

    public override onAttach(): void {
        // 先触发自身生命周期（基类实现）
        super.onAttach()
        // 再递归触发子节点
        this._children.forEach((child) => child.onAttach())
    }

  public override onDestroy(): void {
    // 先递归销毁子节点（此时 parent 引用还在，子节点能找到 Scene）
    this._children.forEach((child) => child.onDestroy())
    this._children = []
    // 再调用基类：触发自身 onDestroy 生命周期 + 清理引用
    super.onDestroy()
  }

    // ==================== 变换 override ====================

    public override resize(
        fixedPoint: Point3,
        dynamicPoint: Point3,
        vector: Vector3,
        needResizeContent?: boolean,
    ): void {
        // 容器的 content 是背景图形，必须跟随视口 resize
        super.resize(fixedPoint, dynamicPoint, vector, true)
        // 递归 resize 子节点（透传原始 needResizeContent，由子 View 自行决定）
        this._children.forEach((view) => {
            view.resize(fixedPoint, dynamicPoint, vector, needResizeContent)
        })
    }

    /**
     * 设置 VP 矩阵并递归广播到所有子 View。
     */
    public override setVPMatrix(vpMatrix: Matrix4): void {
        super.setVPMatrix(vpMatrix)
        this._children.forEach((child) => child.setVPMatrix(vpMatrix))
    }

    // ==================== 渲染 override ====================

    /**
     * 渲染子节点列表。
     * 由基类 renderToOffScreen 在 scroll translate 上下文中调用。
     */
    protected override renderChildren(
        canvasContext: ICanvasHost,
        _offscreenCtx: IDrawingContext,
    ): void {
        this._children.forEach((view) => {
            if (!view.visible) return
            // renderToOffScreen 是 View 的 private 方法，通过 (view as any) 访问
            ;(view as any).renderToOffScreen(canvasContext)
        })
    }

    // ==================== 交互 override ====================

    /**
     * 递归命中检测子节点。
     * 数组靠后的 View 绘制在上方，后遍历的胜出。
     *
     * @param scrolledPoint 已补偿 scroll 偏移的本地坐标点
     * @param bufferCtx 用于命中检测的离屏上下文
     */
    protected override interactChildren(scrolledPoint: Point3, bufferCtx: IDrawingContext): IInteractResult {
        // 将 scrolledPoint 转回世界坐标传给子视图
        const adjustedWorldPoint = this.getMVPMatrix().multiply(scrolledPoint)
        let best: IInteractResult = { view: null, content: null, extraData: null }
        for (const child of this._children) {
            const childResult = child.interact(adjustedWorldPoint, bufferCtx)
            if (childResult.view && childResult.content && childResult.extraData) {
                // 数组中靠后的 child 绘制在上方，后遍历的胜出
                best = childResult
            }
        }
        return best
    }

    // ==================== 序列化 override ====================

    public override toJSON(): any {
        return {
            ...super.toJSON(),
            children: this._children.map((child) => ({
                $type: child.type,
                $value: child.toJSON(),
            })),
        }
    }

    protected override restoreCommonFields(data: any): void {
        super.restoreCommonFields(data)
        // 容器子类负责恢复 children
        if (data.children) {
            this._children = []
            data.children.forEach((child: View) => {
                this._children.push(child)
                child.parent = this
            })
        }
    }

    // ==================== 私有方法 ====================

    /** 批量设置子节点的 parent 引用（构造时使用） */
    private _initRef(children: View[]): void {
        children.forEach((child) => {
            child.parent = this
        })
    }
}
