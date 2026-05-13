import { VIEWTYPE } from '@/core/constants'
import View, { ViewOptions } from '@/core/views/View/View'
import { ICombinedView, ISerializable } from '@/core/interfaces'
import { generateId, generateName } from '@/core/utils'
import Matrix4 from '@/core/math/Matrix4'
import Bounds from '@/core/graph/base/Bounds'

/**
 * 组合视图
 */
export default class CombinedView extends View implements ICombinedView, ISerializable {
    public type: VIEWTYPE = VIEWTYPE.COMBINEDVIEW

    constructor(options: ViewOptions = {}) {
        super({ ...options })
        this.id = options.id || generateId(this.type)
        this.name = options.name || generateName(this.type)
    }

    public copy(): CombinedView {
        const newView = new CombinedView({
            children: this.children.map((view) => view.copy()),
        })

        // 复制基本属性（id 由构造器自动生成新的）
        newView.data = { ...this.data }
        newView.style = {
            ...this.style,
        }
        newView.selected = this.selected
        newView.actived = this.actived
        newView.freezed = this.freezed
        newView.visible = this.visible
        newView.matrix = this.matrix.copy()

        // 复制插件
        if (this.viewport) {
            newView.viewport = this.viewport.copy()
        }
        if (this.boundingBox) {
            newView.boundingBox = this.boundingBox.copy()
        }

        return newView
    }

    // 子View管理方法
    public addChild(child: View): void {
        if (!this.children.includes(child)) {
            this.children.push(child)
            child.parent = this
            child.onAttach()
        }
    }

    public removeChild(child: View): void {
        const index = this.children.indexOf(child)
        if (index > -1) {
            this.children.splice(index, 1)
            child.parent = null
        }
    }

    public clear(): void {
        this.children.forEach((child) => {
            child.parent = null
            child.onDestroy()
        })
        this.children = []
    }

    // ==================== 序列化 ====================

    /**
     * 从纯数据对象恢复 CombinedView 实例。
     * content / children 中的 { $type, $value } 应由 Serializer 预先解析为实例后传入。
     */
    static fromJSON(data: any): CombinedView {
        const view = new CombinedView({})
        view.id = data.id
        view.visible = data.visible
        view.freezed = data.freezed
        if (data.data) view.data = data.data
        if (data.events) Object.assign(view.events, data.events)
        if (data.lifetimes) Object.assign(view.lifetimes, data.lifetimes)
        if (data.style) view.style = data.style
        if (data.matrix) view.matrix = Matrix4.fromJSON(data.matrix)
        if (data.viewport) view.viewport = Bounds.fromJSON(data.viewport)
        if (data.constraintBounds) view.constraintBounds = Bounds.fromJSON(data.constraintBounds)
        if (data.content) view.content = data.content // 已由 Serializer 解析
        // children 通过 addChild 恢复，确保 parent 引用正确
        if (data.children) {
            data.children.forEach((child: View) => view.addChild(child))
        }
        view.restoreLayout()
        return view
    }
}

