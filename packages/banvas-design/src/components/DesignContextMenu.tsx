import React, { useEffect, useRef } from 'react'
import type { IContextMenuState } from '@banyuan/banvasgl'

// ── 内联样式（避免外部 CSS 依赖，保持引擎包自包含） ──

const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
}

const menuStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1001,
    minWidth: 160,
    background: '#fff',
    borderRadius: 8,
    boxShadow:
        '0 6px 16px 0 rgba(0,0,0,0.08), 0 3px 6px -4px rgba(0,0,0,0.12), 0 9px 28px 8px rgba(0,0,0,0.05)',
    padding: '4px 0',
    userSelect: 'none',
}

const menuItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 12px',
    fontSize: 14,
    lineHeight: '22px',
    color: 'rgba(0,0,0,0.88)',
    cursor: 'pointer',
    transition: 'background 0.2s',
}

const menuItemDisabledStyle: React.CSSProperties = {
    ...menuItemStyle,
    color: 'rgba(0,0,0,0.25)',
    cursor: 'not-allowed',
}

const dividerStyle: React.CSSProperties = {
    height: 1,
    margin: '4px 12px',
    background: 'rgba(0,0,0,0.06)',
}

// ── 组件 ──

export interface DesignContextMenuProps {
    state: IContextMenuState
}

/**
 * 设计态画布右键菜单组件
 *
 * 纯展示组件，状态由 useDesignBanvas hook 管理。
 * 支持：菜单项、禁用态、分割线、点击外部关闭。
 *
 * 使用方式：
 * ```tsx
 * const { contextMenu } = useDesignBanvas(pages, options)
 * return <DesignContextMenu state={contextMenu} />
 * ```
 */
export const DesignContextMenu: React.FC<DesignContextMenuProps> = ({ state }) => {
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
            {/* 透明遮罩层，用于点击外部关闭 */}
            <div
                style={overlayStyle}
                onMouseDown={state.dismiss}
                onContextMenu={(e) => {
                    e.preventDefault()
                    state.dismiss()
                }}
            />
            <div
                ref={menuRef}
                style={{ ...menuStyle, left: state.position.x, top: state.position.y }}
            >
                {state.items.map((item) => (
                    <div key={item.key}>
                        {item.divider && <div style={dividerStyle} />}
                        <div
                            style={item.disabled ? menuItemDisabledStyle : menuItemStyle}
                            onMouseEnter={(e) => {
                                if (!item.disabled) {
                                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.04)'
                                }
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                            }}
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
