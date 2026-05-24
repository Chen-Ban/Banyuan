/**
 * ContainerView —— 拥有子节点管理能力的容器视图抽象类
 *
 * 只有需要管理子 View 的视图类型（CombinedView、NodeView）继承此类。
 * 叶子视图（GraphView、TextView 等）直接继承 View，其 children 返回空数组。
 *
 * 职责：
 *   - 持有 children 数组
 *   - 提供 addChild / removeChild / clear 方法
 *   - override onDestroy 以递归销毁子节点
 *   - override restoreCommonFields 以恢复 children
 */

import View from '@/view/View/View.js'
import type { IContainerView, IFieldSchemaMap, IContainerViewOptions } from '@/types'

export default abstract class ContainerView<D extends IFieldSchemaMap = IFieldSchemaMap>
    extends View<D>
    implements IContainerView
{
    private _children: View[] = []

    /**
     * 返回子视图数组。
     * 覆盖基类的空数组 getter，此处返回实际持有的子节点列表。
     */
    get children(): View[] {
        return this._children
    }

    constructor(options: IContainerViewOptions<D> = {}) {
        super(options)
        if (options.children && options.children.length > 0) {
            this._children = [...options.children] as View[]
            this.initRef(this._children)
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

    // ==================== 生命周期 override ====================

    public override onDestroy(): void {
        // 先触发生命周期（清理前 Scene 引用还在）
        this.getScene()?.triggerSchema(this, this.lifetimes.onDestroy)
        // 清理引用
        this.parent = null
        this.content = null
        this._children.forEach((child) => child.onDestroy())
        this._children = []
        this.boundingBox = null
    }

    // ==================== 序列化 override ====================

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
}
