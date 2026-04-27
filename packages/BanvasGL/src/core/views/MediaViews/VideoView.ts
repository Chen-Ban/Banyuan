import View, { ViewOptions } from '../View/View'
import { VideoElement } from '../../graph/media'
import { VIEWTYPE } from '@/index.backend'
import type { IVideoView } from '@/core/interfaces'

// 视频视图选项接口
export interface VideoViewOptions extends Omit<ViewOptions, 'content'> {
    // 视频视图特有的选项可以在这里添加
}

/**
 * 视频视图 - 专门处理VideoElement类型内容
 */
export default class VideoView extends View implements IVideoView {
    public type: VIEWTYPE = VIEWTYPE.VIDEOVIEW
    public content: VideoElement

    constructor(video: VideoElement, options: VideoViewOptions = {}) {
        // 将video作为content传递给父类构造函数
        super({ ...options, content: video })
        this.content = video
    }

    public copy(): VideoView {
        const newView = new VideoView(this.content)

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

