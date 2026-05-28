import React, { useEffect, useState, useCallback } from 'react'
import { Modal, Button, Descriptions, Tag, message, Spin } from 'antd'
import { PrinterOutlined, ReloadOutlined } from '@ant-design/icons'
import type { IBanvasActions } from '@banyuan/banvasgl'
import { ViewType } from '@banyuan/banvasgl'
import { fieldsApi, templateApi } from '@/api'
import type { FieldGroup, FieldDefinition, IPrintField } from '@/api'

interface PrintPreviewProps {
  /** 是否显示 */
  visible: boolean
  /** 关闭回调 */
  onClose: () => void
  /** BanvasGL actions */
  actions: IBanvasActions
  /** 画布尺寸 */
  canvasSize: { width: number; height: number }
  /** 模板名称 */
  templateName: string
}

/**
 * PrintPreview — 样张打印预览组件
 *
 * 功能：
 * 1. 使用 mock 数据（字段注册表中的 example 值）填充所有动态字段占位符
 * 2. 在 Canvas 上合成背景图 + 动态字段文本，生成预览图
 * 3. 提供"打印样张"按钮，将合成图发送到后端打印
 *
 * 实现方式：
 * - 背景图：通过 actions.exportImage() 获取（不含动态字段文本）
 * - 动态字段：遍历所有 TextView，找到绑定了 fieldKey 的，用 example 值在对应位置绘制文本
 * - 合成：在浏览器端 Canvas 2D 上完成（不依赖 node-canvas）
 */
const PrintPreview: React.FC<PrintPreviewProps> = ({
  visible,
  onClose,
  actions,
  canvasSize,
  templateName,
}) => {
  const [composedImageUrl, setComposedImageUrl] = useState<string>('')
  const [fieldGroups, setFieldGroups] = useState<FieldGroup[]>([])
  const [dynamicFields, setDynamicFields] = useState<Array<{
    field: IPrintField
    exampleValue: string
  }>>([])
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)

  // 加载字段注册表
  useEffect(() => {
    if (!visible) return
    fieldsApi.fetchFields()
      .then(res => {
        setFieldGroups(res.data ?? [])
      })
      .catch(() => {
        // 使用空列表
      })
  }, [visible])

  /**
   * 合成样张预览图
   * 1. 获取背景图（exportImage 导出的静态内容）
   * 2. 提取动态字段及其 mock 值
   * 3. 在 Canvas 上叠加绘制
   */
  const composePreview = useCallback(() => {
    if (!visible) return
    setLoading(true)

    // 获取背景图
    const backgroundDataUrl = actions.exportImage()
    if (!backgroundDataUrl) {
      message.warning('无法导出背景图')
      setLoading(false)
      return
    }

    // 构建字段 key → FieldDefinition 映射
    const flatFields: FieldDefinition[] = fieldGroups.flatMap(g => g.fields)
    const fieldMap = new Map(flatFields.map(f => [f.key, f]))

    // 提取动态字段列表
    const fields: Array<{ field: IPrintField; exampleValue: string }> = []
    const pageIds = actions.page.getPageIds()
    for (const pageId of pageIds) {
      const viewIds = actions.page.getPageViewIds(pageId)
      const collectFields = (ids: string[]) => {
        for (const viewId of ids) {
          const viewInstance = actions.view.getViewInstance(viewId)
          if (!viewInstance) continue
          if (viewInstance.type === ViewType.TEXTVIEW) {
            const fieldKeySchema = viewInstance.data?.fieldKey
            const fieldKey = fieldKeySchema?.value as string | undefined
            if (fieldKey) {
              const fieldDef = fieldMap.get(fieldKey)
              fields.push({
                field: {
                  key: fieldKey,
                  label: fieldDef?.label ?? fieldKey,
                  type: (fieldDef?.type ?? 'text') as 'text' | 'barcode' | 'qrcode',
                  bounds: {
                    x: viewInstance.viewport.x,
                    y: viewInstance.viewport.y,
                    width: viewInstance.viewport.width,
                    height: viewInstance.viewport.height,
                  },
                },
                exampleValue: fieldDef?.example ?? `{{${fieldKey}}}`,
              })
            }
          }
          // 递归子 view
          if (viewInstance.children?.length) {
            collectFields(viewInstance.children.map((c: any) => c.id))
          }
        }
      }
      collectFields(viewIds)
    }
    setDynamicFields(fields)

    // 在 Canvas 上合成
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvasSize.width
      canvas.height = canvasSize.height
      const ctx = canvas.getContext('2d')!

      // 绘制背景
      ctx.drawImage(img, 0, 0, canvasSize.width, canvasSize.height)

      // 绘制动态字段文本（使用 example 值）
      for (const { field, exampleValue } of fields) {
        if (field.type === 'text') {
          const { bounds } = field
          ctx.save()
          ctx.font = '12px sans-serif'
          ctx.fillStyle = '#000000'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'

          // 简单文本绘制（单行裁剪）
          ctx.beginPath()
          ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
          ctx.clip()
          ctx.fillText(exampleValue, bounds.x, bounds.y)
          ctx.restore()
        }
        // barcode/qrcode 在浏览器端简化为文本占位
        if (field.type === 'barcode' || field.type === 'qrcode') {
          const { bounds } = field
          ctx.save()
          ctx.strokeStyle = '#999'
          ctx.setLineDash([2, 2])
          ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
          ctx.font = '10px sans-serif'
          ctx.fillStyle = '#666'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(
            field.type === 'barcode' ? `[条码] ${exampleValue}` : `[二维码] ${exampleValue}`,
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2
          )
          ctx.restore()
        }
      }

      // 热敏打印机二值化处理
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const threshold = 180
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
        const bw = gray < threshold ? 0 : 255
        data[i] = bw
        data[i + 1] = bw
        data[i + 2] = bw
      }
      ctx.putImageData(imageData, 0, 0)

      setComposedImageUrl(canvas.toDataURL('image/png'))
      setLoading(false)
    }
    img.onerror = () => {
      message.error('背景图加载失败')
      setLoading(false)
    }
    img.src = backgroundDataUrl
  }, [visible, actions, canvasSize, fieldGroups])

  // 打开时自动合成
  useEffect(() => {
    if (visible && fieldGroups.length > 0) {
      composePreview()
    }
  }, [visible, fieldGroups, composePreview])

  /**
   * 打印样张：将合成图发送到后端打印接口
   */
  const handlePrintSample = useCallback(async () => {
    if (!composedImageUrl) {
      message.warning('请先生成预览图')
      return
    }

    setPrinting(true)
    try {
      await templateApi.printSample({
        image: composedImageUrl,
        width: canvasSize.width,
        height: canvasSize.height,
        templateName,
      })
      message.success('样张已发送到打印机')
    } catch {
      message.error('打印失败，请检查打印机连接')
    } finally {
      setPrinting(false)
    }
  }, [composedImageUrl, canvasSize, templateName])

  return (
    <Modal
      open={visible}
      title="样张打印预览"
      onCancel={onClose}
      width={720}
      centered
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={composePreview}>
          刷新预览
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          loading={printing}
          onClick={handlePrintSample}
        >
          打印样张
        </Button>,
      ]}
    >
      <Spin spinning={loading}>
        <div style={{ display: 'flex', gap: 16 }}>
          {/* 左侧：预览图 */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f5f5f5',
            borderRadius: 4,
            padding: 16,
            minHeight: 300,
          }}>
            {composedImageUrl ? (
              <img
                src={composedImageUrl}
                alt="样张预览"
                style={{
                  maxWidth: '100%',
                  maxHeight: '50vh',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
                  background: '#fff',
                }}
              />
            ) : (
              <div style={{ color: '#999', fontSize: 13 }}>
                正在生成预览...
              </div>
            )}
          </div>

          {/* 右侧：字段信息 */}
          <div style={{ width: 220, flexShrink: 0 }}>
            <Descriptions
              column={1}
              size="small"
              title="模板信息"
              style={{ marginBottom: 16 }}
            >
              <Descriptions.Item label="名称">{templateName || '—'}</Descriptions.Item>
              <Descriptions.Item label="尺寸">
                {canvasSize.width} × {canvasSize.height} px
              </Descriptions.Item>
              <Descriptions.Item label="动态字段">
                {dynamicFields.length} 个
              </Descriptions.Item>
            </Descriptions>

            {dynamicFields.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#333' }}>
                  字段填充值（mock）
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {dynamicFields.map(({ field, exampleValue }) => (
                    <div
                      key={field.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '4px 0',
                        borderBottom: '1px solid #f0f0f0',
                        fontSize: 11,
                      }}
                    >
                      <span style={{ color: '#666' }}>{field.label}</span>
                      <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>
                        {exampleValue}
                      </Tag>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, fontSize: 11, color: '#999', lineHeight: 1.6 }}>
              样张使用字段注册表中的示例值填充动态字段，
              用于验证模板排版效果。实际打印时将使用真实订单数据。
            </div>
          </div>
        </div>
      </Spin>
    </Modal>
  )
}

export default PrintPreview
