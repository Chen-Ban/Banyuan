/**
 * AppearanceSettings — 外观与主题设置子页面（占位）
 */

import { Typography, Empty } from 'antd'
import styles from './AppearanceSettings.module.scss'

const { Title, Text } = Typography

const AppearanceSettings: React.FC = () => (
  <div className={styles.page}>
    <div className={styles.content}>
      <Title level={3} className={styles.title}>
        设置
      </Title>
      <section className={styles.section}>
        <Title level={5} className={styles.sectionTitle}>
          外观与主题
        </Title>
        <Text type="secondary" className={styles.sectionDesc}>
          自定义界面主题、颜色模式和显示密度。
        </Text>
        <Empty
          description="深色/浅色模式、强调色、界面密度 — 即将上线"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </section>
    </div>
  </div>
)

export default AppearanceSettings
