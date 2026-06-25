import { Slider, Row, Col, InputNumber, Typography } from 'antd'
import type { OptometryParams } from '@/types'
import styles from './index.module.scss'

const { Title } = Typography

interface OptometryControlsProps {
  params: OptometryParams
  onChange: (params: OptometryParams) => void
}

const SLIDER_COMMON = {
  sph: { min: -15, max: 10, step: 0.25, label: 'SPH (球镜)', unit: 'D' },
  cyl: { min: -6, max: 6, step: 0.25, label: 'CYL (柱镜)', unit: 'D' },
  axis: { min: 0, max: 180, step: 1, label: 'AXIS (轴位)', unit: '°' },
  ph: { min: 10, max: 35, step: 0.5, label: 'PH (瞳高)', unit: 'mm' },
  add: { min: 0, max: 3.5, step: 0.25, label: 'ADD (下加光)', unit: 'D' },
} as const

const OptometryControls = ({ params, onChange }: OptometryControlsProps) => {
  const handleEyeChange = (eye: 'left' | 'right', key: keyof OptometryParams['left'], value: number) => {
    onChange({
      ...params,
      [eye]: {
        ...params[eye],
        [key]: value,
      },
    })
  }

  const handlePdChange = (side: 'left' | 'right', value: number) => {
    onChange({
      ...params,
      pd: {
        ...params.pd,
        [side]: value,
      },
    })
  }

  const renderEyeControls = (eye: 'left' | 'right', title: string) => (
    <Col xs={24} lg={12}>
      <div className={styles.eyePanel}>
        <Title level={5}>{title}</Title>
        {Object.entries(SLIDER_COMMON).map(([key, config]) => (
          <div key={key} className={styles.controlItem}>
            <div className={styles.controlLabel}>
              <span>{config.label}</span>
              <InputNumber
                min={config.min}
                max={config.max}
                step={config.step}
                value={params[eye][key as keyof OptometryParams['left']]}
                onChange={(value) =>
                  value !== null && handleEyeChange(eye, key as keyof OptometryParams['left'], value)
                }
                addonAfter={config.unit}
                style={{ width: 140 }}
              />
            </div>
            <Slider
              min={config.min}
              max={config.max}
              step={config.step}
              value={params[eye][key as keyof OptometryParams['left']]}
              onChange={(value) => handleEyeChange(eye, key as keyof OptometryParams['left'], value)}
              tooltip={{ formatter: (value) => `${value}${config.unit}` }}
            />
          </div>
        ))}
      </div>
    </Col>
  )

  return (
    <div className={styles.optometryControls}>
      <Row gutter={[16, 16]}>
        {/* 瞳距 */}
        <Col xs={24} lg={12}>
          <div className={styles.controlItem}>
            <div className={styles.controlLabel}>
              <span>左眼瞳距 (PD-L)</span>
              <InputNumber
                min={25}
                max={40}
                step={0.5}
                value={params.pd.left}
                onChange={(value) => value !== null && handlePdChange('left', value)}
                addonAfter="mm"
                style={{ width: 140 }}
              />
            </div>
            <Slider
              min={25}
              max={40}
              step={0.5}
              value={params.pd.left}
              onChange={(value) => handlePdChange('left', value)}
              tooltip={{ formatter: (value) => `${value}mm` }}
            />
          </div>
        </Col>
        <Col xs={24} lg={12}>
          <div className={styles.controlItem}>
            <div className={styles.controlLabel}>
              <span>右眼瞳距 (PD-R)</span>
              <InputNumber
                min={25}
                max={40}
                step={0.5}
                value={params.pd.right}
                onChange={(value) => value !== null && handlePdChange('right', value)}
                addonAfter="mm"
                style={{ width: 140 }}
              />
            </div>
            <Slider
              min={25}
              max={40}
              step={0.5}
              value={params.pd.right}
              onChange={(value) => handlePdChange('right', value)}
              tooltip={{ formatter: (value) => `${value}mm` }}
            />
          </div>
        </Col>

        {/* 左右眼参数 */}
        {renderEyeControls('left', '左眼参数')}
        {renderEyeControls('right', '右眼参数')}
      </Row>
    </div>
  )
}

export default OptometryControls
