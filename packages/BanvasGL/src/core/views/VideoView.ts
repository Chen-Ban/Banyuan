import View, { ViewContent, ViewOptions } from './View'
import { VideoElement } from '../graph/video'
import CanvasContext from '../renderer/CanvasContext'
import { Point3 } from '../math'
import { InteractionResultBuilder, ViewAddonImpl } from './addon'

// 视频视图选项接口
export interface VideoViewOptions extends Omit<ViewOptions, 'content'> {
    // 视频视图特有的选项可以在这里添加
}

/**
 * 视频视图 - 专门处理VideoElement类型内容
 */
export default class VideoView extends View {
    public content: VideoElement
    public children: View<any>[] | null = null


    constructor(video: VideoElement, options: VideoViewOptions = {}) {
        // 将video作为content传递给父类构造函数
        super({ ...options, content: video })
        this.content = video
    }

    public renderContent(ctx: CanvasRenderingContext2D): void {
        if (this.content && typeof this.content.render === 'function') {
            this.content.render(ctx)
        }
    }

    public getContentBounds(): { x: number, y: number, width: number, height: number }  {
        if (this.content && typeof this.content.getBounds === 'function') {
            return this.content.getBounds()
        }
        return { x: 0, y: 0, width: 0, height: 0 }
    }

    public interact(p: Point3): { view: View | null, content: ViewContent | ViewAddonImpl | null }  {
        return new InteractionResultBuilder().build()
    }

    public copy(): VideoView {
        const newView = new VideoView(this.content)
        
        // 复制基本属性
        newView.layer = this.layer
        newView.id = this.id
        newView.properties = { ...this.properties }
        newView.data = { ...this.data }
        newView.style = this.style.copy()
        newView.selected = this.selected
        newView.actived = this.actived
        newView.freezed = this.freezed
        newView.visible = this.visible
        newView.matrix = this.matrix.copy()

        // 复制插件
        if (this.viewport) {
            newView.viewport = this.viewport.copy()
        }
        if (this.controlPoints) {
            newView.controlPoints = this.controlPoints.copy()
        }
        if (this.boundingBox) {
            newView.boundingBox =this.boundingBox.copy()
        }

        return newView
    }


}
