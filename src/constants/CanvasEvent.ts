import { BOXMARGIN, BOXPADDING } from './CanvasRendering'

export const RESIZERECTSIZE_RESPONSE = 15
export const BOX_RESPONSE = BOXPADDING + BOXMARGIN

export enum MouseOperation {
  ISMOVING = 'isMoving',
  ISRESIZING = 'isResizing',
  ISSELECTION = 'isSelection',
  ISSELECTING = 'isSelecting',
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
export enum ComposingArrowKeys {
  SELECTION_UP = 'selection_up',
  SELECTION_DOWN = 'selection_down',
  SELECTION_LEFT = 'selection_left',
  SELECTION_RIGHT = 'selection_right',
}
export enum ComposingKeys {
  COPY = 'copy',
  PASTE = 'paste',
  CHECKALL = 'checkall',
  SAVE = 'save',
  SELECTION_UP = ComposingArrowKeys.SELECTION_UP,
  SELECTION_DOWN = ComposingArrowKeys.SELECTION_DOWN,
  SELECTION_LEFT = ComposingArrowKeys.SELECTION_LEFT,
  SELECTION_RIGHT = ComposingArrowKeys.SELECTION_RIGHT,
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
export const isComposingArrowKeys = (key: any): key is ComposingArrowKeys => {
  return (Object.values(ComposingArrowKeys) as string[]).includes(key)
}

export const isComposingKeysPrefix = (key: any): key is ComposingKeysPrefix => {
  return (Object.values(ComposingKeysPrefix) as string[]).includes(key)
}

export const MOUSEMOVEPERIOD = 1000 / 30
