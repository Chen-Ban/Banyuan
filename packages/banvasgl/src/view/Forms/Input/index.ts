import TextFields from '@/graph/text/TextFields'
import { ViewType } from '@/foundation/constants'
import TextView from '@/view/TextView'
import { IInput } from '@/types'
import type { IInputOptions } from '@/types'
import { generateId, generateName } from '@/foundation/utils'

/**
 * 输入框视图
 * @description 继承自 TextView，默认为可编辑状态
 */
export default class Input extends TextView implements IInput {
    public readonly type: ViewType = ViewType.INPUT

    constructor(text: TextFields, options: IInputOptions = {}) {
        super(text, { ...options, editable: true })
        this.id = options.id || generateId(this.type)
        this.name = options.name || generateName(this.type)
    }
}

