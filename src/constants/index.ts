//缩放块的实际尺寸和相应尺寸
export const RESIZERECTSIZE = 7
export const RESIZERECTSIZE_RESPONSE = 15
//节点盒的内边距
export const BOXPADDING = 10
//节点盒的外边距
export const BOXMARGIN = 5

//鼠标移动周期
export const MOUSEMOVEPERIOD = 1000 / 30

export const SEARCH_PARAM_KEY = 'search'

export enum CanvasNodeMouseEventOperation {
  ISMOVING = 'isMoving', //移动位置
  ISRESIZING = 'isResizing', //调整尺寸
  ISSELECTION = 'isSelection', //文本框选择
  ISSELECTING = 'isSelecting', //节点选择
  CLICK = 'click',
  NONE = 'none',
}

export enum ArrowKeys {
  ARROWDOWN = 'ArrowDown',
  ARROWLEFT = 'ArrowLeft',
  ARROWRIGHT = 'ArrowRight',
  ARROWUP = 'ArrowUp',
}

export enum ValidModifierKeys {
  TAB = 'Tab',
  CONTROL = 'Control',
  SHIFT = 'Shift',

  DELETE = 'Delete',
  ENTER = 'Enter',

  BACKSPACE = 'Backspace',

  ESC = 'Esc',
}

export enum ComposingKeysPrefix {
  CONTROL = ValidModifierKeys.CONTROL,
  SHIFT = ValidModifierKeys.SHIFT,
}

export enum ComposingKeys {
  COPY = 'copy',
  PASTE = 'paste',
  CHECKALL = 'checkall',
  SELECTION = 'selection',
}

export const isValidModifier = (key: any): key is ValidModifierKeys => {
  return (Object.values(ValidModifierKeys) as string[]).includes(key)
}
export const isArrowKeys = (key: any): key is ArrowKeys => {
  return (Object.values(ArrowKeys) as string[]).includes(key)
}
export const isComposingKeys = (key: any): key is ComposingKeys => {
  return (Object.values(ComposingKeys) as string[]).includes(key)
}

export const isComposingKeysPrefix = (key: any): key is ComposingKeysPrefix => {
  return (Object.values(ComposingKeysPrefix) as string[]).includes(key)
}
