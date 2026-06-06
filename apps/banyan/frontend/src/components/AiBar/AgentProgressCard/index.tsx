/**
 * AgentProgressCard — SubAgent 执行进度卡片（ADR-041）
 *
 * 展示 Orchestrator 管线中各 SubAgent 的执行状态。
 * 通过 agent_progress 事件驱动：
 *   - started: 蓝色脉冲动画
 *   - completed: 绿色对勾
 *   - error: 红色叉号
 */

import {
  CheckOutlined,
  CloseOutlined,
  LoadingOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons'
import type { AgentStep } from '@/hooks/useXiangDi'
import styles from './index.module.scss'

export interface AgentProgressCardProps {
  steps: AgentStep[]
}

/** Agent 名称的友好映射 */
const AGENT_LABELS: Record<string, string> = {
  spec: '规划',
  think: '思考',
  tools: '执行',
  extractPreferences: '记忆',
  layout: '布局',
  style: '样式',
  data: '数据',
  flow: '流程',
}

const AgentProgressCard: React.FC<AgentProgressCardProps> = ({ steps }) => {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <NodeIndexOutlined className={styles.headerIcon} />
        <span className={styles.headerText}>AI 执行中</span>
      </div>

      <div className={styles.steps}>
        {steps.map((step, index) => (
          <div key={step.agent} className={styles.step}>
            {/* 连接线（非第一个） */}
            {index > 0 && (
              <div
                className={`${styles.connector} ${
                  step.status === 'completed' || step.status === 'started'
                    ? styles.connectorActive
                    : ''
                } ${step.status === 'completed' ? styles.connectorCompleted : ''}`}
              />
            )}

            {/* 图标 */}
            <div
              className={`${styles.stepIcon} ${
                step.status === 'started'
                  ? styles.stepIconRunning
                  : step.status === 'completed'
                    ? styles.stepIconCompleted
                    : styles.stepIconFailed
              }`}
            >
              {step.status === 'started' && <LoadingOutlined />}
              {step.status === 'completed' && <CheckOutlined />}
              {step.status === 'error' && <CloseOutlined />}
            </div>

            {/* 标签 */}
            <span
              className={`${styles.stepLabel} ${
                step.status === 'started' ? styles.stepLabelActive : ''
              } ${step.status === 'completed' ? styles.stepLabelCompleted : ''}`}
            >
              {AGENT_LABELS[step.agent] ?? step.agent}
            </span>
          </div>
        ))}
      </div>

      {/* 最新消息 */}
      {steps.length > 0 && steps[steps.length - 1].message && (
        <div className={styles.reasoning}>{steps[steps.length - 1].message}</div>
      )}
    </div>
  )
}

export default AgentProgressCard
