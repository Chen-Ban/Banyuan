import { useCallback, useEffect, useRef } from 'react'
import {
  App,
  Point3,
  isTextView,
  flattenViewTree,
} from '@banyuan/banvasgl'
import type { Scene, ITextView } from '@banyuan/banvasgl'

export interface UseInputEventsOptions {
    inputRef: React.RefObject<HTMLInputElement | null>
    canvasRef: React.RefObject<HTMLCanvasElement | null>
    app: App | null
}

/**
 * 获取当前选中的 TextView 和 Scene
 */
function getSelectedTextViewAndScene(app: App | null): { view: ITextView; scene: Scene } | null {
    const scene = app?.getCurrentScene()
    if (!scene) return null

    const selectedView = scene.getSelectedView()

    return isTextView(selectedView) ? { view: selectedView, scene } : null
}

/**
 * Input 事件绑定
 */
export function useInputEvents({
    inputRef,
    canvasRef,
    app,
}: UseInputEventsOptions) {
    const isComposingRef = useRef<boolean>(false)

    const onInput = useCallback(
        (e: Event) => {
            const result = getSelectedTextViewAndScene(app)
            if (!result || !result.view.selection.isSelection || !inputRef.current) return

            if (!(e instanceof InputEvent)) return

            if (e.inputType === 'insertText') {
                const insertedText = e.data || ''
                if (insertedText.length > 0) {
                    result.scene.beginTransaction([result.view.id])
                    result.view.input(insertedText, false)
                    result.scene.commitTransaction()
                }
            }
        },
        [app, inputRef]
    )

    const onCompositionStart = useCallback(() => {
        isComposingRef.current = true
        const result = getSelectedTextViewAndScene(app)
        if (result && result.view.selection.isSelection) {
            result.scene.beginTransaction([result.view.id])
        }
    }, [app])

    const onCompositionUpdate = useCallback(
        (e: CompositionEvent) => {
            const result = getSelectedTextViewAndScene(app)
            if (!result || !result.view.selection.isSelection || !inputRef.current) return

            const compositionText = e.data || ''
            if (compositionText.length > 0) {
                result.view.input(compositionText, true)
            }
        },
        [app, inputRef]
    )

    const onCompositionEnd = useCallback(
        (e: CompositionEvent) => {
            isComposingRef.current = false
            const result = getSelectedTextViewAndScene(app)
            if (!result || !result.view.selection.isSelection || !inputRef.current) return

            const finalText = e.data || ''
            if (finalText.length > 0) {
                result.view.input(finalText, false)
            }
            result.scene.commitTransaction()
        },
        [app, inputRef]
    )

    const onKeyDown = useCallback(
        (e: KeyboardEvent) => {
            const result = getSelectedTextViewAndScene(app)
            if (!result || !result.view.selection.isSelection || !inputRef.current) return

            const selectedView = result.view
            const scene = result.scene

            if (isComposingRef.current && e.key !== 'Escape') {
                return
            }

            const input = inputRef.current
            const inputValue = input.value

            switch (e.key) {
                case 'ArrowLeft':
                    break
                case 'ArrowRight':
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    break
                case 'ArrowDown':
                    e.preventDefault()
                    break
                case 'End':
                    e.preventDefault()
                    const endPos = inputValue.length
                    input.setSelectionRange(endPos, endPos)
                    break
                case 'Backspace':
                    scene.beginTransaction([selectedView.id])
                    selectedView.delete(true)
                    scene.commitTransaction()
                    break
                case 'Delete':
                    scene.beginTransaction([selectedView.id])
                    selectedView.delete(false)
                    scene.commitTransaction()
                    break
                case 'Enter':
                    e.preventDefault()
                    scene.beginTransaction([selectedView.id])
                    selectedView.newLine()
                    scene.commitTransaction()
                    break
                case 'Escape':
                    if (!isComposingRef.current && selectedView && app) {
                        selectedView.selection.fixedIndex = undefined
                        selectedView.selection.dynamicIndex = undefined
                        selectedView.setSelection(undefined, undefined)
                    }
                    break
                case 'Tab':
                    e.preventDefault()
                    if (app) {
                        const currentScene = app.getCurrentPage()
                        if (currentScene) {
                            const allViews = flattenViewTree(currentScene)
                            const editableViews = allViews.filter((view) => isTextView(view))

                            if (editableViews.length > 0) {
                                const currentIndex = editableViews.findIndex(
                                    (view) => view === selectedView
                                )
                                const nextIndex =
                                    (e.shiftKey ? currentIndex - 1 : currentIndex + 1) %
                                    editableViews.length

                                const nextView = editableViews[nextIndex]
                                currentScene.select(nextView)
                                app.notify()
                                const bounds = nextView.boundingBox?.getBounds()
                                if (bounds) {
                                    const worldMatrix = nextView.getWorldMatrix()
                                    const relativeBottomLeft = new Point3(
                                        bounds.x,
                                        bounds.y + bounds.height,
                                        0
                                    )
                                    const worldBottomLeft = worldMatrix.multiply(relativeBottomLeft)
                                    const layoutBounds = nextView.layoutArea

                                    const canvas = canvasRef.current
                                    if (layoutBounds && canvas) {
                                        // 逻辑坐标 → CSS 坐标：乘以 (样式尺寸 / 逻辑尺寸)
                                        const scaleX = canvas.clientWidth / canvas.width
                                        const scaleY = canvas.clientHeight / canvas.height
                                        // canvas 在容器中的偏移（flex 居中导致）
                                        const offsetX = canvas.offsetLeft
                                        const offsetY = canvas.offsetTop
                                        input.style.left = `${offsetX + worldBottomLeft.x * scaleX}px`
                                        input.style.top = `${offsetY + worldBottomLeft.y * scaleY}px`
                                        input.style.width = `${layoutBounds.width * scaleX}px`
                                        input.style.height = `16px`
                                        input.style.display = 'block'
                                        input.focus()
                                        const contentText = nextView.getContentText()
                                        input.value = contentText[0]
                                    }
                                }
                            }
                        }
                    }
                    break
                default:
                    break
            }
        },
        [app, inputRef]
    )

    useEffect(() => {
        const input = inputRef.current
        if (!input) return

        input.addEventListener('input', onInput)
        input.addEventListener('compositionstart', onCompositionStart)
        input.addEventListener('compositionupdate', onCompositionUpdate)
        input.addEventListener('compositionend', onCompositionEnd)
        input.addEventListener('keydown', onKeyDown as any)

        return () => {
            input.removeEventListener('input', onInput as any)
            input.removeEventListener('compositionstart', onCompositionStart as any)
            input.removeEventListener('compositionupdate', onCompositionUpdate as any)
            input.removeEventListener('compositionend', onCompositionEnd as any)
            input.removeEventListener('keydown', onKeyDown as any)
        }
    }, [onInput, onCompositionStart, onCompositionUpdate, onCompositionEnd, onKeyDown, inputRef, app])
}
