import { TextFields, VIEWTYPE } from '@/index.backend'
import TextView, { TextViewOptions } from '@/core/views/TextView'
import { IInput } from '@/core/interfaces'
import { generateId } from '@/core/utils'

// 输入框选项接口
export interface InputOptions extends TextViewOptions {}

/**
 * 输入框视图
 * @description 继承自 TextView，默认为可编辑状态
 */
export default class Input extends TextView implements IInput {
    public readonly type: VIEWTYPE = VIEWTYPE.INPUT

    constructor(text: TextFields, options: InputOptions = {}) {
        super(text, { ...options, editable: true })
        this.id = options.id || generateId(this.type)
    }
}

