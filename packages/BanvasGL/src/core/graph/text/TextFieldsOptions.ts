import { VERTICALALIGN } from '@/core/constants'

/**
 * 文本域选项类
 * 包含文本域级别的样式和布局配置
 */
export default class TextFieldsOptions {
    /** 垂直对齐方式 */
    public verticalAlign: VERTICALALIGN
    /** 段落间距 */
    public paragraphSpacing: number
    /** 固定宽度 */
    public fixedWidth: boolean
    /** 固定高度 */
    public fixedHeight: boolean

    constructor(options: Partial<TextFieldsOptions>) {
        this.verticalAlign = options.verticalAlign ?? VERTICALALIGN.TOP
        this.paragraphSpacing = options.paragraphSpacing ?? 0
        this.fixedWidth = options.fixedWidth ?? true
        this.fixedHeight = options.fixedHeight ?? false
    }

    /**
     * 复制选项
     */
    copy(): TextFieldsOptions {
        const { verticalAlign, paragraphSpacing, fixedWidth, fixedHeight } =
            this
        return new TextFieldsOptions({
            verticalAlign,
            paragraphSpacing,
            fixedWidth,
            fixedHeight,
        })
    }

    /**
     * 比较两个选项是否相等
     */
    equals(other: TextFieldsOptions): boolean {
        return (
            this.verticalAlign === other.verticalAlign &&
            this.paragraphSpacing === other.paragraphSpacing &&
            this.fixedWidth === other.fixedWidth &&
            this.fixedHeight === other.fixedHeight
        )
    }

    // ── 序列化 ──
    toJSON(): any {
        return {
            verticalAlign: this.verticalAlign,
            paragraphSpacing: this.paragraphSpacing,
            fixedWidth: this.fixedWidth,
            fixedHeight: this.fixedHeight,
        }
    }

    static fromJSON(data: any): TextFieldsOptions {
        return new TextFieldsOptions({
            verticalAlign: data.verticalAlign,
            paragraphSpacing: data.paragraphSpacing,
            fixedWidth: data.fixedWidth,
            fixedHeight: data.fixedHeight,
        })
    }

    /**
     * 静态工厂方法 - 创建居中对齐文本域选项
     */
    static center(): TextFieldsOptions {
        return new TextFieldsOptions({
            verticalAlign: VERTICALALIGN.MIDDLE,
        })
    }

    /**
     * 预定义文本域选项
     */
    static readonly DEFAULT = new TextFieldsOptions({})
    static readonly CENTER = TextFieldsOptions.center()
}
