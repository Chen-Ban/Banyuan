import { useState, useEffect, useCallback } from 'react'
import { Form, Input, Button, Card, message, Row, Col } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import type { FormProps } from 'antd'
import { userApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import type { UserFormData, OptometryParams } from '@/types'
import FaceDiagram from './components/FaceDiagram'
import OptometryControls from './components/OptometryControls'
import styles from './index.module.scss'

const defaultOptometryParams: OptometryParams = {
  pd: { left: 32, right: 32 },
  left: { sph: -1.5, cyl: -0.75, axis: 90, ph: 18, add: 0 },
  right: { sph: -1.25, cyl: -0.5, axis: 85, ph: 18, add: 0 },
}

interface LocationState {
  returnTo?: string
}

const UserPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id?: string }>()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [initialLoading, setInitialLoading] = useState(false)
  const [optometryParams, setOptometryParams] = useState<OptometryParams>(defaultOptometryParams)

  const loadUserData = useCallback(
    async (userId: string) => {
      setInitialLoading(true)
      try {
        const res = await userApi.fetchUser(userId)
        const user = res.data!
        const formData: UserFormData = {
          userId: user.userId,
          username: user.username,
          email: user.email,
          phone: user.phone,
          optometry: user.optometry || defaultOptometryParams,
        }
        form.setFieldsValue(formData)
        if (formData.optometry) {
          setOptometryParams(formData.optometry)
        }
      } catch {
        message.error('加载用户数据失败')
      } finally {
        setInitialLoading(false)
      }
    },
    [form],
  )

  useEffect(() => {
    if (id) {
      setIsEditMode(true)
      loadUserData(id)
    } else {
      setIsEditMode(false)
    }
  }, [id, loadUserData])

  const handleOptometryChange = (params: OptometryParams) => {
    setOptometryParams(params)
  }

  const handleBack = () => {
    const state = location.state as LocationState | null
    if (state?.returnTo) {
      navigate(state.returnTo)
    } else {
      navigate('/list')
    }
  }

  const handleSubmit: FormProps<UserFormData>['onFinish'] = async (values) => {
    setLoading(true)
    try {
      const payload: UserFormData = { ...values, optometry: optometryParams }
      if (isEditMode) {
        await userApi.updateUser(id!, payload)
        message.success('用户更新成功！')
      } else {
        await userApi.createUser(payload)
        message.success('用户创建成功！')
      }
      const state = location.state as LocationState | null
      if (state?.returnTo && !isEditMode) {
        setTimeout(() => {
          navigate(state.returnTo!, { state: { newUser: payload } })
        }, 1000)
      } else {
        setTimeout(() => {
          navigate('/list')
        }, 1000)
      }
    } catch (error: unknown) {
      message.error(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    if (isEditMode) {
      loadUserData(id!)
    } else {
      form.resetFields()
      setOptometryParams(defaultOptometryParams)
      form.setFieldsValue({ optometry: defaultOptometryParams })
    }
  }

  if (initialLoading) {
    return <div className={styles.userPage}>加载中...</div>
  }

  return (
    <div className={styles.userPage}>
      <div className={styles.userPageHeader}>
        <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回列表
        </Button>
        <h2>{isEditMode ? '编辑用户' : '新建用户'}</h2>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className={styles.userPageForm}
        initialValues={{ optometry: defaultOptometryParams }}
      >
        <Row gutter={24}>
          <Col xs={24} lg={12}>
            <Card title="用户信息" className={styles.formSectionCard}>
              <Form.Item
                label="用户ID"
                name="userId"
                rules={[
                  { required: true, message: '请输入用户ID' },
                  { pattern: /^[a-zA-Z0-9_]+$/, message: '用户ID只能包含字母、数字和下划线' },
                ]}
              >
                <Input placeholder="请输入用户ID" disabled={isEditMode} />
              </Form.Item>
              <Form.Item
                label="用户名"
                name="username"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 2, message: '用户名至少2个字符' },
                  { max: 50, message: '用户名最多50个字符' },
                ]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>
              <Form.Item
                label="邮箱"
                name="email"
                rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
              >
                <Input placeholder="请输入邮箱（可选）" />
              </Form.Item>
              <Form.Item
                label="电话"
                name="phone"
                rules={[{ pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号码' }]}
              >
                <Input placeholder="请输入电话（可选）" />
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="验光参数" className={styles.formSectionCard}>
              <FaceDiagram params={optometryParams} />
            </Card>
          </Col>
        </Row>

        <Card title="验光参数设置" className={styles.formSectionCard}>
          <OptometryControls params={optometryParams} onChange={handleOptometryChange} />
        </Card>

        <div className={styles.formActions}>
          <Button onClick={handleReset}>{isEditMode ? '重置' : '清空'}</Button>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
            {isEditMode ? '更新用户' : '创建用户'}
          </Button>
        </div>
      </Form>
    </div>
  )
}

export default UserPage
