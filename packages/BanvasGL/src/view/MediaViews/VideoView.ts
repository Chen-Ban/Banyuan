import View, { ViewOptions } from '@/view/View/View'
import { VideoElement } from '@/graph/media'
import { VIEWTYPE } from '@/foundation/constants'
import type { ViewType } from '@/foundation/constants'
import { IVideoView, ISerializable } from '@/types'
import { generateId, generateName } from '@/foundation/utils'

// 视频视图选项接口
export interface VideoViewOptions extends Omit<ViewOptions, 'content'> {
    // 视频视图特有的选项可以在这里添加
}

/**
 * 视频视图 - 专门处理VideoElement类型内容
 */
export default class VideoView extends View implements IVideoView, ISerializable {
    public type: ViewType = VIEWTYPE.VIDEOVIEW
    public content: VideoElement

    constructor(video: VideoElement, options: VideoViewOptions = {}) {
        // 将video作为content传递给父类构造函数
        super({ ...options, content: video })
        this.id = options.id || generateId(this.type)
        this.name = options.name || generateName(this.type)
        this.content = video
    }

    public copy(): VideoView {
        const newView = new VideoView(this.content)

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
     * 从纯数据对象恢复 VideoView 实例。
     * data.content 应由 Serializer 预先解析为 VideoElement 实例后传入。
     */
    static fromJSON(data: any): VideoView {
        const view = new VideoView(data.content)
        view.restoreFromJSON(data)
        return view
    }
}

