import { HORIZONTALALIGN } from "@/constants"
import Graph from "@/core/graph/base/Graph"
import TextElement from "./TextElement"

/**
 * 段落选项类
 * 包含段落级别的样式和布局配置
 */
export default class ParagraphOptions {
    public verticalAlign: HORIZONTALALIGN
    public leading: number
    public letterSpacing: number
    public preHeight: number
    public postHeight: number
    public listItemDecoration: Graph | TextElement[] | undefined
    public indentation: number
    public preWidth: number

    constructor(
        verticalAlign: HORIZONTALALIGN = HORIZONTALALIGN.LEFT,
        leading: number = 1.2,
        letterSpacing: number = 0,
        preHeight: number = 0,
        postHeight: number = 0,
        listItemDecoration: Graph | TextElement[] | undefined = undefined,
        indentation: number = 0,
        preWidth: number = 0
    ) {
        this.verticalAlign = verticalAlign
        this.leading = leading
        this.letterSpacing = letterSpacing
        this.preHeight = preHeight
        this.postHeight = postHeight
        this.listItemDecoration = listItemDecoration
        this.indentation = indentation
        this.preWidth = preWidth
    }

    /**
     * 复制选项
     */
    copy(): ParagraphOptions {
        return new ParagraphOptions(
            this.verticalAlign,
            this.leading,
            this.letterSpacing,
            this.preHeight,
            this.postHeight,
            this.listItemDecoration, // 注意：这里可能需要深拷贝
            this.indentation,
            this.preWidth
        )
    }

    /**
     * 比较两个选项是否相等
     */
    equals(other: ParagraphOptions): boolean {
        return this.verticalAlign === other.verticalAlign &&
               this.leading === other.leading &&
               this.letterSpacing === other.letterSpacing &&
               this.preHeight === other.preHeight &&
               this.postHeight === other.postHeight &&
               this.indentation === other.indentation &&
               this.preWidth === other.preWidth
    }

    /**
     * 设置垂直对齐方式
     */
    setVerticalAlign(align: HORIZONTALALIGN): ParagraphOptions {
        this.verticalAlign = align
        return this
    }

    /**
     * 设置行高
     */
    setLeading(leading: number): ParagraphOptions {
        this.leading = Math.max(0.1, leading)
        return this
    }

    /**
     * 设置字母间距
     */
    setLetterSpacing(spacing: number): ParagraphOptions {
        this.letterSpacing = spacing
        return this
    }

    /**
     * 设置段落前高度
     */
    setPreHeight(height: number): ParagraphOptions {
        this.preHeight = Math.max(0, height)
        return this
    }

    /**
     * 设置段落后高度
     */
    setPostHeight(height: number): ParagraphOptions {
        this.postHeight = Math.max(0, height)
        return this
    }

    /**
     * 设置列表项装饰
     */
    setListItemDecoration(decoration: Graph | TextElement[] | undefined): ParagraphOptions {
        this.listItemDecoration = decoration
        return this
    }

    /**
     * 设置缩进
     */
    setIndentation(indentation: number): ParagraphOptions {
        this.indentation = Math.max(0, indentation)
        return this
    }

    /**
     * 设置段落前宽度
     */
    setPreWidth(width: number): ParagraphOptions {
        this.preWidth = Math.max(0, width)
        return this
    }

    /**
     * 静态工厂方法 - 创建居中对齐段落选项
     */
    static center(
        leading: number = 1.2,
        letterSpacing: number = 0
    ): ParagraphOptions {
        return new ParagraphOptions(
            HORIZONTALALIGN.CENTER,
            leading,
            letterSpacing
        )
    }

    /**
     * 静态工厂方法 - 创建右对齐段落选项
     */
    static right(
        leading: number = 1.2,
        letterSpacing: number = 0
    ): ParagraphOptions {
        return new ParagraphOptions(
            HORIZONTALALIGN.RIGHT,
            leading,
            letterSpacing
        )
    }

    /**
     * 静态工厂方法 - 创建列表项段落选项
     */
    static listItem(
        decoration: Graph | TextElement[],
        indentation: number = 20,
        leading: number = 1.2
    ): ParagraphOptions {
        return new ParagraphOptions(
            HORIZONTALALIGN.LEFT,
            leading,
            0,
            0,
            0,
            decoration,
            indentation
        )
    }

    /**
     * 静态工厂方法 - 创建标题段落选项
     */
    static title(
        leading: number = 1.1,
        preHeight: number = 10,
        postHeight: number = 10
    ): ParagraphOptions {
        return new ParagraphOptions(
            HORIZONTALALIGN.LEFT,
            leading,
            0,
            preHeight,
            postHeight
        )
    }

    /**
     * 预定义段落选项
     */
    static readonly DEFAULT = new ParagraphOptions()
    static readonly CENTER = ParagraphOptions.center()
    static readonly RIGHT = ParagraphOptions.right()
    static readonly TITLE = ParagraphOptions.title()
}
