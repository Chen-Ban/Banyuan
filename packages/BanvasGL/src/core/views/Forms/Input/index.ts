import { TextFields, VIEWTYPE } from '@/index.backend'
import TextView, { TextViewOptions } from '../../TextView'

// 输入框选项接口
export interface InputOptions extends TextViewOptions {}

/**
 * 输入框视图
 * @description 继承自 TextView，默认为可编辑状态
 */
export default class Input extends TextView {
    public readonly type: VIEWTYPE = VIEWTYPE.INPUT

    constructor(text: TextFields, options: InputOptions = {}) {
        super(text, { ...options, editable: true })
    }
}

export function isInput(view: any): view is Input {
    return view instanceof Input
}
