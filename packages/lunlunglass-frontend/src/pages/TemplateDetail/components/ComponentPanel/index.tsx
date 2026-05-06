import React from 'react'
import type { IPageNode, IViewNode, IBanvasActions } from 'banvasgl'

interface ComponentPanelProps {
    pages: IPageNode[]
    currentPageId: string | null
    selectedViewId: string
    actions: IBanvasActions
}

const ComponentPanel: React.FC<ComponentPanelProps> = ({
    pages,
    currentPageId,
    selectedViewId,
    actions,
}) => {
    const currentPage = pages.find((p) => p.id === currentPageId)
    if (!currentPage) {
        return <div>请选择页面</div>
    }

    const renderViewTree = (nodes: IViewNode[], depth = 0): React.ReactNode => {
        return nodes.map((node) => (
            <div
                key={node.id}
                style={{
                    paddingLeft: depth * 16,
                    background: node.id === selectedViewId ? '#e6f7ff' : 'transparent',
                    cursor: 'pointer',
                }}
                onClick={() => actions.view.select(node.id)}
            >
                {node.name}
                {node.locked && ' 🔒'}
                {!node.visible && ' 👁️‍🗨️'}
                {node.children.length > 0 && renderViewTree(node.children, depth + 1)}
            </div>
        ))
    }

    return (
        <div>
            <h4>{currentPage.name} - 图层</h4>
            {renderViewTree(currentPage.children)}
            {selectedViewId && (
                <div style={{ marginTop: 8 }}>
                    <span>选中: {selectedViewId}</span>
                </div>
            )}
        </div>
    )
}

export default ComponentPanel
