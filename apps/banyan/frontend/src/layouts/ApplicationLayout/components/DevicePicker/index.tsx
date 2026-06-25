/**
 * DevicePicker — 机型选择器
 *
 * 顶部栏左侧的机型下拉，从 DEVICE_GROUPS 构造分组菜单，
 * 选择后直接通过 useApplicationStore().changeDesignSize 更新设计尺寸，
 * 并通过 setDeviceType 同步设备类型给画布装饰。
 */

import React, { useState } from 'react'
import { Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { LaptopOutlined, DownOutlined } from '@ant-design/icons'
import { useApplicationStore } from '@/stores/applicationStore'
import { DEVICE_GROUPS, ALL_DEVICE_PRESETS } from '../../constants'
import styles from '../../index.module.scss'

const DevicePicker: React.FC = () => {
  const { designSize, changeDesignSize, setDeviceType } = useApplicationStore()
  const [deviceDropdownOpen, setDeviceDropdownOpen] = useState(false)

  const deviceMenuItems: MenuProps['items'] = DEVICE_GROUPS.flatMap((group) => {
    const GroupIcon = group.icon
    return [
      { key: `group-${group.group}`, type: 'group' as const, label: group.group },
      ...group.items.map((preset) => ({
        key: preset.key,
        icon: <GroupIcon />,
        label: `${preset.label}（${preset.width}×${preset.height}）`,
        onClick: () => {
          changeDesignSize({ width: preset.width, height: preset.height }, preset.dpr)
          setDeviceType(preset.deviceType)
        },
      })),
    ]
  })

  // 当前选中的设备标签
  const currentDeviceLabel =
    ALL_DEVICE_PRESETS.find((p) => p.width === designSize.width && p.height === designSize.height)?.label ??
    `${designSize.width}×${designSize.height}`

  return (
    <Dropdown
      menu={{ items: deviceMenuItems }}
      trigger={['click']}
      placement="bottomLeft"
      open={deviceDropdownOpen}
      onOpenChange={setDeviceDropdownOpen}
    >
      <button className={styles.devicePicker}>
        <LaptopOutlined />
        <span className={styles.deviceLabel}>{currentDeviceLabel}</span>
        <DownOutlined
          className={`${styles.deviceArrow}${deviceDropdownOpen ? ` ${styles.deviceArrowOpen}` : ''}`}
        />
      </button>
    </Dropdown>
  )
}

export default DevicePicker
