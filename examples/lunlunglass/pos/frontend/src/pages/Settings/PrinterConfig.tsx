import { useState, useEffect, useCallback } from 'react'
import { Card, Form, Input, InputNumber, Select, Button, Space, message, Alert, Radio } from 'antd'
import { SaveOutlined, ApiOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { printApi } from '@/api'
import type { PrinterConfig } from '@/api/print'
import { getErrorMessage } from '@/utils/error'
import styles from './PrinterConfig.module.scss'

const { Option } = Select

/**
 * POS 设置页面 — 打印机配置区域
 *
 * 读写 ~/.lunlunglass-pos/printer.json（通过后端 API）
 * 支持选择连接方式（USB / 局域网 / 文件）
 * 提供"测试连接"按钮
 */
const PrinterConfigPage = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm<PrinterConfig>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [connectionType, setConnectionType] = useState<'tcp' | 'usb' | 'file'>('tcp')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // 加载当前打印机配置
  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await printApi.getPrinterConfig()
      if (res.data) {
        form.setFieldsValue(res.data)
        setConnectionType(res.data.type)
      }
    } catch {
      message.error('加载打印机配置失败')
    } finally {
      setLoading(false)
    }
  }, [form])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // 保存打印机配置
  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      await printApi.savePrinterConfig(values)
      message.success('打印机配置已保存')
      setTestResult(null)
    } catch (error: unknown) {
      if ((error as { errorFields?: unknown[] })?.errorFields) {
        // 表单验证失败，antd 会自动展示错误
        return
      }
      message.error(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }, [form])

  // 测试打印机连接
  const handleTestConnection = useCallback(async () => {
    try {
      const values = await form.validateFields()
      setTesting(true)
      setTestResult(null)
      const res = await printApi.testPrinterConnection(values)
      const data = res.data
      if (data) {
        setTestResult({ success: data.connected, message: data.message })
      } else {
        setTestResult({ success: false, message: '未获得测试结果' })
      }
    } catch (error: unknown) {
      if ((error as { errorFields?: unknown[] })?.errorFields) {
        return
      }
      setTestResult({ success: false, message: getErrorMessage(error) })
    } finally {
      setTesting(false)
    }
  }, [form])

  // 连接类型改变时清空 address
  const handleTypeChange = useCallback(
    (type: 'tcp' | 'usb' | 'file') => {
      setConnectionType(type)
      form.setFieldValue('address', '')
      setTestResult(null)
    },
    [form]
  )

  const handleBack = useCallback(() => {
    navigate('/')
  }, [navigate])

  return (
    <div className={styles.printerConfigPage}>
      <div className={styles.header}>
        <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回首页
        </Button>
        <h2>打印机配置</h2>
      </div>

      <Card loading={loading} className={styles.configCard}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'tcp', address: '', timeout: 5000 }}
        >
          <Form.Item
            label="连接方式"
            name="type"
            rules={[{ required: true, message: '请选择连接方式' }]}
          >
            <Radio.Group onChange={(e) => handleTypeChange(e.target.value)}>
              <Radio.Button value="tcp">局域网（TCP/IP）</Radio.Button>
              <Radio.Button value="usb">USB 串口</Radio.Button>
              <Radio.Button value="file">文件输出（调试）</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {connectionType === 'tcp' && (
            <>
              <Form.Item
                label="打印机地址"
                name="address"
                rules={[
                  { required: true, message: '请输入打印机 IP 地址和端口' },
                  {
                    pattern: /^[\d.]+:\d+$/,
                    message: '格式：IP:端口，如 192.168.1.100:9100',
                  },
                ]}
                extra="格式：IP:端口，如 192.168.1.100:9100"
              >
                <Input placeholder="192.168.1.100:9100" />
              </Form.Item>
              <Form.Item
                label="连接超时（毫秒）"
                name="timeout"
                rules={[{ type: 'number', min: 1000, message: '超时时间至少 1000ms' }]}
              >
                <InputNumber
                  placeholder="5000"
                  min={1000}
                  max={30000}
                  step={1000}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </>
          )}

          {connectionType === 'usb' && (
            <Form.Item
              label="USB 设备路径"
              name="address"
              rules={[{ required: true, message: '请输入 USB 设备路径' }]}
              extra="如 /dev/ttyUSB0（Linux/macOS）或 COM3（Windows）"
            >
              <Select
                placeholder="请选择或输入设备路径"
                showSearch
                allowClear
              >
                <Option value="/dev/ttyUSB0">/dev/ttyUSB0</Option>
                <Option value="/dev/ttyUSB1">/dev/ttyUSB1</Option>
                <Option value="/dev/usb/lp0">/dev/usb/lp0</Option>
                <Option value="/dev/cu.usbserial">/dev/cu.usbserial (macOS)</Option>
                <Option value="COM3">COM3</Option>
                <Option value="COM4">COM4</Option>
              </Select>
            </Form.Item>
          )}

          {connectionType === 'file' && (
            <Form.Item
              label="输出文件路径"
              name="address"
              rules={[{ required: true, message: '请输入输出文件路径' }]}
              extra="调试模式：ESC/POS 数据将输出到指定文件"
            >
              <Input placeholder="/tmp/printer-output.bin" />
            </Form.Item>
          )}

          {testResult && (
            <Form.Item>
              <Alert
                type={testResult.success ? 'success' : 'error'}
                message={testResult.success ? '连接成功' : '连接失败'}
                description={testResult.message}
                showIcon
              />
            </Form.Item>
          )}

          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={handleSave}
              >
                保存配置
              </Button>
              <Button
                icon={<ApiOutlined />}
                loading={testing}
                onClick={handleTestConnection}
              >
                测试连接
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default PrinterConfigPage
