import React from 'react'
import { Button } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { IPageNode, IBanvasActions } from 'banvasgl'
import styles from './index.module.scss'

interface SceneListProps {
    pages: IPageNode[]
    currentPageId: string | null
    actions: IBanvasActions
}

const SceneList: React.FC<SceneListProps> = ({ pages, currentPageId, actions }) => {
    return (
        <div className={styles.sceneList}>
            <div className={styles.title}>页面列表</div>
            {pages.map((page) => (
                <div
                    key={page.id}
                    className={`${styles.pageItem} ${page.id === currentPageId ? styles.active : ''}`}
                    onClick={() => actions.page.navigateTo(page.id)}
                >
                    {page.name}
                </div>
            ))}
            <Button
                className={styles.addButton}
                size="small"
                icon={<PlusOutlined />}
                onClick={() => actions.page.add()}
            >
                新增页面
            </Button>
        </div>
    )
}
export default SceneList
