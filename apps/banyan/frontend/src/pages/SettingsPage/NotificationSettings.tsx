/**
 * NotificationSettings — 通知设置子页面（占位）
 */

import { Typography, Empty } from 'antd'
import styles from './NotificationSettings.module.scss'

const { Title, Text } = Typography

const NotificationSettings: React.FC = () => (
  <div className={styles.page}>
    <div className={styles.content}>
      <Title level={3} className={styles.title}>
        设置
      </Title>
      <section className={styles.section}>
        <Title level={5} className={styles.sectionTitle}>
          通知
        </Title>
        <Text type="secondary" className={styles.sectionDesc}>
          管理构建、部署和用量告警等通知偏好。
        </Text>
        <Empty
          description="通知频道与偏好设置 — 即将上线"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </section>
    </div>
  </div>
)

export default NotificationSettings
