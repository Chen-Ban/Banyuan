/**
 * FunctionDiffPreview 组件
 *
 * AI 返回代码后，展示 diff 预览（新代码 vs 当前代码）。
 * 提供"应用"和"取消"按钮。
 * 使用简单的文本对比展示（pre + 高亮）。
 */

import React, { useMemo } from 'react'
import { Button } from 'antd'
import { CheckOutlined, CloseOutlined } from '@ant-design/icons'
import styles from './FunctionDiffPreview.module.scss'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface FunctionDiffPreviewProps {
  /** 当前代码（修改前） */
  currentCode: string
  /** 新代码（AI 生成） */
  newCode: string
  /** 变更说明 */
  changelog?: string
  /** 点击"应用" */
  onApply: () => void
  /** 点击"取消" */
  onCancel: () => void
  /** 是否正在应用中 */
  applying?: boolean
}

// ─── Diff 行类型 ──────────────────────────────────────────────────────────────

type DiffLineType = 'added' | 'removed' | 'unchanged'

interface DiffLine {
  type: DiffLineType
  content: string
  lineNumber: number | null
  newLineNumber: number | null
}

// ─── 简单 Diff 算法（LCS 基础） ──────────────────────────────────────────────

function computeSimpleDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  // 使用简单的逐行对比（适合中小规模代码）
  const result: DiffLine[] = []
  let oldIdx = 0
  let newIdx = 0

  // 构建 LCS 表
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[])

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // 回溯 LCS 得到 diff
  const lcs: Array<{ oldIdx: number; newIdx: number }> = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      lcs.unshift({ oldIdx: i - 1, newIdx: j - 1 })
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  // 根据 LCS 生成 diff 行
  oldIdx = 0
  newIdx = 0

  for (const match of lcs) {
    // 输出 old 中被删除的行
    while (oldIdx < match.oldIdx) {
      result.push({
        type: 'removed',
        content: oldLines[oldIdx],
        lineNumber: oldIdx + 1,
        newLineNumber: null,
      })
      oldIdx++
    }
    // 输出 new 中新增的行
    while (newIdx < match.newIdx) {
      result.push({
        type: 'added',
        content: newLines[newIdx],
        lineNumber: null,
        newLineNumber: newIdx + 1,
      })
      newIdx++
    }
    // 输出匹配行
    result.push({
      type: 'unchanged',
      content: oldLines[oldIdx],
      lineNumber: oldIdx + 1,
      newLineNumber: newIdx + 1,
    })
    oldIdx++
    newIdx++
  }

  // 处理剩余行
  while (oldIdx < m) {
    result.push({
      type: 'removed',
      content: oldLines[oldIdx],
      lineNumber: oldIdx + 1,
      newLineNumber: null,
    })
    oldIdx++
  }
  while (newIdx < n) {
    result.push({
      type: 'added',
      content: newLines[newIdx],
      lineNumber: null,
      newLineNumber: newIdx + 1,
    })
    newIdx++
  }

  return result
}

// ─── FunctionDiffPreview ──────────────────────────────────────────────────────

const FunctionDiffPreview: React.FC<FunctionDiffPreviewProps> = ({
  currentCode,
  newCode,
  changelog,
  onApply,
  onCancel,
  applying = false,
}) => {
  const diffLines = useMemo(
    () => computeSimpleDiff(currentCode, newCode),
    [currentCode, newCode]
  )

  const hasChanges = diffLines.some((line) => line.type !== 'unchanged')

  return (
    <div className={styles.container}>
      {/* 变更说明 */}
      {changelog && (
        <div className={styles.changelog}>
          <span className={styles.changelogLabel}>变更说明：</span>
          {changelog}
        </div>
      )}

      {/* Diff 展示 */}
      <div className={styles.diffContainer}>
        {!hasChanges ? (
          <div className={styles.noChanges}>代码无变化</div>
        ) : (
          <pre className={styles.diffPre}>
            {diffLines.map((line, idx) => (
              <div
                key={idx}
                className={`${styles.diffLine} ${
                  line.type === 'added'
                    ? styles.lineAdded
                    : line.type === 'removed'
                      ? styles.lineRemoved
                      : ''
                }`}
              >
                <span className={styles.linePrefix}>
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                <span className={styles.lineContent}>{line.content}</span>
              </div>
            ))}
          </pre>
        )}
      </div>

      {/* 操作按钮 */}
      <div className={styles.actions}>
        <Button
          size="small"
          icon={<CloseOutlined />}
          onClick={onCancel}
          disabled={applying}
        >
          取消
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<CheckOutlined />}
          onClick={onApply}
          loading={applying}
          disabled={!hasChanges}
        >
          应用
        </Button>
      </div>
    </div>
  )
}

export default FunctionDiffPreview
