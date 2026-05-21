import { VIEWTYPE } from '@/foundation/constants'
import type { ViewType } from '@/foundation/constants'
import type { ViewOptions } from '@/view/View/View.js'
import ContainerView from '@/view/ContainerView/index.js'
import type { ContainerViewOptions } from '@/view/ContainerView/index.js'
import { ICombinedView, ISerializable } from '@/types'
import { generateId, generateName } from '@/foundation/utils'

/**
 * 组合视图 —— 将多个子 View 组合为一个整体
 *
 * 继承 ContainerView，拥有 addChild / removeChild / clear 等子节点管理能力。
 */
export default class CombinedView extends ContainerView implements ICombinedView, ISerializable {
    public type: ViewType = VIEWTYPE.COMBINEDVIEW

    constructor(options: ContainerViewOptions = {}) {
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
        if (this.decoration) {
            newView.decoration = this.decoration.copy()
        }

        return newView
    }

    // ==================== 序列化 ====================

    /**
     * 从纯数据对象恢复 CombinedView 实例。
     * content / children 中的 { $type, $value } 应由 Serializer 预先解析为实例后传入。
     */
    static fromJSON(data: any): CombinedView {
        const view = new CombinedView({})
        if (data.content) view.content = data.content // 已由 Serializer 解析
        view.restoreFromJSON(data)
        return view
    }
}
