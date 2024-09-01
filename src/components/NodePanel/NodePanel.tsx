import React from 'react'
import styles from './NodePanel.module.scss'
import { CanvasNode } from 'store/types/Template.type'
type Props = {
  activeNode: CanvasNode | undefined | null
}

export default function NodePanel({ activeNode }: Props) {
  if (!activeNode) return <div className={styles.container}>无激活节点</div>
  return <div className={styles.container}>{activeNode.type}</div>
}
