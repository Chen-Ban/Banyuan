import React from 'react'
import type { IPageNode, IBanvasActions } from 'banvasgl'

interface SceneListProps {
    pages: IPageNode[]
    currentPageId: string | null
    actions: IBanvasActions
}

const SceneList: React.FC<SceneListProps> = ({ pages, currentPageId, actions }) => {
    return (
        <div>
            {pages.map((page) => (
                <div
                    key={page.id}
                    style={{
                        fontWeight: page.id === currentPageId ? 'bold' : 'normal',
                        cursor: 'pointer',
                    }}
                    onClick={() => actions.page.navigateTo(page.id)}
                >
                    {page.name}
                </div>
            ))}
        </div>
    )
}
export default SceneList
