import View, { ViewOptions } from '@/view/View/View'
import { ImageElement } from '@/graph/media'
import { VIEWTYPE } from '@/foundation/constants'
import type { ViewType } from '@/foundation/constants'
import { IImageView, ISerializable } from '@/types'
import { generateId, generateName } from '@/foundation/utils'

// 图像视图选项接口
export interface ImageViewOptions extends Omit<ViewOptions, 'content'> {
    // 图像视图特有的选项可以在这里添加
}

/**
 * 图像视图 - 专门处理ImageElement类型内容
 */
export default class ImageView extends View implements IImageView, ISerializable {
    public type: ViewType = VIEWTYPE.IMAGEVIEW
    public content: ImageElement

    constructor(image: ImageElement, options: ImageViewOptions = {}) {
        // 将image作为content传递给父类构造函数
        super({ ...options, content: image })
        this.id = options.id || generateId(this.type)
        this.name = options.name || generateName(this.type)
        this.content = image
    }

    public copy(): ImageView {
        const newView = new ImageView(this.content)

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

        if (this.viewport) {
            newView.viewport = this.viewport.copy()
        }
        // 复制插件
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
     * 从纯数据对象恢复 ImageView 实例。
     * data.content 应由 Serializer 预先解析为 ImageElement 实例后传入。
     */
    static fromJSON(data: any): ImageView {
        const view = new ImageView(data.content)
        view.restoreFromJSON(data)
        return view
    }
}

