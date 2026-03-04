import { VIEWTYPE } from '@/core/constants'
import View, { ViewOptions } from '../View/View'

/**
 * 组合视图
 */
export default class CombinedView extends View {
    public type: VIEWTYPE = VIEWTYPE.COMBINEDVIEW

    constructor(options: ViewOptions = {}) {
        super({ ...options })
    }

    public copy(): CombinedView {
        const newView = new CombinedView(
            this.children.map((view) => view.copy())
        )

        // 复制基本属性
        newView.layer = this.layer
        newView.id = this.id
        newView.properties = { ...this.properties }
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
}

export function isCombinedView(view: any): view is CombinedView {
    return view instanceof CombinedView
}
