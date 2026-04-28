import { useState } from 'react'
import { Input, Button, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { OrderFilters } from '@/types'
import OrderTable from '@/pages/List/components/OrderTable'
import styles from './index.module.scss'

const OrderList = () => {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<OrderFilters>({})
  const [username, setUsername] = useState('')
  const [userId, setUserId] = useState('')
  const [orderId, setOrderId] = useState('')
  const [productId, setProductId] = useState('')

  const handleSearch = () => {
    setFilters({
      username: username || undefined,
      userId: userId || undefined,
      orderId: orderId || undefined,
      productId: productId || undefined,
    })
  }

  const handleReset = () => {
    setUsername('')
    setUserId('')
    setOrderId('')
    setProductId('')
    setFilters({})
  }

  const handleCreateOrder = () => {
    navigate('/order')
  }

  return (
    <div className={styles.orderList}>
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
            placeholder="订单ID"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Input
            placeholder="商品ID"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Button type="primary" onClick={handleSearch}>
            查询
          </Button>
          <Button onClick={handleReset}>重置</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreateOrder}
          >
            新建订单
          </Button>
        </Space>
      </div>
      <OrderTable filters={filters} />
    </div>
  )
}

export default OrderList

