import { useState, useEffect, useCallback } from 'react'
import { Card, Row, Col, Input, Button, Empty, Spin, message } from 'antd'
import { SearchOutlined, EyeOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { applicationApi } from '@/api'
import type { Application } from '@/api'
import { getErrorMessage } from '@/utils/error'
import styles from './index.module.scss'

const { Search } = Input

const ApplicationList = () => {
    const navigate = useNavigate()
    const [applications, setApplications] = useState<Application[]>([])
    const [loading, setLoading] = useState(false)
    const [keyword, setKeyword] = useState('')

    // 加载应用列表
    const loadApplications = useCallback(async (searchKeyword?: string) => {
        setLoading(true)
        try {
            const res = await applicationApi.fetchApplications(1, 50, searchKeyword)
            setApplications(res.data.applications)
        } catch (error: unknown) {
            message.error(getErrorMessage(error))
        } finally {
            setLoading(false)
        }
    }, [])

    // 初始化加载应用
    useEffect(() => {
        loadApplications()
    }, [loadApplications])

    // 搜索应用
    const handleSearch = (value: string) => {
        setKeyword(value)
        loadApplications(value)
    }

    // 查看应用详情
    const handleViewDetail = (applicationId: string) => {
        navigate(`/application/${applicationId}/ui`)
    }

    // 创建新应用：先调后端创建空白应用，拿到 ID 后跳转
    const [creating, setCreating] = useState(false)
    const handleCreateApplication = async () => {
        setCreating(true)
        try {
            const res = await applicationApi.createApplication()
            const application = res.data!
            navigate(`/application/${application.application_id}/ui`)
        } catch (error: unknown) {
            message.error(getErrorMessage(error))
        } finally {
            setCreating(false)
        }
    }

    // 删除应用
    const handleDelete = async (e: React.MouseEvent, applicationId: string) => {
        e.stopPropagation()
        try {
            await applicationApi.deleteApplication(applicationId)
            message.success('应用删除成功')
            loadApplications(keyword)
        } catch (error: unknown) {
            message.error(getErrorMessage(error))
        }
    }

    return (
        <div className={styles.applicationListPage}>
            <div className={styles.applicationListHeader}>
                <h1>应用列表</h1>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateApplication} loading={creating}>
                    创建新应用
                </Button>
            </div>

            <div className={styles.applicationListFilters}>
                <Search
                    placeholder="搜索应用名称或描述"
                    allowClear
                    enterButton={<SearchOutlined />}
                    size="large"
                    onSearch={handleSearch}
                    onChange={(e) => {
                        if (!e.target.value) {
                            setKeyword('')
                            loadApplications()
                        }
                    }}
                    style={{ maxWidth: 500 }}
                />
            </div>

            <Spin spinning={loading}>
                <div className={styles.applicationListContent}>
                    {applications.length === 0 && !loading ? (
                        <Empty description="暂无应用数据" />
                    ) : (
                        <Row gutter={[16, 16]}>
                            {applications.map((application) => (
                                <Col
                                    key={application.application_id}
                                    xs={24}
                                    sm={12}
                                    md={8}
                                    lg={6}
                                >
                                    <Card
                                        onClick={() =>
                                            handleViewDetail(application.application_id)
                                        }
                                        hoverable
                                        className={styles.applicationCard}
                                        cover={
                                            application.thumbnail ? (
                                                <img
                                                    alt={application.name}
                                                    src={application.thumbnail}
                                                    className={
                                                        styles.applicationThumbnail
                                                    }
                                                />
                                            ) : (
                                                <div
                                                    className={
                                                        styles.applicationThumbnailPlaceholder
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
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleViewDetail(application.application_id)
                                                }}
                                            >
                                                编辑
                                            </Button>,
                                            <Button
                                                type="link"
                                                danger
                                                icon={<DeleteOutlined />}
                                                onClick={(e) => handleDelete(e, application.application_id)}
                                            >
                                                删除
                                            </Button>,
                                        ]}
                                    >
                                        <Card.Meta
                                            title={application.name}
                                            description={
                                                <div>
                                                    <p
                                                        className={
                                                            styles.applicationDescription
                                                        }
                                                    >
                                                        {application.description ||
                                                            '暂无描述'}
                                                    </p>
                                                    <p
                                                        className={
                                                            styles.applicationMeta
                                                        }
                                                    >
                                                        更新于:{' '}
                                                        {new Date(
                                                            application.updatedAt
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
            </Spin>
        </div>
    )
}

export default ApplicationList
