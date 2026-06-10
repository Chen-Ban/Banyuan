import React from 'react'
import { Select } from 'antd'
import type { View, IBanvasActions } from '@banyuan/banvasgl'
import styles from './index.module.scss'

const OVERFLOW_OPTIONS = [
    { value: 'visible', label: 'visible' },
    { value: 'hidden', label: 'hidden' },
    { value: 'scroll', label: 'scroll' },
]

export interface StyleTabProps {
    view: View
    actions: IBanvasActions
}

export const StyleTab: React.FC<StyleTabProps> = ({ view, actions }) => {
    return (
        <div className={styles.content}>
            <section className={styles.section}>
                <div className={styles.sectionHeader}>样式</div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>overflow</span>
                    <Select
                        size="small"
                        value={view.style?.overflow ?? 'visible'}
                        options={OVERFLOW_OPTIONS}
                        onChange={(val) => {
                            actions.view.setViewStyle(view.id, 'overflow', val)
                        }}
                        style={{ flex: 1, marginLeft: 8 }}
                    />
                </div>
            </section>
        </div>
    )
}

export default StyleTab
