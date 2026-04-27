import { Graph } from '@/index.backend'
import type { IView, ExtraData } from '@/core/interfaces'
import { ViewAddonImpl } from '../addon/index'

/**
 * 交互结果类型
 * 键值对类型，键是View，值是ViewContent或ViewAddonImpl
 */
export type InteractionMap = Map<
    IView,
    { content: Graph | ViewAddonImpl; extraData: ExtraData }
>
/**
 * 交互结果构建器
 * 提供便捷的方法来构建交互结果
 */
export class InteractionMapBuilder {
    private result: InteractionMap = new Map()

    get size() {
        return this.result.size
    }

    /**
     * 添加视图和内容的映射
     * @param view 视图
     * @param content 内容（ViewContent或ViewAddonImpl）
     */
    public add(
        view: IView,
        content: Graph | ViewAddonImpl,
        extraData: ExtraData
    ): InteractionMapBuilder {
        this.result.set(view, { content, extraData })
        return this
    }
    /**
     * 构建最终结果 - 返回最高层级的view和content对象
     */
    public build(): {
        view: IView | null
        content: Graph | ViewAddonImpl | null
        extraData: ExtraData | null
    } {
        if (this.result.size === 0) {
            return { view: null, content: null, extraData: null }
        }

        let highestView: IView | null = null
        let highestLayer = -1
        let content: Graph | ViewAddonImpl | null = null
        let extraData: ExtraData | null = null

        for (const [view, { content: _content, extraData: _extraData }] of this
            .result) {
            // layer 相同时，后加入的 View 胜出（对应视觉上"后绘制 = 在上方"的约定）
            if (view.layer >= highestLayer) {
                highestLayer = view.layer
                highestView = view
                content = _content
                extraData = _extraData
            }
        }

        return { view: highestView, content, extraData }
    }
}
