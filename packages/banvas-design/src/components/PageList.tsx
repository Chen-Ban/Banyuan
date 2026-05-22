import React, { useMemo, useState, useRef, useEffect } from 'react'
import { Tree, Button } from 'antd'
import type { TreeNodeProps } from 'antd'
import type { IPageNode, IViewNode, IBanvasActions } from '@banyuan/banvasgl'

// ── 内联样式 ──

const pageListStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundColor: '#fafafa',
    borderRight: '1px solid #e9ecef',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid #f0f0f0',
    flexShrink: 0,
}

const titleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#595959',
}

const nodeTitleWrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    userSelect: 'none',
}

const nodeTitleTextStyle: React.CSSProperties = {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
}

const nodeBtnsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    flexShrink: 0,
    marginLeft: 4,
}

const nodeBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
    borderRadius: 3,
    color: '#bfbfbf',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    padding: 0,
}

const renameInputStyle: React.CSSProperties = {
    width: '100%',
    border: 'none',
    borderBottom: '1px solid #1677ff',
    outline: 'none',
    background: 'transparent',
    fontSize: 12,
    padding: '0 2px',
    lineHeight: '22px',
    color: '#262626',
}

const treeWrapperStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '4px 0',
}

// ── SVG Icons（避免依赖 @ant-design/icons） ──

const PlusIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
)

const DownIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
)

const RightIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
)

const CloseIcon = () => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
)

const EyeIcon = () => (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 3C4 3 1.5 8 1.5 8s2.5 5 6.5 5 6.5-5 6.5-5S12 3 8 3z" stroke="currentColor" strokeWidth="1" fill="none" />
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
)

const EyeInvisibleIcon = () => (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 3C4 3 1.5 8 1.5 8s2.5 5 6.5 5 6.5-5 6.5-5S12 3 8 3z" stroke="currentColor" strokeWidth="1" fill="none" />
        <path d="M3 13L13 3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
)

const LockIcon = () => (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
        <rect x="3" y="7" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1" fill="none" />
        <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
)

const UnlockIcon = () => (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
        <rect x="3" y="7" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1" fill="none" />
        <path d="M5 7V5a3 3 0 016 0" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
)

// ── 类型定义 ──

export interface PageListProps {
    pages: IPageNode[]
    currentPageId: string | null
    actions: IBanvasActions
}

interface TreeNode {
    key: string
    title: string
    isPage: boolean
    visible?: boolean
    locked?: boolean
    children?: TreeNode[]
    isLeaf?: boolean
}

/** 判断 key 是否为页面节点 */
function isPageKey(pages: IPageNode[], key: string): boolean {
    return pages.some((p) => p.id === key)
}

/** 查找 view 所属的页面 ID */
function findOwnerPageId(pages: IPageNode[], viewId: string): string | null {
    for (const page of pages) {
        const found = (function search(nodes: IViewNode[]): boolean {
            return nodes.some(
                (n) => n.id === viewId || (n.children && search(n.children)),
            )
        })(page.children || [])
        if (found) return page.id
    }
    return null
}

/** 独立的 InlineEdit 组件 */
const InlineEdit: React.FC<{
    defaultValue: string
    onCommit: (value: string) => void
    onCancel: () => void
}> = ({ defaultValue, onCommit, onCancel }) => {
    const ref = useRef<HTMLInputElement>(null)
    const [committed, setCommitted] = useState(false)

    useEffect(() => {
        requestAnimationFrame(() => {
            if (ref.current) {
                ref.current.focus()
                ref.current.select()
            }
        })
    }, [])

    const doCommit = () => {
        if (committed) return
        setCommitted(true)
        const value = ref.current?.value ?? ''
        const trimmed = value.trim()
        if (trimmed) {
            onCommit(trimmed)
        } else {
            onCancel()
        }
    }

    return (
        <input
            ref={ref}
            style={renameInputStyle}
            defaultValue={defaultValue}
            onBlur={doCommit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    doCommit()
                }
                if (e.key === 'Escape') {
                    e.preventDefault()
                    onCancel()
                }
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
        />
    )
}

export const PageList: React.FC<PageListProps> = ({
    pages,
    currentPageId,
    actions,
}) => {
    const [editingKey, setEditingKey] = useState<string | null>(null)

    /** 构建纯数据 treeData */
    const treeData: TreeNode[] = useMemo(() => {
        function viewToNode(v: IViewNode): TreeNode {
            return {
                key: v.id,
                title: v.name || v.type,
                isPage: false,
                visible: v.visible,
                locked: v.locked,
                children: v.children?.length ? v.children.map(viewToNode) : undefined,
                isLeaf: !v.children?.length,
            }
        }
        return pages.map((page) => ({
            key: page.id,
            title: page.name,
            isPage: true,
            children: page.children?.map(viewToNode) || [],
        }))
    }, [pages])

    /** 删除节点 */
    const handleDelete = (key: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (isPageKey(pages, key)) {
            if (pages.length <= 1) return
            actions.page.remove(key)
        } else {
            actions.view.delete(key)
        }
    }

    /** 是否允许显示删除按钮 */
    const canDelete = (node: TreeNode): boolean => {
        if (node.isPage && pages.length <= 1) return false
        return true
    }

    /** titleRender */
    const titleRender = (node: TreeNode) => {
        if (editingKey === node.key) {
            return (
                <InlineEdit
                    defaultValue={node.title}
                    onCommit={(val) => {
                        if (node.isPage) {
                            actions.page.rename(node.key, val)
                        } else {
                            actions.view.rename(node.key, val)
                        }
                        setEditingKey(null)
                    }}
                    onCancel={() => setEditingKey(null)}
                />
            )
        }

        return (
            <span
                style={nodeTitleWrapperStyle}
                onDoubleClick={(e) => {
                    e.stopPropagation()
                    setEditingKey(node.key)
                }}
            >
                <span style={nodeTitleTextStyle}>{node.title}</span>

                <span style={nodeBtnsStyle} className="page-list-node-btns">
                    {/* 锁定/解锁（仅 view 节点） */}
                    {!node.isPage && (
                        <span
                            style={{ ...nodeBtnStyle, color: node.locked ? '#1677ff' : '#bfbfbf' }}
                            title={node.locked ? '解锁' : '锁定'}
                            onClick={(e) => {
                                e.stopPropagation()
                                actions.view.setLocked(node.key, !node.locked)
                            }}
                        >
                            {node.locked ? <LockIcon /> : <UnlockIcon />}
                        </span>
                    )}

                    {/* 可见/隐藏（仅 view 节点） */}
                    {!node.isPage && (
                        <span
                            style={{ ...nodeBtnStyle, color: !node.visible ? '#1677ff' : '#bfbfbf' }}
                            title={node.visible ? '隐藏' : '显示'}
                            onClick={(e) => {
                                e.stopPropagation()
                                actions.view.setVisible(node.key, !node.visible)
                            }}
                        >
                            {node.visible ? <EyeIcon /> : <EyeInvisibleIcon />}
                        </span>
                    )}

                    {/* 删除 */}
                    {canDelete(node) && (
                        <span
                            style={nodeBtnStyle}
                            title="删除"
                            onClick={(e) => handleDelete(node.key, e)}
                        >
                            <CloseIcon />
                        </span>
                    )}
                </span>
            </span>
        )
    }

    // 选中高亮
    const selectedKeys = useMemo(() => {
        const keys: string[] = []
        function collectActived(nodes: IViewNode[]) {
            for (const node of nodes) {
                if (node.actived) keys.push(node.id)
                if (node.children) collectActived(node.children)
            }
        }
        for (const page of pages) {
            collectActived(page.children || [])
        }
        if (keys.length === 0 && currentPageId) {
            keys.push(currentPageId)
        }
        return keys
    }, [pages, currentPageId])

    // 始终展开所有页面节点，以及所有有子节点的 view 节点
    const expandedKeys = useMemo(() => {
        const keys: string[] = pages.map((p) => p.id)
        function collectExpandable(nodes: IViewNode[]) {
            for (const node of nodes) {
                if (node.children && node.children.length > 0) {
                    keys.push(node.id)
                    collectExpandable(node.children)
                }
            }
        }
        for (const page of pages) {
            collectExpandable(page.children || [])
        }
        return keys
    }, [pages])

    const handleSelect = (
        _keys: React.Key[],
        info: { node: { key: React.Key }; nativeEvent: MouseEvent },
    ) => {
        const key = info.node.key as string
        if (!key) {
            actions.view.deselect()
            return
        }

        const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
        const isCtrl = isMac ? info.nativeEvent.metaKey : info.nativeEvent.ctrlKey
        if (isPageKey(pages, key)) {
            actions.view.deselect()
            actions.page.navigateTo(key)
        } else {
            const ownerPageId = findOwnerPageId(pages, key)
            if (ownerPageId && ownerPageId !== currentPageId) {
                actions.view.deselect()
                actions.page.navigateTo(ownerPageId)
                actions.view.select(key)
            } else {
                actions.view.select(key, isCtrl)
            }
        }
    }

    return (
        <div style={pageListStyle}>
            <div style={headerStyle}>
                <span style={titleStyle}>页面</span>
                <Button
                    type="text"
                    size="small"
                    icon={<PlusIcon />}
                    onClick={() => actions.page.add()}
                />
            </div>
            <div style={treeWrapperStyle}>
                <Tree<TreeNode>
                    treeData={treeData}
                    titleRender={titleRender}
                    selectedKeys={selectedKeys}
                    expandedKeys={expandedKeys}
                    onSelect={handleSelect}
                    multiple
                    blockNode
                    motion={null}
                    showLine={{ showLeafIcon: false }}
                    switcherIcon={(props: TreeNodeProps) =>
                        props.expanded ? <DownIcon /> : <RightIcon />
                    }
                />
            </div>
            {/* 隐藏按钮组直到 hover 的 CSS（注入全局 style） */}
            <style>{`
                .page-list-node-btns { opacity: 0; transition: opacity 0.15s; }
                *:hover > .page-list-node-btns { opacity: 1; }
            `}</style>
        </div>
    )
}

export default PageList
