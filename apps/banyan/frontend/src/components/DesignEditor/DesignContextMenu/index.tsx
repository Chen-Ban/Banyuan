import React, { useEffect, useRef } from 'react'
import type { IContextMenuState } from '@banyuan/banvasgl'
import styles from './index.module.scss'

export interface DesignContextMenuProps {
    state: IContextMenuState
}

/**
 * 设计态画布右键菜单组件
 *
 * 纯展示组件，状态由 useDesignBanvas hook 管理。
 * 支持：菜单项、禁用态、分割线、点击外部关闭。
 */
export const DesignContextMenu: React.FC<DesignContextMenuProps> = ({ state }) => {
    const menuRef = useRef<HTMLDivElement>(null)

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
            <div
                className={styles.overlay}
                onMouseDown={state.dismiss}
                onContextMenu={(e) => {
                    e.preventDefault()
                    state.dismiss()
                }}
            />
            <div
                ref={menuRef}
                className={styles.menu}
                style={{ left: state.position.x, top: state.position.y }}
            >
                {state.items.map((item) => (
                    <div key={item.key}>
                        {item.divider && <div className={styles.divider} />}
                        <div
                            className={item.disabled ? styles.menuItemDisabled : styles.menuItem}
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
