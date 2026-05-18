import { useState, useCallback } from 'react'
import { Button, message } from 'antd'
import { PrinterOutlined } from '@ant-design/icons'
import TemplateSelector from '../TemplateSelector'
import { printApi } from '@/api'
import { getErrorMessage } from '@/utils/error'

interface PrintButtonProps {
  /** 订单 ID（业务 orderId 或 MongoDB _id） */
  orderId: string
  /** 按钮文字，默认 "打印标签" */
  label?: string
  /** 按钮大小 */
  size?: 'small' | 'middle' | 'large'
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'dashed' | 'link' | 'text'
  /** 额外的 className */
  className?: string
  /** 打印成功回调 */
  onSuccess?: (printJobId: string) => void
}

/**
 * PrintButton 打印按钮组件
 *
 * 放在订单详情页的操作栏，点击弹出模板选择器弹窗。
 * 选择模板后调用 POST /api/print，传入 snapshotId + orderId。
 */
const PrintButton = ({
  orderId,
  label = '打印标签',
  size = 'middle',
  type = 'default',
  className,
  onSuccess,
}: PrintButtonProps) => {
  const [modalOpen, setModalOpen] = useState(false)
  const [printing, setPrinting] = useState(false)

  const handleOpenModal = useCallback(() => {
    setModalOpen(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setModalOpen(false)
  }, [])

  const handleSelectTemplate = useCallback(
    async (snapshotId: string) => {
      setPrinting(true)
      try {
        const res = await printApi.printLabel(snapshotId, orderId)
        const printJobId = res.data?.printJobId ?? ''
        message.success('打印任务已发送！')
        setModalOpen(false)
        onSuccess?.(printJobId)
      } catch (error: unknown) {
        message.error(getErrorMessage(error))
      } finally {
        setPrinting(false)
      }
    },
    [orderId, onSuccess]
  )

  return (
    <>
      <Button
        icon={<PrinterOutlined />}
        onClick={handleOpenModal}
        size={size}
        type={type}
        className={className}
      >
        {label}
      </Button>

      <TemplateSelector
        open={modalOpen}
        printing={printing}
        onSelect={handleSelectTemplate}
        onCancel={handleCloseModal}
      />
    </>
  )
}

export default PrintButton
