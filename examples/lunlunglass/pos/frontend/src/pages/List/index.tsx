import { useState } from 'react'
import { Tabs } from 'antd'
import type { TabsProps } from 'antd'
import UserList from '@/pages/List/UserList'
import OrderList from '@/pages/List/OrderList'
import styles from './index.module.scss'

const ListPage = () => {
  const [activeTab, setActiveTab] = useState<string>('users')

  const tabItems: TabsProps['items'] = [
    {
      key: 'users',
      label: '用户信息',
      children: <UserList />,
    },
    {
      key: 'orders',
      label: '订单信息',
      children: <OrderList />,
    },
  ]

  return (
    <div className={styles.listPage}>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} size="large" />
    </div>
  )
}

export default ListPage
