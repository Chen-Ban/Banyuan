/**
 * ApplicationListPage — 应用列表页 (/applications)
 *
 * 展示所有已创建的应用，支持进入、删除。
 * 顶部提供「新建应用」按钮。
 *
 * 注：返回首页功能已移至全局 Sidebar 导航。
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Spin } from 'antd'
import {
  AppstoreOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { applicationApi } from '@/api'
import type { Application } from '@/api'
import { getErrorMessage } from '@/utils/error'
import styles from './index.module.scss'

const ApplicationListPage = () => {
  const { message } = App.useApp()
  const navigate = useNavigate()

  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  // ── 加载列表 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    applicationApi
      .fetchApplications(1, 100)
      .then((res) => setApplications(res.data.applications))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // ── 删除应用 ─────────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      try {
        await applicationApi.deleteApplication(id)
        setApplications((prev) => prev.filter((a) => a.application_id !== id))
      } catch (err) {
        message.error(getErrorMessage(err))
      }
    },
    [],
  )

  return (
    <div className={styles.page}>
      {/* ── 顶栏 ── */}
      <div className={styles.header}>
        <h2 className={styles.pageTitle}>我的应用</h2>
      </div>

      {/* ── 列表区 ── */}
      <div className={styles.content}>
        {loading ? (
          <div className={styles.loadingWrap}>
            <Spin size="large" />
          </div>
        ) : applications.length === 0 ? (
          <div className={styles.empty}>
            <AppstoreOutlined className={styles.emptyIcon} />
            <p>还没有应用，回首页创建第一个吧</p>
            <button className={styles.emptyBtn} onClick={() => navigate('/')}>
              去创建
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {applications.map((app) => (
              <div
                key={app.application_id}
                className={styles.card}
                onClick={() =>
                  navigate(`/application/${app.application_id}/ui`)
                }
              >
                {app.thumbnail ? (
                  <img
                    src={app.thumbnail}
                    alt={app.name}
                    className={styles.thumb}
                  />
                ) : (
                  <div className={styles.thumbPlaceholder}>
                    <AppstoreOutlined />
                  </div>
                )}
                <div className={styles.cardInfo}>
                  <span className={styles.cardName}>
                    {app.name || '未命名应用'}
                  </span>
                  <span className={styles.cardDate}>
                    {new Date(app.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className={styles.deleteBtn}
                  onClick={(e) => handleDelete(e, app.application_id)}
                  aria-label="删除"
                >
                  <DeleteOutlined />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ApplicationListPage
