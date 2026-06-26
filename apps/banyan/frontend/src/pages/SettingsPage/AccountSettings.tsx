/**
 * AccountSettings — 账户与安全设置子页面（占位）
 */

import { Typography, Empty } from 'antd'
import styles from './AccountSettings.module.scss'

const { Title, Text } = Typography

const AccountSettings: React.FC = () => (
  <div className={styles.page}>
    <div className={styles.content}>
      <Title level={3} className={styles.title}>
        设置
      </Title>
      <section className={styles.section}>
        <Title level={5} className={styles.sectionTitle}>
          账户与安全
        </Title>
        <Text type="secondary" className={styles.sectionDesc}>
          管理个人信息、密码和登录会话。
        </Text>
        <Empty
          description="个人信息编辑、密码修改、会话管理 — 即将上线"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </section>
    </div>
  </div>
)

export default AccountSettings
