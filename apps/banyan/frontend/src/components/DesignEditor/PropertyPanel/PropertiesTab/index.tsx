import React from 'react'
import { Input, Tooltip } from 'antd'
import type { IBanvasActions } from '@banyuan/banvasgl'
import { GraphType, View } from '@banyuan/banvasgl'
import { NumberInput } from '../NumberInput'
import styles from './index.module.scss'

// ── 辅助函数 ──

const radiansToDegrees = (rad: number) => rad * (180 / Math.PI)
const degreesToRadians = (deg: number) => deg * (Math.PI / 180)

// ── 组件 ──

export interface PropertiesTabProps {
    view: View
    selectedViewId: string
    actions: IBanvasActions
    onFocus: () => void
    onBlur: () => void
}

export const PropertiesTab: React.FC<PropertiesTabProps> = ({
    view,
    selectedViewId,
    actions,
    onFocus,
    onBlur,
}) => {
    const x = actions.view.getProperty(selectedViewId, 'x') ?? 0
    const y = actions.view.getProperty(selectedViewId, 'y') ?? 0
    const rotation = actions.view.getProperty(selectedViewId, 'rotation') ?? 0
    const rotationDeg = radiansToDegrees(rotation)
    const width = view.viewport.width
    const height = view.viewport.height

    const content = view.content as any
    const isRoundedRect = content && content.type === GraphType.ROUNDED_RECT
    const radii: [number, number, number, number] = isRoundedRect ? content.radii : [0, 0, 0, 0]

    const isLocked = view.freezed
    const isVisible = view.visible

    return (
        <div className={styles.content}>
            {/* 基础信息 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>基础信息</div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>类型</span>
                    <span className={styles.infoValue}>{view.type}</span>
                </div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>ID</span>
                    <Tooltip title={view.id}>
                        <span
                            className={styles.infoValueId}
                            onClick={() => navigator.clipboard?.writeText(view.id)}
                        >
                            {view.id}
                        </span>
                    </Tooltip>
                </div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>名称</span>
                    <Input
                        size="small"
                        variant="borderless"
                        className={styles.nameInput}
                        value={view.name}
                        onChange={(e) => actions.view.rename(selectedViewId, e.target.value)}
                    />
                </div>
                {/* 锁定 / 隐藏 */}
                <div className={styles.toggleRow}>
                    <button
                        className={isLocked ? styles.toggleBtnLocked : styles.toggleBtnInactive}
                        title={isLocked ? '点击解锁' : '点击锁定'}
                        onClick={() => actions.view.setLocked(selectedViewId, !isLocked)}
                    >
                        {isLocked ? '🔒 已锁定' : '🔓 未锁定'}
                    </button>
                    <button
                        className={!isVisible ? styles.toggleBtnHidden : styles.toggleBtnInactive}
                        title={isVisible ? '点击隐藏' : '点击显示'}
                        onClick={() => actions.view.setVisible(selectedViewId, !isVisible)}
                    >
                        {isVisible ? '👁 可见' : '🙈 已隐藏'}
                    </button>
                </div>
            </section>

            {/* 变换 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>变换</div>
                <div className={styles.transformGrid}>
                    <NumberInput label="X" value={x} onChange={(v) => actions.view.setProperty('x', v)} onFocus={onFocus} onBlur={onBlur} suffix="px" />
                    <NumberInput label="Y" value={y} onChange={(v) => actions.view.setProperty('y', v)} onFocus={onFocus} onBlur={onBlur} suffix="px" />
                    <NumberInput label="W" value={width} onChange={(v) => actions.view.setProperty('width', v)} onFocus={onFocus} onBlur={onBlur} min={1} suffix="px" />
                    <NumberInput label="H" value={height} onChange={(v) => actions.view.setProperty('height', v)} onFocus={onFocus} onBlur={onBlur} min={1} suffix="px" />
                    <NumberInput label="旋转" value={rotationDeg} onChange={(v) => actions.view.setProperty('rotation', degreesToRadians(v))} onFocus={onFocus} onBlur={onBlur} step={1} suffix="°" />
                    <NumberInput label="弧度" value={rotation} onChange={(v) => actions.view.setProperty('rotation', v)} onFocus={onFocus} onBlur={onBlur} step={0.01} precision={4} suffix="rad" />
                </div>
            </section>

            {/* 圆角半径 */}
            {isRoundedRect && (
                <section className={styles.sectionLast}>
                    <div className={styles.sectionHeader}>圆角</div>
                    <div className={styles.radiiControls}>
                        <div className={styles.radiiUniform}>
                            <NumberInput label="统一圆角" value={radii[0]} onChange={(v) => { actions.view.setContentMethod('setAllRadii', [v]) }} onFocus={onFocus} onBlur={onBlur} min={0} step={1} precision={1} suffix="px" />
                        </div>
                        <div className={styles.transformGrid}>
                            <NumberInput label="左上" value={radii[0]} onChange={(v) => { actions.view.setContentMethod('setRadius', [0, v]) }} onFocus={onFocus} onBlur={onBlur} min={0} step={1} precision={1} suffix="px" />
                            <NumberInput label="右上" value={radii[1]} onChange={(v) => { actions.view.setContentMethod('setRadius', [1, v]) }} onFocus={onFocus} onBlur={onBlur} min={0} step={1} precision={1} suffix="px" />
                            <NumberInput label="右下" value={radii[2]} onChange={(v) => { actions.view.setContentMethod('setRadius', [2, v]) }} onFocus={onFocus} onBlur={onBlur} min={0} step={1} precision={1} suffix="px" />
                            <NumberInput label="左下" value={radii[3]} onChange={(v) => { actions.view.setContentMethod('setRadius', [3, v]) }} onFocus={onFocus} onBlur={onBlur} min={0} step={1} precision={1} suffix="px" />
                        </div>
                    </div>
                </section>
            )}
        </div>
    )
}

export default PropertiesTab
