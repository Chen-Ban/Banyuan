import View, { ViewOptions } from '@/core/views/View/View'
import { VideoElement } from '@/core/graph/media'
import { VIEWTYPE } from '@/index.backend'
import { IVideoView, ISerializable } from '@/core/interfaces'
import { generateId, generateName } from '@/core/utils'
import Matrix4 from '@/core/math/Matrix4'
import Bounds from '@/core/graph/base/Bounds'

// 视频视图选项接口
export interface VideoViewOptions extends Omit<ViewOptions, 'content'> {
    // 视频视图特有的选项可以在这里添加
}

/**
 * 视频视图 - 专门处理VideoElement类型内容
 */
export default class VideoView extends View implements IVideoView, ISerializable {
    public type: VIEWTYPE = VIEWTYPE.VIDEOVIEW
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

        return newView
    }

    // ==================== 序列化 ====================

    /**
     * 从纯数据对象恢复 VideoView 实例。
     * data.content 应由 Serializer 预先解析为 VideoElement 实例后传入。
     */
    static fromJSON(data: any): VideoView {
        const view = new VideoView(data.content)
        view.id = data.id
        view.visible = data.visible
        view.freezed = data.freezed
        if (data.data) view.data = data.data
        if (data.events) Object.assign(view.events, data.events)
        if (data.lifetimes) Object.assign(view.lifetimes, data.lifetimes)
        if (data.style) view.style = data.style
        if (data.matrix) view.matrix = Matrix4.fromJSON(data.matrix)
        if (data.viewport) view.viewport = Bounds.fromJSON(data.viewport)
        if (data.children) {
            data.children.forEach((child: View) => {
                view.children.push(child)
                child.parent = view
                child.onAttach()
            })
        }
        view.restoreLayout()
        return view
    }
}

