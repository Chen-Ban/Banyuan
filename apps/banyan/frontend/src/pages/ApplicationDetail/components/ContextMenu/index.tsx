import { useEffect, useRef } from 'react'
import type { IContextMenuState } from '@banyuan/sdk/core'
import styles from './index.module.scss'

interface ContextMenuProps {
    state: IContextMenuState
}

const ContextMenu = ({ state }: ContextMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null)

    // 确保菜单不超出视口
    useEffect(() => {
        if (!state.visible || !menuRef.current) return
        const menu = menuRef.current
        const rect = menu.getBoundingClientRect()
        const { innerWidth, innerHeight } = window

        if (rect.right > innerWidth) {
            menu.style.left = `${innerWidth - rect.width - 8}px`
        }
        if (rect.bottom > innerHeight) {
            menu.style.top = `${innerHeight - rect.height - 8}px`
        }
    }, [state.visible, state.position])

    if (!state.visible) return null

    return (
        <>
            {/* 透明遮罩，用于点击外部关闭菜单 */}
            <div
                className={styles.contextMenuOverlay}
                onMouseDown={state.dismiss}
                onContextMenu={(e) => {
                    e.preventDefault()
                    state.dismiss()
                }}
            />
            <div
                ref={menuRef}
                className={styles.contextMenu}
                style={{
                    left: state.position.x,
                    top: state.position.y,
                }}
            >
                {state.items.map((item) => (
                    <div key={item.key}>
                        {item.divider && <div className={styles.divider} />}
                        <div
                            className={`${styles.menuItem} ${item.disabled ? styles.disabled : ''}`}
                            onClick={() => {
                                if (item.disabled) return
                                item.handler()
                                state.dismiss()
                            }}
                        >
                            {item.label}
                        </div>
                    </div>
                ))}
            </div>
        </>
    )
}

export default ContextMenu
