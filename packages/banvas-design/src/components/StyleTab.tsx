import React from 'react'
import { Select } from 'antd'
import type { View } from '@banyuan/banvasgl'

// ── 内联样式 ──

const tabContentStyle: React.CSSProperties = { padding: 12 }

const sectionStyle: React.CSSProperties = {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid rgba(255,255,255,0.07)',
}

const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.35)',
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
    color: 'rgba(255,255,255,0.38)',
    fontSize: 11,
    flexShrink: 0,
    width: 40,
}

// ── 组件 ──

const OVERFLOW_OPTIONS = [
    { value: 'visible', label: 'visible' },
    { value: 'hidden', label: 'hidden' },
    { value: 'scroll', label: 'scroll' },
]

export interface StyleTabProps {
    view: View
}

export const StyleTab: React.FC<StyleTabProps> = ({ view }) => {
    return (
        <div style={tabContentStyle}>
            <section style={sectionStyle}>
                <div style={sectionHeaderStyle}>样式</div>
                <div style={infoRowStyle}>
                    <span style={infoLabelStyle}>overflow</span>
                    <Select
                        size="small"
                        value={view.style?.overflow ?? 'visible'}
                        options={OVERFLOW_OPTIONS}
                        onChange={(val) => {
                            if (view.style) {
                                view.style.overflow = val as 'visible' | 'hidden' | 'scroll'
                            }
                        }}
                        style={{ flex: 1, marginLeft: 8 }}
                    />
                </div>
            </section>
        </div>
    )
}

export default StyleTab
