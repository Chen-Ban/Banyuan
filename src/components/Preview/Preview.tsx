import React from 'react'
import { createPortal } from 'react-dom'
import { Button, Space } from 'antd'

import Icon from 'components/Icon/Icon'
import styles from './Preview.module.scss'

type Props = {
  imgUrl: string
  cancelPreview: () => void
  print: () => void
}

export default function Preview({ imgUrl, cancelPreview, print }: Props) {
  const popup = (
    <div className={styles.container} onClick={cancelPreview}>
      <div className={styles.content} onClick={(e) => e.stopPropagation()}>
        <Icon style={{ position: 'absolute', right: '20px', top: '20px' }} type="cancel" onClick={cancelPreview}></Icon>
        <div className={styles.previewContent}>
          <img src={imgUrl} alt="预览图出错了" />
        </div>
        <div className={styles.functionBar}>
          <Space>
            <Button type="primary" onClick={print}>
              打印
            </Button>
            <Button onClick={cancelPreview}>取消</Button>
          </Space>
        </div>
      </div>
    </div>
  )
  return createPortal(imgUrl ? popup : <></>, document.getElementsByTagName('body')[0], 'popup-preview')
}
