import React, { useState } from 'react'
import { Input, Switch, Select, ColorPicker, Slider } from 'antd'
import { ExpandOutlined, CompressOutlined } from '@ant-design/icons'
import type { IBanvasActions, View } from '@banyuan/banvasgl'
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
    const scaleX = actions.view.getProperty(selectedViewId, 'scaleX') ?? 1
    const scaleY = actions.view.getProperty(selectedViewId, 'scaleY') ?? 1

    const isLocked = view.freezed
    const isVisible = view.visible

    const setStyle = (prop: string, value: unknown) => {
        actions.view.setViewStyle(selectedViewId, prop, value)
    }

    const style = view.style
    const bgColor = style.backgroundColor || '#00000000'
    const opacity = style.opacity ?? 1
    const borderRadiusVal = style.borderRadius ?? 0
    const isBorderRadiusUniform = typeof borderRadiusVal === 'number'
    const borderWidth = style.borderWidth ?? 0
    const borderColor = style.borderColor || '#00000000'
    const clipContent = style.clipContent ?? false
    const overflow = style.overflow ?? 'visible'

    // 圆角展开/收起状态：若是四元数组则初始展开
    const [cornersExpanded, setCornersExpanded] = useState(!isBorderRadiusUniform)

    // 统一圆角值（用于均匀模式输入框展示）
    const uniformRadius = isBorderRadiusUniform ? borderRadiusVal : (borderRadiusVal as number[])[0]

    // 切换展开/收起
    const handleToggleCorners = () => {
        if (cornersExpanded) {
            // 收起：取当前左上角值统一四个角
            const r = (style.borderRadius as number[])?.[0] ?? 0
            setStyle('borderRadius', r)
        } else {
            // 展开：复制均匀值到四个角
            const r = typeof style.borderRadius === 'number' ? style.borderRadius : (style.borderRadius as number[])?.[0] ?? 0
            setStyle('borderRadius', [r, r, r, r])
        }
        setCornersExpanded(!cornersExpanded)
    }

    return (
        <div className={styles.content}>
            {/* 基础信息 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>基础信息</div>
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
                <div className={styles.switchRow}>
                    <span className={styles.switchLabel}>锁定</span>
                    <Switch
                        size="small"
                        checked={isLocked}
                        onChange={(v) => actions.view.setLocked(selectedViewId, v)}
                    />
                </div>
                <div className={styles.switchRow}>
                    <span className={styles.switchLabel}>可见</span>
                    <Switch
                        size="small"
                        checked={isVisible}
                        onChange={(v) => actions.view.setVisible(selectedViewId, v)}
                    />
                </div>
            </section>

            {/* 变换 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>变换</div>
                <div className={styles.transformGrid}>
                    <NumberInput label="X" value={x} onChange={(v) => actions.view.setProperty('x', v)} onFocus={onFocus} onBlur={onBlur} suffix="px" />
                    <NumberInput label="Y" value={y} onChange={(v) => actions.view.setProperty('y', v)} onFocus={onFocus} onBlur={onBlur} suffix="px" />
                    <NumberInput label="宽" value={width} onChange={(v) => actions.view.setProperty('width', v)} onFocus={onFocus} onBlur={onBlur} min={1} suffix="px" />
                    <NumberInput label="高" value={height} onChange={(v) => actions.view.setProperty('height', v)} onFocus={onFocus} onBlur={onBlur} min={1} suffix="px" />
                    <NumberInput label="缩放宽" value={scaleX} onChange={(v) => actions.view.setProperty('scaleX', v)} onFocus={onFocus} onBlur={onBlur} step={0.1} precision={2} min={0.01} />
                    <NumberInput label="缩放高" value={scaleY} onChange={(v) => actions.view.setProperty('scaleY', v)} onFocus={onFocus} onBlur={onBlur} step={0.1} precision={2} min={0.01} />
                    <NumberInput label="旋转" value={rotationDeg} onChange={(v) => actions.view.setProperty('rotation', degreesToRadians(v))} onFocus={onFocus} onBlur={onBlur} step={1} suffix="°" />
                </div>
            </section>

            {/* 容器样式 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>容器样式</div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>背景色</span>
                    <ColorPicker
                        size="small"
                        value={bgColor}
                        onChange={(_, hex) => setStyle('backgroundColor', hex)}
                        showText
                        style={{ flex: 1 }}
                    />
                </div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>透明度</span>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Slider
                            style={{ flex: 1, margin: 0 }}
                            min={0}
                            max={1}
                            step={0.01}
                            value={opacity}
                            onChange={(v) => setStyle('opacity', v)}
                            tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', minWidth: 32, textAlign: 'right' }}>
                            {Math.round(opacity * 100)}%
                        </span>
                    </div>
                </div>
                {/* 圆角：单一输入框 + 展开独立四角 */}
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>圆角</span>
                    <div className={styles.cornerControl}>
                        <div className={styles.cornerInputWrap}>
                            <NumberInput
                                label=""
                                value={uniformRadius}
                                onChange={(v) => {
                                    if (cornersExpanded) {
                                        // 独立模式：同时修改四个角
                                        setStyle('borderRadius', [v, v, v, v])
                                    } else {
                                        setStyle('borderRadius', v)
                                    }
                                }}
                                onFocus={onFocus}
                                onBlur={onBlur}
                                step={1}
                                precision={0}
                                min={0}
                                suffix="px"
                            />
                        </div>
                        <div
                            className={`${styles.cornerToggle} ${cornersExpanded ? styles.cornerToggleActive : ''}`}
                            onClick={handleToggleCorners}
                            title={cornersExpanded ? '统一圆角' : '独立圆角'}
                        >
                            {cornersExpanded ? <CompressOutlined /> : <ExpandOutlined />}
                        </div>
                    </div>
                </div>
                {cornersExpanded && (
                    <div className={styles.transformGrid}>
                        <NumberInput label="左上" value={(style.borderRadius as number[])?.[0] ?? 0} onChange={(v) => { const r = [...(style.borderRadius as number[] ?? [0,0,0,0])]; r[0] = v; setStyle('borderRadius', r) }} onFocus={onFocus} onBlur={onBlur} step={1} precision={0} min={0} suffix="px" />
                        <NumberInput label="右上" value={(style.borderRadius as number[])?.[1] ?? 0} onChange={(v) => { const r = [...(style.borderRadius as number[] ?? [0,0,0,0])]; r[1] = v; setStyle('borderRadius', r) }} onFocus={onFocus} onBlur={onBlur} step={1} precision={0} min={0} suffix="px" />
                        <NumberInput label="右下" value={(style.borderRadius as number[])?.[2] ?? 0} onChange={(v) => { const r = [...(style.borderRadius as number[] ?? [0,0,0,0])]; r[2] = v; setStyle('borderRadius', r) }} onFocus={onFocus} onBlur={onBlur} step={1} precision={0} min={0} suffix="px" />
                        <NumberInput label="左下" value={(style.borderRadius as number[])?.[3] ?? 0} onChange={(v) => { const r = [...(style.borderRadius as number[] ?? [0,0,0,0])]; r[3] = v; setStyle('borderRadius', r) }} onFocus={onFocus} onBlur={onBlur} step={1} precision={0} min={0} suffix="px" />
                    </div>
                )}
                {/* 边框宽 */}
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>边框宽</span>
                    <NumberInput label="" value={borderWidth} onChange={(v) => setStyle('borderWidth', v)} onFocus={onFocus} onBlur={onBlur} step={1} precision={0} min={0} suffix="px" />
                </div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>边框色</span>
                    <ColorPicker
                        size="small"
                        value={borderColor}
                        onChange={(_, hex) => setStyle('borderColor', hex)}
                        showText
                        style={{ flex: 1 }}
                    />
                </div>
                <div className={styles.switchRow}>
                    <span className={styles.switchLabel}>裁剪溢出</span>
                    <Switch
                        size="small"
                        checked={clipContent}
                        onChange={(v) => setStyle('clipContent', v)}
                    />
                </div>
            </section>

            {/* 布局 */}
            <section className={styles.sectionLast}>
                <div className={styles.sectionHeader}>布局</div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>overflow</span>
                    <Select
                        size="small"
                        value={overflow}
                        options={[
                            { value: 'visible', label: 'visible' },
                            { value: 'hidden', label: 'hidden' },
                            { value: 'scroll', label: 'scroll' },
                        ]}
                        onChange={(val) => setStyle('overflow', val)}
                        style={{ flex: 1 }}
                    />
                </div>
            </section>
        </div>
    )
}

export default PropertiesTab
