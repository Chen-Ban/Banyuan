import { VERTICALALIGN } from "@/constants"

/**
 * 文字集合选项类
 * 包含整个文字集合的样式和布局配置
 */
export default class TextsOptions {
    public verticalAlign: VERTICALALIGN

    constructor(verticalAlign: VERTICALALIGN = VERTICALALIGN.TOP) {
        this.verticalAlign = verticalAlign
    }

    /**
     * 复制选项
     */
    copy(): TextsOptions {
        return new TextsOptions(this.verticalAlign)
    }

    /**
     * 比较两个选项是否相等
     */
    equals(other: TextsOptions): boolean {
        return this.verticalAlign === other.verticalAlign
    }

    /**
     * 设置垂直对齐方式
     */
    setVerticalAlign(align: VERTICALALIGN): TextsOptions {
        this.verticalAlign = align
        return this
    }

    static top(): TextsOptions {
        return new TextsOptions(VERTICALALIGN.TOP)
    }

    /**
     * 静态工厂方法 - 创建居中对齐文字集合选项
     */
    static center(): TextsOptions {
        return new TextsOptions(VERTICALALIGN.MIDDLE)
    }

    /**
     * 静态工厂方法 - 创建底部对齐文字集合选项
     */
    static bottom(): TextsOptions {
        return new TextsOptions(VERTICALALIGN.BOTTOM)
    }

    /**
     * 预定义文字集合选项
     */
    static readonly DEFAULT = new TextsOptions()
    static readonly CENTER = TextsOptions.center()
    static readonly BOTTOM = TextsOptions.bottom()
}
