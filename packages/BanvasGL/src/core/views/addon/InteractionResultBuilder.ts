import View,{ViewContent} from "../View"
import { ViewAddonImpl } from "./index"

/**
 * 交互结果类型
 * 键值对类型，键是View，值是ViewContent或ViewAddonImpl
 */
export type InteractionResult = Map<View, ViewContent | ViewAddonImpl>

/**
 * 交互结果构建器
 * 提供便捷的方法来构建交互结果
 */
export class InteractionResultBuilder {
    private result: InteractionResult = new Map()

    get size(){
        return this.result.size
    }

    /**
     * 添加视图和内容的映射
     * @param view 视图
     * @param content 内容（ViewContent或ViewAddonImpl）
     */
    public add(view: View, content: ViewContent | ViewAddonImpl): InteractionResultBuilder {
        this.result.set(view, content)
        return this
    }
    /**
     * 构建最终结果 - 返回最高层级的view和content对象
     */
    public build(): { view: View | null, content: ViewContent | ViewAddonImpl | null } {
        if (this.result.size === 0) {
            return { view: null, content: null }
        }

        let highestView: View | null = null
        let highestLayer = -1
        let content: ViewContent | ViewAddonImpl | null = null

        for (const [view, viewContent] of this.result) {
            if (view.layer > highestLayer) {
                highestLayer = view.layer
                highestView = view
                content = viewContent
            }
        }

        return { view: highestView, content }
    }
}
