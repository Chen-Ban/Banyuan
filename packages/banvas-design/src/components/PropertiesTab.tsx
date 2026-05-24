import React from 'react'
import { Input, Tooltip } from 'antd'
import type { IBanvasActions } from '@banyuan/banvasgl'
import { GraphType, View } from '@banyuan/banvasgl'
import { NumberInput } from './NumberInput.js'

// ── 内联样式 ──

const tabContentStyle: React.CSSProperties = { padding: 12 }

const sectionStyle: React.CSSProperties = {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid #ecf0f1',
}

const sectionLastStyle: React.CSSProperties = {
    marginBottom: 16,
    paddingBottom: 12,
}

const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: '#7f8c8d',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
}

const infoRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    minHeight: 26,
}

const infoLabelStyle: React.CSSProperties = {
    color: '#7f8c8d',
    fontSize: 11,
    flexShrink: 0,
    width: 40,
}

const infoValueStyle: React.CSSProperties = {
    color: '#34495e',
    fontSize: 11,
    fontFamily: "'SF Mono', 'Menlo', monospace",
}

const infoValueIdStyle: React.CSSProperties = {
    color: '#95a5a6',
    fontSize: 9,
    fontFamily: "'SF Mono', 'Menlo', monospace",
    cursor: 'pointer',
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'inline-block',
}

const nameInputStyle: React.CSSProperties = {
    flex: 1,
    marginLeft: 4,
}

const transformGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
}

const radiiControlsStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
}

const radiiUniformStyle: React.CSSProperties = {
    marginBottom: 4,
    paddingBottom: 8,
    borderBottom: '1px dashed #ecf0f1',
}

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

    return (
        <div style={tabContentStyle}>
            {/* 基础信息 */}
            <section style={sectionStyle}>
                <div style={sectionHeaderStyle}>基础信息</div>
                <div style={infoRowStyle}>
                    <span style={infoLabelStyle}>类型</span>
                    <span style={infoValueStyle}>{view.type}</span>
                </div>
                <div style={infoRowStyle}>
                    <span style={infoLabelStyle}>ID</span>
                    <Tooltip title={view.id}>
                        <span
                            style={infoValueIdStyle}
                            onClick={() => navigator.clipboard?.writeText(view.id)}
                        >
                            {view.id}
                        </span>
                    </Tooltip>
                </div>
                <div style={infoRowStyle}>
                    <span style={infoLabelStyle}>名称</span>
                    <Input
                        size="small"
                        variant="borderless"
                        style={nameInputStyle}
                        value={view.name}
                        onChange={(e) => actions.view.rename(selectedViewId, e.target.value)}
                    />
                </div>
            </section>

            {/* 变换 */}
            <section style={sectionStyle}>
                <div style={sectionHeaderStyle}>变换</div>
                <div style={transformGridStyle}>
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

            {/* 圆角半径（仅圆角矩形显示） */}
            {isRoundedRect && (
                <section style={sectionLastStyle}>
                    <div style={sectionHeaderStyle}>圆角</div>
                    <div style={radiiControlsStyle}>
                        <div style={radiiUniformStyle}>
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
                        <div style={transformGridStyle}>
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
        </div>
    )
}

export default PropertiesTab
