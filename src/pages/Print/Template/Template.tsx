import { useState, useRef, useEffect } from 'react'
import { useTitle } from 'ahooks'
import { Layout, Spin } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import classNames from 'classnames'
import React from 'react'
import styles from './Template.module.scss'
import { TemplateType } from 'store/types/Template.type'
import { PRINT_TEMPLATE } from 'router/index'
import useCanvas from 'hooks/useCanvas'
import useFetchTemplates from 'hooks/useFetchTemplates'

import TemplateList from 'components/PrintTemplate/TemplateList'
import NodePanel from 'src/components/NodePanel/NodePanel'
import { CanvasEleProps, canvasElePros } from 'src/models/CanvasManage/ICanvasManage'
import { useImmer } from 'use-immer'

const { Sider, Content } = Layout
export default function Template() {
  const nav = useNavigate()

  //根据路由过滤不同的组件列表
  const { pathname } = useLocation()
  const [type, setType] = useState(pathname.split('/')[3] as TemplateType)
  const [templateId, setTemplateId] = useState(pathname.split('/')[4])
  //从服务器获取所有模板数据放入store中,并根据id返回模板数据
  const { loading, template } = useFetchTemplates({ templateId })

  //绑定canvas事件
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [canvasEleProps] = useImmer<CanvasEleProps>(canvasElePros)

  const { activeNode } = useCanvas(canvasRef, template, canvasEleProps)

  //根据路由变化设置组件列表
  useEffect(() => {
    const type = pathname.split('/')[3] as TemplateType
    const templateId = pathname.split('/')[4]
    setType(type)
    setTemplateId(templateId)
    const observer = new PerformanceObserver(() => {})
    observer.observe({
      entryTypes: ['paint'],
    })
  }, [pathname])

  useTitle('打印模板')
  return (
    <Layout className={styles.container}>
      {loading ? (
        <Spin></Spin>
      ) : (
        <>
          <Sider className={styles.sider}>
            <div className={styles.siderContentWrapper}>
              <div
                className={classNames({
                  [styles.siderItem]: true,
                  [styles.selectedSiderItem]: type == TemplateType.CUSTOMER,
                })}
                onClick={() => {
                  nav(PRINT_TEMPLATE + '/' + TemplateType.CUSTOMER)
                }}
              >
                顾客联
              </div>
              <div
                className={classNames({
                  [styles.siderItem]: true,
                  [styles.selectedSiderItem]: type == TemplateType.OPTOMETRY,
                })}
                onClick={() => {
                  nav(PRINT_TEMPLATE + '/' + TemplateType.OPTOMETRY)
                }}
              >
                验光联
              </div>
            </div>
          </Sider>
          <Content className={styles.main}>
            <div className={styles.componentsWrapper}>
              <TemplateList />
            </div>
            <div className={styles.canvasBody}>
              <div className={styles.canvasWrapper} style={{ cursor: 'default' }}>
                <canvas ref={canvasRef} key="canvas"></canvas>
              </div>
            </div>
            <div className={styles.componentStatus}>
              <NodePanel activeNode={activeNode}></NodePanel>
            </div>
          </Content>
        </>
      )}
    </Layout>
  )
}
