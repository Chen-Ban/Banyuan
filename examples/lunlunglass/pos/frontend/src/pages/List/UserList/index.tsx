import { useState } from 'react'
import { Input, Button, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { UserFilters } from '@/types'
import UserCardList from '@/pages/List/components/UserCardList'
import styles from './index.module.scss'

const UserList = () => {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<UserFilters>({})
  const [username, setUsername] = useState('')
  const [userId, setUserId] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const handleSearch = () => {
    setFilters({
      username: username || undefined,
      userId: userId || undefined,
      email: email || undefined,
      phone: phone || undefined,
    })
  }

  const handleReset = () => {
    setUsername('')
    setUserId('')
    setEmail('')
    setPhone('')
    setFilters({})
  }

  const handleCreateUser = () => {
    navigate('/user')
  }

  return (
    <div className={styles.userList}>
      <div className={styles.filtersPanel}>
        <Space size="middle" wrap>
          <Input
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Input
            placeholder="用户ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Input
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: 220 }}
            allowClear
          />
          <Input
            placeholder="手机号"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Button type="primary" onClick={handleSearch}>
            查询
          </Button>
          <Button onClick={handleReset}>重置</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateUser}>
            新建用户
          </Button>
        </Space>
      </div>
      <UserCardList filters={filters} />
    </div>
  )
}

export default UserList
