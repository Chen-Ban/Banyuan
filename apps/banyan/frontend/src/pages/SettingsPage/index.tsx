/**
 * SettingsPage — 设置页（占位）
 *
 * 后续扩展：通用设置、账户设置、主题设置等。
 */

import styles from './index.module.scss'

const SettingsPage: React.FC = () => {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <h2 className={styles.title}>设置</h2>
        <p className={styles.placeholder}>设置功能开发中...</p>
      </div>
    </div>
  )
}

export default SettingsPage
