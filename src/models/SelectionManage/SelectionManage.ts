import { Selection } from 'store/types/Template.type'
import ISelectionManage, { SelectionObj } from './ISelectionManage'
import { selectionStr2Arr } from 'utils/utils'
class SelectionManage implements ISelectionManage {
  parseSelection(sel: Selection): SelectionObj {
    const [startIndex, endIndex] = selectionStr2Arr(sel)
    return {
      startIndex,
      endIndex,
    }
  }

  stringifySelection(sel: SelectionObj): Selection {
    return `${sel.startIndex}-${sel.endIndex}`
  }

  isExterior(sel1: SelectionObj, sel2: SelectionObj): boolean {
    return sel1.startIndex === sel2.endIndex || sel1.endIndex === sel2.startIndex
  }

  isInterior(sel1: SelectionObj, sel2: SelectionObj): boolean {
    return (
      (sel1.startIndex === sel2.startIndex && sel1.endIndex < sel2.endIndex) ||
      (sel1.endIndex === sel2.endIndex && sel1.startIndex > sel2.startIndex)
    )
  }
  isOverlap(sel1: SelectionObj, sel2: SelectionObj): boolean {
    return !!this.intersect(sel1, sel2)
  }
  isContained(sel1: SelectionObj, sel2: SelectionObj): boolean {
    return sel1.startIndex >= sel2.startIndex && sel1.endIndex <= sel2.endIndex
  }
  isSameSelection(sel1: SelectionObj, sel2: SelectionObj): boolean {
    return (
      (this.isOverlap(sel1, sel2) && sel1.startIndex === sel2.startIndex && sel1.endIndex === sel2.endIndex) ||
      (this.isZeroSelection(sel1) && this.isZeroSelection(sel2) && sel1.startIndex === sel2.startIndex)
    )
  }
  isZeroSelection(sel: SelectionObj): boolean {
    return sel.startIndex === sel.endIndex
  }

  intersect(sel1: SelectionObj, sel2: SelectionObj): SelectionObj | null {
    const interSelection = {
      startIndex: Math.max(sel1.startIndex, sel2.startIndex),
      endIndex: Math.min(sel1.endIndex, sel2.endIndex),
    }
    if (
      (interSelection.startIndex === interSelection.endIndex && this.isExterior(sel1, sel2)) ||
      interSelection.startIndex > interSelection.endIndex
    ) {
      return null
    }
    return interSelection
  }
  union(sel1: SelectionObj, sel2: SelectionObj): SelectionObj | null {
    const union = {
      startIndex: Math.min(sel1.startIndex, sel2.startIndex),
      endIndex: Math.max(sel1.endIndex, sel2.endIndex),
    }
    if (union.endIndex - union.startIndex > sel1.endIndex - sel1.startIndex + sel2.endIndex - sel2.startIndex) {
      return null
    }
    return union
  }
  difference(sel1: SelectionObj, sel2: SelectionObj): SelectionObj[] | null {
    if (!this.isOverlap(sel1, sel2)) {
      return [sel1]
    }
    if (this.isContained(sel1, sel2)) {
      return null
    }

    if (this.isContained(sel2, sel1) && !this.isInterior(sel2, sel1)) {
      return [
        {
          startIndex: sel1.startIndex,
          endIndex: sel2.startIndex,
        },
        {
          startIndex: sel2.endIndex,
          endIndex: sel1.endIndex,
        },
      ]
    }
    if (sel1.startIndex < sel2.startIndex && sel1.endIndex > sel2.startIndex && sel2.endIndex >= sel1.endIndex) {
      return [
        {
          startIndex: sel1.startIndex,
          endIndex: sel2.startIndex,
        },
      ]
    } else {
      return [
        {
          startIndex: sel2.endIndex,
          endIndex: sel1.endIndex,
        },
      ]
    }
  }
  merge(...sel: SelectionObj[]): SelectionObj {
    if (sel.every((s) => s.startIndex === Infinity)) return sel[0]
    const filterSel = sel.filter((s) => s.startIndex != Infinity)
    const startIndex = Math.min(...filterSel.map((sel) => sel.startIndex))
    const length = filterSel.reduce((p, c) => p + c.endIndex - c.startIndex, 0)

    return {
      startIndex,
      endIndex: startIndex + length,
    }
  }
  offsetSelection(sel: SelectionObj, offset: number[]): SelectionObj {
    if (offset.length != 2 || !offset.every(Number.isInteger)) {
      throw new Error('偏移量必须为长度为2的数字数组')
    }
    if (sel.endIndex === Infinity) return sel
    return {
      startIndex: Math.max(sel.startIndex + offset[0], 0),
      endIndex: sel.endIndex + offset[1],
    }
  }
}

export default new SelectionManage()
