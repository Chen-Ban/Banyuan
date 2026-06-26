/**
 * GeneralSettings — 通用偏好设置子页面（占位）
 */

import { Typography, Empty } from 'antd'
import styles from './GeneralSettings.module.scss'

const { Title, Text } = Typography

const GeneralSettings: React.FC = () => (
  <div className={styles.page}>
    <div className={styles.content}>
      <Title level={3} className={styles.title}>
        设置
      </Title>
      <section className={styles.section}>
        <Title level={5} className={styles.sectionTitle}>
          通用偏好
        </Title>
        <Text type="secondary" className={styles.sectionDesc}>
          默认预览设备、界面语言、自动保存等全局偏好设置。
        </Text>
        <Empty
          description="设备默认值、语言切换、自动保存间隔 — 即将上线"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </section>
    </div>
  </div>
)

export default GeneralSettings
