import { useState, useEffect, useCallback } from 'react'
import { Table, Pagination, Button, Popconfirm, Modal, Descriptions, Space, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EyeOutlined, DeleteOutlined, PrinterOutlined, EditOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { orderApi } from '@/api'
import { getErrorMessage } from '@/utils/error'
import type { Order, OrderFilters, OrderItem } from '@/types'
import styles from './index.module.scss'

interface OrderTableProps {
  filters: OrderFilters
}

const OrderTable = ({ filters }: OrderTableProps) => {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  const columns: ColumnsType<Order> = [
    {
      title: '订单ID',
      dataIndex: 'orderId',
      key: 'orderId',
      width: 150,
      fixed: 'left',
    },
    {
      title: '用户ID',
      dataIndex: 'userId',
      key: 'userId',
      width: 120,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 120,
    },
    {
      title: '商品',
      key: 'products',
      width: 300,
      render: (_: unknown, record: Order) => {
        if (record.items.length === 0) return '-'
        if (record.items.length === 1) {
          return `${record.items[0].product.name} x${record.items[0].quantity}`
        }
        return `${record.items[0].product.name} 等${record.items.length}件商品`
      },
    },
    {
      title: '商品数量',
      key: 'totalQuantity',
      width: 100,
      align: 'right',
      render: (_: unknown, record: Order) => {
        return record.items.reduce((sum, item) => sum + item.quantity, 0)
      },
    },
    {
      title: '总金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      align: 'right',
      render: (amount: number) => `¥${amount.toFixed(2)}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const statusMap: Record<string, { text: string; color: string }> = {
          pending: { text: '待处理', color: '#faad14' },
          processing: { text: '处理中', color: '#1890ff' },
          completed: { text: '已完成', color: '#52c41a' },
          cancelled: { text: '已取消', color: '#ff4d4f' },
        }
        const statusInfo = statusMap[status] || { text: status, color: '#666' }
        return <span style={{ color: statusInfo.color, fontWeight: 500 }}>{statusInfo.text}</span>
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 240,
      fixed: 'right',
      render: (_: unknown, record: Order) => (
        <Space size="small">
          <Button type="link" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>
            详情
          </Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="删除订单"
            description="确定要删除这个订单吗？"
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
          <Button type="link" icon={<PrinterOutlined />} onClick={() => handlePrint()}>
            打印
          </Button>
        </Space>
      ),
    },
  ]

  // 获取订单数据
  const fetchOrders = useCallback(
    async (page: number, size: number) => {
      setLoading(true)
      try {
        const res = await orderApi.fetchOrders(page, size, filters)
        setOrders(res.data.orders)
        setTotal(res.data.total)
      } catch (error: unknown) {
        message.error(getErrorMessage(error))
      } finally {
        setLoading(false)
      }
    },
    [filters],
  )

  useEffect(() => {
    fetchOrders(currentPage, pageSize)
  }, [fetchOrders, currentPage, pageSize])

  const handlePageChange = (page: number, size?: number) => {
    setCurrentPage(page)
    if (size && size !== pageSize) {
      setPageSize(size)
    }
  }

  // 查看详情
  const handleViewDetail = (order: Order) => {
    setSelectedOrder(order)
    setDetailModalVisible(true)
  }

  // 编辑订单
  const handleEdit = (order: Order) => {
    navigate(`/order/${order.id}`)
  }

  // 删除订单
  const handleDelete = async (order: Order) => {
    try {
      await orderApi.deleteOrder(order.id)
      message.success('订单删除成功')
      fetchOrders(currentPage, pageSize)
    } catch (error: unknown) {
      message.error(getErrorMessage(error))
    }
  }

  // 打印订单
  const handlePrint = () => {
    message.info('打印功能暂未实现')
  }

  // 获取状态文本
  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: '待处理',
      processing: '处理中',
      completed: '已完成',
      cancelled: '已取消',
    }
    return statusMap[status] || status
  }

  return (
    <div className={styles.orderTableContainer}>
      <Table
        columns={columns}
        dataSource={orders}
        loading={loading}
        rowKey="id"
        pagination={false}
        scroll={{ x: 1400 }}
      />
      <div className={styles.orderTablePagination}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          showQuickJumper
          showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条/共 ${total} 条`}
          onChange={handlePageChange}
          onShowSizeChange={handlePageChange}
          pageSizeOptions={['10', '20', '50', '100']}
        />
      </div>

      {/* 订单详情弹窗 */}
      <Modal
        title="订单详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={800}
      >
        {selectedOrder && (
          <Descriptions column={2} bordered>
            <Descriptions.Item label="订单ID">{selectedOrder.orderId}</Descriptions.Item>
            <Descriptions.Item label="订单状态">
              <span
                style={{
                  color:
                    selectedOrder.status === 'completed'
                      ? '#52c41a'
                      : selectedOrder.status === 'cancelled'
                        ? '#ff4d4f'
                        : selectedOrder.status === 'processing'
                          ? '#1890ff'
                          : '#faad14',
                  fontWeight: 500,
                }}
              >
                {getStatusText(selectedOrder.status)}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="用户ID">{selectedOrder.userId}</Descriptions.Item>
            <Descriptions.Item label="用户名">{selectedOrder.username}</Descriptions.Item>
            <Descriptions.Item label="商品列表" span={3}>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {selectedOrder.items.map((item: OrderItem, index: number) => (
                  <div
                    key={index}
                    style={{
                      marginBottom: '12px',
                      padding: '8px',
                      background: '#f5f5f5',
                      borderRadius: '4px',
                    }}
                  >
                    <div>
                      <strong>{item.product.name}</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      <span>商品ID: {item.product.id}</span>
                      {item.product.sku && (
                        <span style={{ marginLeft: '12px' }}>SKU: {item.product.sku}</span>
                      )}
                      {item.product.spec && (
                        <span style={{ marginLeft: '12px' }}>规格: {item.product.spec}</span>
                      )}
                    </div>
                    <div style={{ marginTop: '4px' }}>
                      <span>数量: {item.quantity}</span>
                      <span style={{ marginLeft: '12px' }}>单价: ¥{item.price.toFixed(2)}</span>
                      <span style={{ marginLeft: '12px', color: '#1890ff', fontWeight: 'bold' }}>
                        小计: ¥{item.subtotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="总金额" span={2}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#ff4d4f' }}>
                ¥{selectedOrder.totalAmount.toFixed(2)}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>
              {new Date(selectedOrder.createdAt).toLocaleString('zh-CN')}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

export default OrderTable
