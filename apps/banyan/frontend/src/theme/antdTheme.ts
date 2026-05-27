// ─────────────────────────────────────────────────────────────────────────────
// Ant Design 深色主题配置
// 与 CSS Custom Properties 保持一致，通过 ConfigProvider 注入
// ─────────────────────────────────────────────────────────────────────────────

import { theme } from 'antd'
import type { ThemeConfig } from 'antd'

export const banyanTheme: ThemeConfig = {
    algorithm: theme.darkAlgorithm,
    token: {
        // ── 品牌色 ──────────────────────────────────────────────────────────
        colorPrimary:   '#8b5cf6',   // violet-500，与 --color-brand 一致
        colorInfo:      '#3b82f6',   // blue-500，与 --color-info 一致
        colorSuccess:   '#22c55e',
        colorWarning:   '#f59e0b',
        colorError:     '#ef4444',

        // ── 背景 ────────────────────────────────────────────────────────────
        colorBgBase:        '#09090b',   // --color-bg-base
        colorBgLayout:      '#18181b',   // --color-bg-primary
        colorBgContainer:   '#1e1e23',   // --color-bg-secondary
        colorBgElevated:    '#27272a',   // --color-bg-elevated
        colorBgSpotlight:   '#2e2e33',   // --color-bg-overlay

        // ── 文字（darkAlgorithm 会基于 colorTextBase 自动推导四级文字色）──
        colorTextBase: '#ffffff',
        // colorText:           rgba(255,255,255,0.88)  ← 算法推导
        // colorTextSecondary:  rgba(255,255,255,0.65)
        // colorTextTertiary:   rgba(255,255,255,0.45)
        // colorTextQuaternary: rgba(255,255,255,0.25)

        // ── 边框 ────────────────────────────────────────────────────────────
        colorBorder:          'rgba(255, 255, 255, 0.10)',
        colorBorderSecondary: 'rgba(255, 255, 255, 0.06)',
        colorSplit:           'rgba(255, 255, 255, 0.06)',

        // ── 字体 ────────────────────────────────────────────────────────────
        fontFamily: `-apple-system, BlinkMacSystemFont, 'Inter', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`,
        fontSize:   13,

        // ── 圆角 ────────────────────────────────────────────────────────────
        borderRadius:   6,
        borderRadiusSM: 4,
        borderRadiusLG: 8,
        borderRadiusXS: 2,

        // ── 间距 ────────────────────────────────────────────────────────────
        padding:   16,
        paddingSM: 12,
        paddingXS: 8,
        paddingLG: 24,

        // ── 动效 ────────────────────────────────────────────────────────────
        motionDurationFast: '0.10s',
        motionDurationMid:  '0.15s',
        motionDurationSlow: '0.20s',
    },
    components: {
        // ── Button ──────────────────────────────────────────────────────────
        Button: {
            primaryShadow:  'none',
            defaultShadow:  'none',
            dangerShadow:   'none',
            colorBgContainer: 'rgba(255, 255, 255, 0.05)',
            defaultBorderColor: 'rgba(255, 255, 255, 0.10)',
        },

        // ── Input ───────────────────────────────────────────────────────────
        Input: {
            colorBgContainer:   '#27272a',
            activeBorderColor:  '#8b5cf6',
            hoverBorderColor:   'rgba(255, 255, 255, 0.20)',
            activeShadow:       '0 0 0 2px rgba(139, 92, 246, 0.15)',
        },

        // ── Select ──────────────────────────────────────────────────────────
        Select: {
            colorBgContainer:   '#27272a',
            colorBgElevated:    '#2e2e33',
            optionActiveBg:     'rgba(255, 255, 255, 0.06)',
            optionSelectedBg:   'rgba(139, 92, 246, 0.15)',
            optionSelectedColor: '#a78bfa',
        },

        // ── Modal ───────────────────────────────────────────────────────────
        Modal: {
            contentBg:  '#13131a',
            headerBg:   '#13131a',
            footerBg:   '#13131a',
        },

        // ── Drawer ──────────────────────────────────────────────────────────
        Drawer: {
            colorBgElevated: '#1a1a2e',
        },

        // ── Tabs ────────────────────────────────────────────────────────────
        Tabs: {
            inkBarColor:        '#8b5cf6',
            itemActiveColor:    '#a78bfa',
            itemSelectedColor:  '#a78bfa',
            itemHoverColor:     'rgba(255, 255, 255, 0.70)',
            itemColor:          'rgba(255, 255, 255, 0.55)',
            cardBg:             'transparent',
        },

        // ── Table ───────────────────────────────────────────────────────────
        Table: {
            colorBgContainer:   '#1e1e23',
            headerBg:           '#27272a',
            rowHoverBg:         'rgba(255, 255, 255, 0.03)',
            borderColor:        'rgba(255, 255, 255, 0.07)',
        },

        // ── Card ────────────────────────────────────────────────────────────
        Card: {
            colorBgContainer:   '#1e1e23',
            colorBorderSecondary: 'rgba(255, 255, 255, 0.08)',
        },

        // ── Message ─────────────────────────────────────────────────────────
        Message: {
            contentBg: '#27272a',
        },

        // ── Spin ────────────────────────────────────────────────────────────
        Spin: {
            colorPrimary: '#8b5cf6',
        },

        // ── Switch ──────────────────────────────────────────────────────────
        Switch: {
            colorPrimary:       '#8b5cf6',
            colorPrimaryHover:  '#a78bfa',
        },

        // ── Tag ─────────────────────────────────────────────────────────────
        Tag: {
            defaultBg:      'rgba(255, 255, 255, 0.06)',
            defaultColor:   'rgba(255, 255, 255, 0.65)',
        },

        // ── Tooltip ─────────────────────────────────────────────────────────
        Tooltip: {
            colorBgSpotlight: '#2e2e33',
            colorTextLightSolid: 'rgba(255, 255, 255, 0.88)',
        },
    },
}
