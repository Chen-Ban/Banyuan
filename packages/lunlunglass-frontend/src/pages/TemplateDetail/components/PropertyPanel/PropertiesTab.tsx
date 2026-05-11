import React from 'react'
import { Tooltip } from 'antd'
import type { IBanvasActions, IView } from 'banvasgl'
import { GRAPHTYPE } from 'banvasgl'
import NumberInput from './NumberInput'
import styles from './index.module.scss'

const radiansToDegrees = (rad: number) => rad * (180 / Math.PI)
const degreesToRadians = (deg: number) => deg * (Math.PI / 180)

interface PropertiesTabProps {
    view: IView
    selectedViewId: string
    actions: IBanvasActions
    onFocus: () => void
    onBlur: () => void
}

const PropertiesTab: React.FC<PropertiesTabProps> = ({
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
    const isRoundedRect = content && content.type === GRAPHTYPE.ROUNDED_RECT
    const radii: [number, number, number, number] = isRoundedRect ? content.radii : [0, 0, 0, 0]

    // 打印字段绑定
    const viewData = actions.view.getViewData(selectedViewId)
    const printFieldSchema = viewData?.['__printFieldKey']
    const printFieldKey = (printFieldSchema as any)?.value ?? ''

    return (
        <div className={styles.tabContent}>
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
                    <input
                        className={styles.nameInput}
                        value={view.name}
                        onChange={(e) => actions.view.rename(selectedViewId, e.target.value)}
                    />
                </div>
            </section>

            {/* 变换 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>变换</div>
                <div className={styles.transformGrid}>
                    <NumberInput
                        label="X"
                        value={x}
                        onChange={(v) => actions.view.setProperty('x', v)}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        suffix="px"
                    />
                    <NumberInput
                        label="Y"
                        value={y}
                        onChange={(v) => actions.view.setProperty('y', v)}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        suffix="px"
                    />
                    <NumberInput
                        label="W"
                        value={width}
                        onChange={(v) => actions.view.setProperty('width', v)}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        min={1}
                        suffix="px"
                    />
                    <NumberInput
                        label="H"
                        value={height}
                        onChange={(v) => actions.view.setProperty('height', v)}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        min={1}
                        suffix="px"
                    />
                    <NumberInput
                        label="旋转"
                        value={rotationDeg}
                        onChange={(v) => actions.view.setProperty('rotation', degreesToRadians(v))}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        step={1}
                        suffix="°"
                    />
                    <NumberInput
                        label="弧度"
                        value={rotation}
                        onChange={(v) => actions.view.setProperty('rotation', v)}
                        onFocus={onFocus}
                        onBlur={onBlur}
                        step={0.01}
                        precision={4}
                        suffix="rad"
                    />
                </div>
            </section>

            {/* 状态 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>状态</div>
                <div className={styles.stateRow}>
                    <label className={styles.stateLabel}>
                        <input
                            type="checkbox"
                            checked={view.visible}
                            onChange={(e) => actions.view.setVisible(selectedViewId, e.target.checked)}
                        />
                        可见
                    </label>
                    <label className={styles.stateLabel}>
                        <input
                            type="checkbox"
                            checked={view.freezed}
                            onChange={(e) => actions.view.setLocked(selectedViewId, e.target.checked)}
                        />
                        锁定
                    </label>
                </div>
            </section>

            {/* 圆角半径（仅圆角矩形显示） */}
            {isRoundedRect && (
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>圆角</div>
                    <div className={styles.radiiControls}>
                        <div className={styles.radiiUniform}>
                            <NumberInput
                                label="统一圆角"
                                value={radii[0]}
                                onChange={(v) => {
                                    actions.view.setContentMethod('setAllRadii', [v])
                                }}
                                onFocus={onFocus}
                                onBlur={onBlur}
                                min={0}
                                step={1}
                                precision={1}
                                suffix="px"
                            />
                        </div>
                        <div className={styles.transformGrid}>
                            <NumberInput
                                label="左上"
                                value={radii[0]}
                                onChange={(v) => {
                                    actions.view.setContentMethod('setRadius', [0, v])
                                }}
                                onFocus={onFocus}
                                onBlur={onBlur}
                                min={0}
                                step={1}
                                precision={1}
                                suffix="px"
                            />
                            <NumberInput
                                label="右上"
                                value={radii[1]}
                                onChange={(v) => {
                                    actions.view.setContentMethod('setRadius', [1, v])
                                }}
                                onFocus={onFocus}
                                onBlur={onBlur}
                                min={0}
                                step={1}
                                precision={1}
                                suffix="px"
                            />
                            <NumberInput
                                label="右下"
                                value={radii[2]}
                                onChange={(v) => {
                                    actions.view.setContentMethod('setRadius', [2, v])
                                }}
                                onFocus={onFocus}
                                onBlur={onBlur}
                                min={0}
                                step={1}
                                precision={1}
                                suffix="px"
                            />
                            <NumberInput
                                label="左下"
                                value={radii[3]}
                                onChange={(v) => {
                                    actions.view.setContentMethod('setRadius', [3, v])
                                }}
                                onFocus={onFocus}
                                onBlur={onBlur}
                                min={0}
                                step={1}
                                precision={1}
                                suffix="px"
                            />
                        </div>
                    </div>
                </section>
            )}

            {/* 打印字段绑定 */}
            <section className={styles.section}>
                <div className={styles.sectionHeader}>打印</div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>字段Key</span>
                    <input
                        className={styles.nameInput}
                        placeholder="如: orderNo, customerName"
                        value={printFieldKey}
                        onChange={(e) => {
                            const val = e.target.value.trim()
                            if (val) {
                                actions.view.setViewData(selectedViewId, '__printFieldKey', { type: 'string', value: val })
                            } else {
                                actions.view.deleteViewData(selectedViewId, '__printFieldKey')
                            }
                        }}
                        onFocus={onFocus}
                        onBlur={onBlur}
                    />
                </div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel} style={{ fontSize: 11, color: '#999' }}>
                        绑定后此元素将作为打印模板的动态字段
                    </span>
                </div>
            </section>
        </div>
    )
}

export default PropertiesTab
