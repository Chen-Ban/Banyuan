import { useMemo, useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useBanvas } from 'banvasgl'
import { Button, Input, message, Space } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { templateApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import styles from './index.module.scss'
import ComponentPalette from './components/ComponentPalette'
import PropertyPanel from './components/PropertyPanel'
import SceneList from './components/SceneList'
import ContextMenu from './components/ContextMenu'

const TemplateDetail = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const isNew = id === 'new' || !id

    const [templateName, setTemplateName] = useState('')
    const [templateDescription, setTemplateDescription] = useState('')
    const [initialScenes, setInitialScenes] = useState<string[]>([])
    const [loaded, setLoaded] = useState(isNew)
    const [saving, setSaving] = useState(false)

    // 加载模板数据
    useEffect(() => {
        if (!isNew && id) {
            templateApi.fetchTemplate(id).then(res => {
                const template = res.data!
                setTemplateName(template.name)
                setTemplateDescription(template.description || '')
                setInitialScenes(template.scenes || [])
                setLoaded(true)
            }).catch((err: unknown) => {
                message.error(getErrorMessage(err))
                setLoaded(true)
            })
        }
    }, [id, isNew])

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

    const { Banvas, pages, currentPageId, selectedViewId, actions, contextMenu } = useBanvas(
        loaded ? initialScenes : [],
        banvasOptions
    )

    // 保存模板
    const handleSave = useCallback(async () => {
        if (!templateName.trim()) {
            message.warning('请输入模板名称')
            return
        }

        setSaving(true)
        try {
            const scenes = actions.getSerializedScenes()

            if (isNew) {
                const newId = `template_${Date.now()}`
                await templateApi.createTemplate({
                    id: newId,
                    name: templateName,
                    description: templateDescription,
                    scenes,
                })
                message.success('模板创建成功')
                navigate('/template', { replace: true })
            } else {
                await templateApi.updateTemplate(id!, {
                    name: templateName,
                    description: templateDescription,
                    scenes,
                })
                message.success('模板保存成功')
            }
        } catch (error: unknown) {
            message.error(getErrorMessage(error))
        } finally {
            setSaving(false)
        }
    }, [templateName, templateDescription, actions, isNew, id, navigate])

    const handleBack = () => {
        navigate('/template')
    }

    if (!loaded) {
        return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>
    }

    return (
        <div className={styles.templateDetailPage}>
            <div className={styles.templateDetailHeader}>
                <Space>
                    <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
                        返回
                    </Button>
                    <Input
                        placeholder="模板名称"
                        value={templateName}
                        onChange={e => setTemplateName(e.target.value)}
                        style={{ width: 200 }}
                    />
                    <Input
                        placeholder="模板描述（可选）"
                        value={templateDescription}
                        onChange={e => setTemplateDescription(e.target.value)}
                        style={{ width: 260 }}
                    />
                </Space>
                <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={saving}
                    onClick={handleSave}
                >
                    {isNew ? '创建模板' : '保存'}
                </Button>
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
                    <PropertyPanel
                        selectedViewId={selectedViewId}
                        actions={actions}
                    />
                </div>
            </div>
            <ContextMenu state={contextMenu} />
        </div>
    )
}

export default TemplateDetail
