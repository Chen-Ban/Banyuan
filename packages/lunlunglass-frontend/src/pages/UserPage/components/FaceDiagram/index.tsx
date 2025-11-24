import { useMemo } from 'react'
import type { OptometryParams } from '@/types'
import styles from './index.module.scss'

interface FaceDiagramProps {
  /** 验光参数 */
  params: OptometryParams
  /** SVG宽度 */
  width?: number
  /** SVG高度 */
  height?: number
}

const FaceDiagram = ({ params, width = 420, height = 520 }: FaceDiagramProps) => {
  const centerX = width / 2
  const centerY = height / 2

  // 瞳距转像素：1mm -> 2px
  const pdScale = 2
  const baselineEyeY = centerY - 40
  const phReference = 18
  const phScale = 1.2

  const leftEyeX = centerX - params.pd.left * pdScale
  const rightEyeX = centerX + params.pd.right * pdScale
  const leftEyeY = baselineEyeY + (phReference - params.left.ph) * phScale
  const rightEyeY = baselineEyeY + (phReference - params.right.ph) * phScale

  const pupilRadius = 8
  const eyeRadius = 18

  const mouthY = centerY + 110
  const mouthWidth = 70

  const facePath = useMemo(() => {
    const topY = centerY - 160
    const bottomY = centerY + 170
    const faceWidth = 200

    return `M ${centerX - faceWidth / 2} ${topY}
            Q ${centerX - faceWidth / 2} ${topY - 20} ${centerX - faceWidth / 3} ${topY - 20}
            L ${centerX + faceWidth / 3} ${topY - 20}
            Q ${centerX + faceWidth / 2} ${topY - 20} ${centerX + faceWidth / 2} ${topY}
            L ${centerX + faceWidth / 2} ${bottomY}
            Q ${centerX + faceWidth / 2} ${bottomY + 30} ${centerX} ${bottomY + 30}
            Q ${centerX - faceWidth / 2} ${bottomY + 30} ${centerX - faceWidth / 2} ${bottomY}
            Z`
  }, [centerX, centerY])

  const renderEye = (x: number, y: number, label: string, prescription: OptometryParams['left']) => (
    <g className={styles.eyeGroup}>
      <circle cx={x} cy={y} r={eyeRadius} fill="white" stroke="#333" strokeWidth="2" className={styles.eye} />
      <circle cx={x} cy={y} r={pupilRadius} fill="#333" className={styles.pupil} />
      <circle cx={x - pupilRadius * 0.3} cy={y - pupilRadius * 0.3} r={pupilRadius * 0.3} fill="white" className={styles.pupilHighlight} />
      <text x={x} y={y + eyeRadius + 20} textAnchor="middle" fill="#2c3e50" fontSize="12" className={styles.eyeLabel}>
        {label}
      </text>
      <text x={x} y={y + eyeRadius + 36} textAnchor="middle" fill="#2c3e50" fontSize="11">
        SPH {prescription.sph.toFixed(2)}
      </text>
      <text x={x} y={y + eyeRadius + 52} textAnchor="middle" fill="#2c3e50" fontSize="11">
        CYL {prescription.cyl.toFixed(2)} / AX {prescription.axis.toFixed(0)}
      </text>
      <text x={x} y={y + eyeRadius + 68} textAnchor="middle" fill="#2c3e50" fontSize="11">
        PH {prescription.ph.toFixed(1)} / ADD {prescription.add.toFixed(2)}
      </text>
    </g>
  )

  return (
    <div className={styles.faceDiagram}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={styles.faceSvg}>
        {/* 面部轮廓 */}
        <path d={facePath} fill="#f5e6d3" stroke="#d4a574" strokeWidth="2" className={styles.faceOutline} />

        {/* 左右眼 */}
        {renderEye(leftEyeX, leftEyeY, '左眼', params.left)}
        {renderEye(rightEyeX, rightEyeY, '右眼', params.right)}

        {/* 鼻子（固定形状） */}
        <path
          d={`M ${centerX} ${baselineEyeY - 10} Q ${centerX - 12} ${centerY + 20} ${centerX} ${centerY + 40} Q ${centerX + 12} ${centerY + 20} ${centerX} ${
            baselineEyeY - 10
          }`}
          fill="#f0d9c0"
          stroke="#d4a574"
          strokeWidth="2"
          className={styles.nose}
        />

        {/* 嘴巴 */}
        <path
          d={`M ${centerX - mouthWidth / 2} ${mouthY} Q ${centerX} ${mouthY + 20} ${centerX + mouthWidth / 2} ${mouthY}`}
          fill="none"
          stroke="#d4a574"
          strokeWidth="3"
          strokeLinecap="round"
          className={styles.mouth}
        />

        {/* 瞳距标注线 */}
        <g className={styles.pdAnnotation}>
          <line
            x1={leftEyeX}
            y1={baselineEyeY - eyeRadius - 25}
            x2={rightEyeX}
            y2={baselineEyeY - eyeRadius - 25}
            stroke="#1890ff"
            strokeWidth="2"
            strokeDasharray="5,5"
          />
          <text x={centerX} y={baselineEyeY - eyeRadius - 30} textAnchor="middle" fill="#1890ff" fontSize="12" fontWeight="bold">
            PD L {params.pd.left.toFixed(1)}mm / R {params.pd.right.toFixed(1)}mm
          </text>
        </g>
      </svg>
    </div>
  )
}

export default FaceDiagram

