import { useState, useEffect, useCallback } from 'react'
import { Card, Row, Col, Input, Button, Empty, Spin, message } from 'antd'
import { SearchOutlined, EyeOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { templateApi } from '@/api'
import type { Template } from '@/api'
import { getErrorMessage } from '@/utils/error'
import styles from './index.module.scss'

const { Search } = Input

const TemplateList = () => {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')

  // 加载模板列表
  const loadTemplates = useCallback(async (searchKeyword?: string) => {
    setLoading(true)
    try {
      const res = await templateApi.fetchTemplates(1, 50, searchKeyword)
      setTemplates(res.data.templates)
    } catch (error: unknown) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始化加载模板
  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // 搜索模板
  const handleSearch = (value: string) => {
    setKeyword(value)
    loadTemplates(value)
  }

  // 查看模板详情
  const handleViewDetail = (templateId: string) => {
    navigate(`/template/${templateId}`)
  }

  // 创建新模板
  const handleCreateTemplate = () => {
    navigate('/template/new')
  }

  // 删除模板
  const handleDelete = async (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation()
    try {
      await templateApi.deleteTemplate(templateId)
      message.success('模板删除成功')
      loadTemplates(keyword)
    } catch (error: unknown) {
      message.error(getErrorMessage(error))
    }
  }

  return (
    <div className={styles.templateListPage}>
      <div className={styles.templateListHeader}>
        <h1>模板列表</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateTemplate}>
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
              setKeyword('')
              loadTemplates()
            }
          }}
          style={{ maxWidth: 500 }}
        />
      </div>

      <Spin spinning={loading}>
        <div className={styles.templateListContent}>
          {templates.length === 0 && !loading ? (
            <Empty description="暂无模板数据" />
          ) : (
            <Row gutter={[16, 16]}>
              {templates.map((template) => (
                <Col key={template.id} xs={24} sm={12} md={8} lg={6}>
                  <Card
                    onClick={() => handleViewDetail(template.id)}
                    hoverable
                    className={styles.templateCard}
                    cover={
                      template.thumbnail ? (
                        <img
                          alt={template.name}
                          src={template.thumbnail}
                          className={styles.templateThumbnail}
                        />
                      ) : (
                        <div className={styles.templateThumbnailPlaceholder}>
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
                          handleViewDetail(template.id)
                        }}
                      >
                        编辑
                      </Button>,
                      <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => handleDelete(e, template.id)}
                      >
                        删除
                      </Button>,
                    ]}
                  >
                    <Card.Meta
                      title={template.name}
                      description={
                        <div>
                          <p className={styles.templateDescription}>{template.description || '暂无描述'}</p>
                          <p className={styles.templateMeta}>
                            更新于: {new Date(template.updatedAt).toLocaleDateString()}
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

export default TemplateList
