import View, { ViewOptions } from '../View/View'
import { ImageElement } from '../../graph/media'
import Bounds from '@/core/graph/base/Bounds'
import { VIEWTYPE } from '@/index.backend'

// 图像视图选项接口
export interface ImageViewOptions extends Omit<ViewOptions, 'content'> {
    // 图像视图特有的选项可以在这里添加
}

/**
 * 图像视图 - 专门处理ImageElement类型内容
 */
export default class ImageView extends View {
    public type: VIEWTYPE = VIEWTYPE.IMAGEVIEW
    public content: [ImageElement]

    constructor(image: ImageElement, options: ImageViewOptions = {}) {
        // 将image作为content传递给父类构造函数
        super({ ...options, content: [image] })
        this.content = [image]
    }

    public copy(): ImageView {
        const newView = new ImageView(this.content[0])

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

        if (this.viewport) {
            newView.viewport = this.viewport.copy()
        }
        // 复制插件
        if (this.boundingBox) {
            newView.boundingBox = this.boundingBox.copy()
        }

        return newView
    }
}

export function isImageView(view: any): view is ImageView {
    return view instanceof ImageView
}
