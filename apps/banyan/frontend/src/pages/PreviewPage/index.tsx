/**
 * PreviewPage — 预览态页面
 *
 * 职责：
 *   - 使用 useRuntimeBanvas 渲染运行态画布（内置 ClickRecognizer + DragRecognizer，
 *     自动归一化 DOM 事件 → hitTest → triggerEvent → FlowSchema 执行）
 *   - 从 store 读取 uiJSON，通过 actions.app.loadAppJSON() 注入引擎
 *   - 从 previewServerStore 读取本地 Preview Server 地址，
 *     设置 app.backendEndpoint 使 callFlow 节点打到本地后端
 *
 * 核心原理：
 *   前端 FlowSchema 中调用云函数通过 callFlow 节点实现，
 *   callFlow 执行器读取 ctx.env.callFlow，而该函数由 Scene.triggerSchema
 *   根据 app.backendEndpoint 自动注入。所以预览态只需设上 endpoint 就行。
 *
 * 生命周期：
 *   mount → 从 ctx 读取 serverInfo.url → 设置 app.backendEndpoint
 *   unmount → 清除 endpoint（Preview Server 由 ApplicationLayout 管理，不在此停止）
 */

import { useEffect, useMemo } from 'react'
import { useRuntimeBanvas } from '@banyuan/banvas-react-runtime'
import { useApplicationStore } from '@/stores/applicationStore'
import { usePreviewServerStore } from '@/stores/previewServerStore'
import styles from './index.module.scss'

const PreviewPage: React.FC = () => {
  const { registerActions, setDesignSize, designSize, designDpr } = useApplicationStore()
  const uiJSON = useApplicationStore((s) => s.uiJSON)
  const serverInfo = usePreviewServerStore((s) => s.serverInfo)
  const serverStatus = usePreviewServerStore((s) => s.status)

  // ── 画布初始化（运行策略：useRuntimeBanvas = 机制底座 + 交互识别 + FlowSchema 触发） ──
  // designSize 通过 actions.app.setDesignSize() 命令式注入
  const rendererOptions = useMemo(() => ({ clearColor: '#fff' }), [])
  const { Banvas, actions } = useRuntimeBanvas({ rendererOptions, dpr: designDpr })

  // ── designSize 命令式注入引擎 ──
  useEffect(() => {
    if (actions?.app) {
      actions.app.setDesignSize(designSize.width, designSize.height)
    }
  }, [actions, designSize.width, designSize.height])

  // ── uiJSON 注入引擎（store 数据就绪时） ──────────────────────────────────
  useEffect(() => {
    if (actions?.app && uiJSON) {
      actions.app.loadAppJSON(uiJSON)
    }
  }, [uiJSON, actions])

  // ── 挂载画布引擎实例到 store + 同步初始 designSize ────────────────────
  useEffect(() => {
    if (!actions?.app) return
    const unregister = registerActions(actions)
    // uiJSON 加载后同步引擎当前 designSize 到 store
    const ds = actions.app.getDesignSize()
    setDesignSize({ width: ds.width, height: ds.height })
    return unregister
  }, [registerActions, setDesignSize, actions])

  // ── 设置 backendEndpoint（指向 Preview Server） ─────────────────────────────
  useEffect(() => {
    if (!actions?.app) return

    if (serverInfo && serverStatus === 'running') {
      actions.app.setBackendEndpoint(serverInfo.url)
    }

    return () => {
      actions.app.setBackendEndpoint(undefined)
    }
  }, [actions, serverInfo, serverStatus])

  return (
    <div className={styles.page}>
      <div className={styles.canvasContainer}>{Banvas}</div>
    </div>
  )
}

export default PreviewPage
