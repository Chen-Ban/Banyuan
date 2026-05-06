import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useBanvas } from 'banvasgl'
import { Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import styles from './index.module.scss'
import ComponentPalette from './components/ComponentPalette'
import ComponentPanel from './components/ComponentPanel'
import SceneList from './components/SceneList'

const TemplateDetail = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()

    const banvasOptions = useMemo(
        () => ({
            width: 800,
            height: 600,
            appOptions: {
                enablePageStack: true,
                maxPageStackSize: 50,
            },
            rendererOptions: {
                clearColor: '#fff',
            },
        }),
        []
    )

    const { Banvas, pages, currentPageId, selectedViewId, actions } = useBanvas(
        [],
        banvasOptions
    )

    const handleBack = () => {
        navigate('/template')
    }
    return (
        <div className={styles.templateDetailPage}>
            <div className={styles.templateDetailHeader}>
                <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
                    返回
                </Button>
                <h2>模板详情 {id && `- ${id}`}</h2>
            </div>
            <div className={styles.templateDetailContainer}>
                <div className={styles.mainContent}>
                    <div>
                        <SceneList
                            pages={pages}
                            currentPageId={currentPageId}
                            actions={actions}
                        />
                        <ComponentPalette />
                    </div>
                    <div className={styles.canvasSection}>
                        <div className={styles.canvasWrapper}>{Banvas}</div>
                    </div>
                    <ComponentPanel
                        pages={pages}
                        currentPageId={currentPageId}
                        selectedViewId={selectedViewId}
                        actions={actions}
                    />
                </div>
            </div>
        </div>
    )
}

export default TemplateDetail
