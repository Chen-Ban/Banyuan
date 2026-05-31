/**
 * PlanningCard — Multi-Agent 规划进度卡片
 *
 * 展示 PM → Arch → Visual → Task 四个 SubAgent 的执行进度。
 * 每个 Agent 完成后通过 planning_progress 事件更新状态：
 *   - pending: 灰色圆点
 *   - running: 蓝色脉冲动画
 *   - completed: 绿色对勾
 *   - failed: 红色叉号
 *
 * 底部展示当前正在执行 / 最近完成的 Agent 推理摘要。
 */

import {
  CheckOutlined,
  CloseOutlined,
  LoadingOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons'
import type { PlanningStep } from '@/hooks/useXiangDi'
import styles from './index.module.scss'

export interface PlanningCardProps {
  steps: PlanningStep[]
}

/** Agent 角色的友好名称 */
const AGENT_LABELS: Record<string, string> = {
  pm: '需求',
  arch: '架构',
  visual: '视觉',
  task: '任务',
}

const PlanningCard: React.FC<PlanningCardProps> = ({ steps }) => {
  // 找到最近一条有 reasoning 的 step（优先 running → 最后 completed）
  const latestReasoning = (() => {
    const running = steps.find((s) => s.status === 'running' && s.reasoning)
    if (running?.reasoning) return running.reasoning
    // 倒序查找最后一个有 reasoning 的已完成步骤
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].status === 'completed' && steps[i].reasoning) {
        return steps[i].reasoning
      }
    }
    return null
  })()

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <NodeIndexOutlined className={styles.headerIcon} />
        <span className={styles.headerText}>AI 规划中</span>
      </div>

      <div className={styles.steps}>
        {steps.map((step, index) => (
          <div key={step.agent} className={styles.step}>
            {/* 连接线（非第一个） */}
            {index > 0 && (
              <div
                className={`${styles.connector} ${
                  step.status === 'completed' || step.status === 'running'
                    ? styles.connectorActive
                    : ''
                } ${step.status === 'completed' ? styles.connectorCompleted : ''}`}
              />
            )}

            {/* 图标 */}
            <div
              className={`${styles.stepIcon} ${
                step.status === 'pending'
                  ? styles.stepIconPending
                  : step.status === 'running'
                    ? styles.stepIconRunning
                    : step.status === 'completed'
                      ? styles.stepIconCompleted
                      : styles.stepIconFailed
              }`}
            >
              {step.status === 'pending' && <span>{index + 1}</span>}
              {step.status === 'running' && <LoadingOutlined />}
              {step.status === 'completed' && <CheckOutlined />}
              {step.status === 'failed' && <CloseOutlined />}
            </div>

            {/* 标签 */}
            <span
              className={`${styles.stepLabel} ${
                step.status === 'running' ? styles.stepLabelActive : ''
              } ${step.status === 'completed' ? styles.stepLabelCompleted : ''}`}
            >
              {AGENT_LABELS[step.agent] ?? step.agent}
            </span>
          </div>
        ))}
      </div>

      {latestReasoning && (
        <div className={styles.reasoning}>{latestReasoning}</div>
      )}
    </div>
  )
}

export default PlanningCard
