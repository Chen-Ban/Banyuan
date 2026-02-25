import { useState, useEffect } from 'react'
import { Card, Row, Col, Input, Button, Empty } from 'antd'
import { SearchOutlined, EyeOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import styles from './index.module.scss'

const { Search } = Input

interface Template {
    id: string
    name: string
    description?: string
    thumbnail?: string
    createdAt: string
    updatedAt: string
}

const TemplateList = () => {
    const navigate = useNavigate()
    const [templates, setTemplates] = useState<Template[]>([])

    // 模拟模板数据
    const mockTemplates: Template[] = [
        {
            id: '1',
            name: '模板1',
            description: '这是一个示例模板',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
        {
            id: '2',
            name: '模板2',
            description: '另一个示例模板',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
    ]

    // 初始化加载模板
    useEffect(() => {
        setTemplates(mockTemplates)
    }, [])

    // 搜索模板
    const handleSearch = (value: string) => {
        // 这里应该调用API搜索模板
        const filtered = mockTemplates.filter(
            (template) =>
                template.name.toLowerCase().includes(value.toLowerCase()) ||
                template.description
                    ?.toLowerCase()
                    .includes(value.toLowerCase())
        )
        setTemplates(filtered)
    }

    // 查看模板详情
    const handleViewDetail = (templateId: string) => {
        navigate(`/template/${templateId}`)
    }

    // 创建新模板
    const handleCreateTemplate = () => {
        navigate('/template/new')
    }

    return (
        <div className={styles.templateListPage}>
            <div className={styles.templateListHeader}>
                <h1>模板列表</h1>
                <Button type="primary" onClick={handleCreateTemplate}>
                    创建新模板
                </Button>
            </div>

            <div className={styles.templateListFilters}>
                <Search
                    placeholder="搜索模板名称或描述"
                    allowClear
                    enterButton={<SearchOutlined />}
                    size="large"
                    onSearch={handleSearch}
                    onChange={(e) => {
                        if (!e.target.value) {
                            setTemplates(mockTemplates)
                        }
                    }}
                    style={{ maxWidth: 500 }}
                />
            </div>

            <div className={styles.templateListContent}>
                {templates.length === 0 ? (
                    <Empty description="暂无模板数据" />
                ) : (
                    <Row gutter={[16, 16]}>
                        {templates.map((template) => (
                            <Col
                                key={template.id}
                                xs={24}
                                sm={12}
                                md={8}
                                lg={6}
                            >
                                <Card
                                    onClick={() =>
                                        handleViewDetail(template.id)
                                    }
                                    hoverable
                                    className={styles.templateCard}
                                    cover={
                                        template.thumbnail ? (
                                            <img
                                                alt={template.name}
                                                src={template.thumbnail}
                                                className={
                                                    styles.templateThumbnail
                                                }
                                            />
                                        ) : (
                                            <div
                                                className={
                                                    styles.templateThumbnailPlaceholder
                                                }
                                            >
                                                <span>暂无预览图</span>
                                            </div>
                                        )
                                    }
                                    actions={[
                                        <Button
                                            type="link"
                                            icon={<EyeOutlined />}
                                            onClick={() =>
                                                handleViewDetail(template.id)
                                            }
                                        >
                                            查看详情
                                        </Button>,
                                    ]}
                                >
                                    <Card.Meta
                                        title={template.name}
                                        description={
                                            <div>
                                                <p
                                                    className={
                                                        styles.templateDescription
                                                    }
                                                >
                                                    {template.description ||
                                                        '暂无描述'}
                                                </p>
                                                <p
                                                    className={
                                                        styles.templateMeta
                                                    }
                                                >
                                                    更新于:{' '}
                                                    {new Date(
                                                        template.updatedAt
                                                    ).toLocaleDateString()}
                                                </p>
                                            </div>
                                        }
                                    />
                                </Card>
                            </Col>
                        ))}
                    </Row>
                )}
            </div>
        </div>
    )
}

export default TemplateList
