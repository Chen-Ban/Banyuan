import React from 'react'
import type { IView } from 'banvasgl'
import styles from './index.module.scss'

interface StyleTabProps {
    view: IView
}

const StyleTab: React.FC<StyleTabProps> = ({ view }) => {
    return (
        <div className={styles.tabContent}>
            <section className={styles.section}>
                <div className={styles.sectionHeader}>样式</div>
                <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>overflow</span>
                    <select
                        className={styles.selectInput}
                        value={view.style?.overflow ?? 'visible'}
                        onChange={(e) => {
                            if (view.style) {
                                view.style.overflow = e.target.value as 'visible' | 'hidden' | 'scroll'
                            }
                        }}
                    >
                        <option value="visible">visible</option>
                        <option value="hidden">hidden</option>
                        <option value="scroll">scroll</option>
                    </select>
                </div>
            </section>
        </div>
    )
}

export default StyleTab
